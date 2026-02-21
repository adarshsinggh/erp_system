// =============================================================
// File: server/services/work-order.service.ts
// Module: Manufacturing — Phase 8, Steps 32 & 33
// Description: Work Order management with full lifecycle +
//              BOM explosion + material issue & consumption.
//
// Status lifecycle:
//   draft → approved → material_issued → in_progress →
//   completed → closed  (or cancelled from draft/approved)
//
// BOM Explosion: On create, BOM lines are exploded into
// work_order_materials with planned_quantity scaled to
// work order quantity.
//
// Material Issue: Deducts raw materials from source warehouse
// via stock ledger engine. Updates issued_quantity on WO materials.
//
// Material Consumption: Records actual consumption vs issued.
// Calculates variance (quantity + percentage).
//
// Material Return: Returns unused issued material back to warehouse.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { inventoryService, StockMovementInput } from './inventory.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface CreateWorkOrderInput {
  company_id: string;
  branch_id: string;
  work_order_date: string;
  product_id: string;
  bom_header_id: string;
  planned_quantity: number;
  uom_id: string;
  planned_start_date?: string;
  planned_end_date?: string;
  source_warehouse_id: string;
  target_warehouse_id: string;
  sales_order_id?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  internal_notes?: string;
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface UpdateWorkOrderInput {
  work_order_date?: string;
  planned_quantity?: number;
  planned_start_date?: string;
  planned_end_date?: string;
  source_warehouse_id?: string;
  target_warehouse_id?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  internal_notes?: string;
  metadata?: Record<string, any>;
  updated_by?: string;
}

export interface MaterialIssueLineInput {
  material_id: string; // work_order_materials.id
  issue_quantity: number;
  batch_id?: string;
}

export interface MaterialConsumeLineInput {
  material_id: string;
  consumed_quantity: number;
  wastage_quantity?: number;
}

export interface MaterialReturnLineInput {
  material_id: string;
  return_quantity: number;
  batch_id?: string;
}

export interface ListWorkOrdersOptions extends ListOptions {
  branch_id?: string;
  product_id?: string;
  priority?: string;
  from_date?: string;
  to_date?: string;
  sales_order_id?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }
function parseNum(val: any): number { return parseFloat(val) || 0; }

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class WorkOrderService extends BaseService {
  constructor() {
    super('work_orders');
  }

  // ──────── CREATE WITH BOM EXPLOSION ────────

  async createWorkOrder(input: CreateWorkOrderInput) {
    return await this.db.transaction(async (trx) => {
      // Validate product
      const product = await trx('products')
        .where({ id: input.product_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!product) throw new Error('Product not found');

      // Validate BOM
      const bom = await trx('bom_headers')
        .where({ id: input.bom_header_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!bom) throw new Error('BOM not found');
      if (bom.product_id !== input.product_id) {
        throw new Error('BOM does not belong to the specified product');
      }
      if (bom.status !== 'active') {
        throw new Error('BOM must be in active status');
      }

      // Validate warehouses
      const srcWh = await trx('warehouses')
        .where({ id: input.source_warehouse_id, company_id: input.company_id, is_deleted: false }).first();
      if (!srcWh) throw new Error('Source warehouse not found');

      const tgtWh = await trx('warehouses')
        .where({ id: input.target_warehouse_id, company_id: input.company_id, is_deleted: false }).first();
      if (!tgtWh) throw new Error('Target warehouse not found');

      // Generate document number
      const [numResult] = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'work_order') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const woNumber = numResult?.rows?.[0]?.doc_number || numResult?.[0]?.doc_number || numResult?.doc_number;
      if (!woNumber) throw new Error('Failed to generate work order number. Check document_sequences.');

      // Get BOM lines for explosion
      const bomLines = await trx('bom_lines')
        .where({ bom_header_id: input.bom_header_id, company_id: input.company_id, is_deleted: false })
        .orderBy('line_number');

      if (bomLines.length === 0) {
        throw new Error('BOM has no components. Cannot create work order.');
      }

      // Calculate planned cost from BOM
      const outputQty = parseNum(bom.output_quantity) || 1;
      const multiplier = input.planned_quantity / outputQty;

      let plannedCost = 0;
      const materialInserts: Record<string, any>[] = [];

      for (let i = 0; i < bomLines.length; i++) {
        const bl = bomLines[i];
        const plannedQty = round4(parseNum(bl.quantity) * multiplier);
        const wastagePct = parseNum(bl.wastage_pct);
        const plannedWithWastage = round4(plannedQty * (1 + wastagePct / 100));

        // Resolve unit cost from item/product
        let unitCost = 0;
        if (bl.component_item_id) {
          const item = await trx('items').where({ id: bl.component_item_id }).select('purchase_price', 'standard_cost').first();
          unitCost = parseNum(item?.standard_cost) || parseNum(item?.purchase_price);
        } else if (bl.component_product_id) {
          const prod = await trx('products').where({ id: bl.component_product_id }).select('standard_cost').first();
          unitCost = parseNum(prod?.standard_cost);
        }

        const totalCost = round2(plannedWithWastage * unitCost);
        plannedCost += totalCost;

        materialInserts.push({
          company_id: input.company_id,
          work_order_id: null, // set after header insert
          line_number: i + 1,
          component_type: bl.component_type || 'item',
          component_item_id: bl.component_item_id || null,
          component_product_id: bl.component_product_id || null,
          bom_line_id: bl.id,
          planned_quantity: plannedWithWastage,
          issued_quantity: 0,
          consumed_quantity: 0,
          returned_quantity: 0,
          wastage_quantity: 0,
          uom_id: bl.uom_id,
          unit_cost: round4(unitCost),
          total_cost: totalCost,
          batch_id: null,
          variance_quantity: null,
          variance_pct: null,
          created_by: input.created_by || null,
        });
      }

      // Insert header
      const [header] = await trx('work_orders')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          work_order_number: woNumber,
          work_order_date: input.work_order_date,
          product_id: input.product_id,
          bom_header_id: input.bom_header_id,
          planned_quantity: input.planned_quantity,
          completed_quantity: 0,
          scrap_quantity: 0,
          uom_id: input.uom_id,
          planned_start_date: input.planned_start_date || null,
          planned_end_date: input.planned_end_date || null,
          source_warehouse_id: input.source_warehouse_id,
          target_warehouse_id: input.target_warehouse_id,
          sales_order_id: input.sales_order_id || null,
          planned_cost: round2(plannedCost),
          actual_cost: 0,
          priority: input.priority || 'normal',
          status: 'draft',
          internal_notes: input.internal_notes || null,
          metadata: input.metadata || {},
          created_by: input.created_by || null,
        })
        .returning('*');

      // Insert materials with work_order_id
      for (const m of materialInserts) {
        m.work_order_id = header.id;
      }
      const insertedMaterials = await trx('work_order_materials')
        .insert(materialInserts)
        .returning('*');

      return { ...header, materials: insertedMaterials };
    });
  }

  // ──────── LIST ────────

  async listWorkOrders(options: ListWorkOrdersOptions) {
    const {
      companyId, page = 1, limit = 50, search, status,
      branch_id, product_id, priority, from_date, to_date, sales_order_id,
      sortBy = 'work_order_date', sortOrder = 'desc',
    } = options;
    const offset = (page - 1) * limit;

    let query = this.db('work_orders as wo')
      .where('wo.company_id', companyId)
      .andWhere('wo.is_deleted', false);

    if (status) query = query.where('wo.status', status);
    if (branch_id) query = query.where('wo.branch_id', branch_id);
    if (product_id) query = query.where('wo.product_id', product_id);
    if (priority) query = query.where('wo.priority', priority);
    if (from_date) query = query.where('wo.work_order_date', '>=', from_date);
    if (to_date) query = query.where('wo.work_order_date', '<=', to_date);
    if (sales_order_id) query = query.where('wo.sales_order_id', sales_order_id);
    if (search) {
      query = query.where(function () {
        this.whereILike('wo.work_order_number', `%${search}%`)
          .orWhereILike('wo.internal_notes', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('wo.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .leftJoin('products as p', 'wo.product_id', 'p.id')
      .leftJoin('branches as b', 'wo.branch_id', 'b.id')
      .leftJoin('warehouses as sw', 'wo.source_warehouse_id', 'sw.id')
      .leftJoin('warehouses as tw', 'wo.target_warehouse_id', 'tw.id')
      .leftJoin('units_of_measurement as u', 'wo.uom_id', 'u.id')
      .select(
        'wo.*',
        'p.name as product_name', 'p.product_code',
        'b.name as branch_name',
        'sw.name as source_warehouse_name',
        'tw.name as target_warehouse_name',
        'u.symbol as uom_symbol'
      )
      .orderBy(`wo.${sortBy}`, sortOrder)
      .limit(limit).offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── GET WITH DETAILS ────────

  async getWorkOrderWithDetails(id: string, companyId: string) {
    const header = await this.db('work_orders as wo')
      .join('products as p', 'wo.product_id', 'p.id')
      .join('bom_headers as bh', 'wo.bom_header_id', 'bh.id')
      .join('branches as b', 'wo.branch_id', 'b.id')
      .join('warehouses as sw', 'wo.source_warehouse_id', 'sw.id')
      .join('warehouses as tw', 'wo.target_warehouse_id', 'tw.id')
      .leftJoin('units_of_measurement as u', 'wo.uom_id', 'u.id')
      .where('wo.id', id).andWhere('wo.company_id', companyId).andWhere('wo.is_deleted', false)
      .select(
        'wo.*',
        'p.name as product_name', 'p.product_code',
        'bh.bom_code', 'bh.bom_version',
        'b.name as branch_name',
        'sw.name as source_warehouse_name',
        'tw.name as target_warehouse_name',
        'u.name as uom_name', 'u.symbol as uom_symbol'
      )
      .first();

    if (!header) return null;

    const materials = await this.db('work_order_materials as wom')
      .leftJoin('items as i', 'wom.component_item_id', 'i.id')
      .leftJoin('products as cp', 'wom.component_product_id', 'cp.id')
      .leftJoin('units_of_measurement as mu', 'wom.uom_id', 'mu.id')
      .leftJoin('stock_batches as sb', 'wom.batch_id', 'sb.id')
      .where('wom.work_order_id', id).andWhere('wom.company_id', companyId).andWhere('wom.is_deleted', false)
      .select(
        'wom.*',
        'i.name as item_name', 'i.item_code',
        'cp.name as component_product_name', 'cp.product_code as component_product_code',
        'mu.name as uom_name', 'mu.symbol as uom_symbol',
        'sb.batch_number'
      )
      .orderBy('wom.line_number');

    // Get production entries
    const productions = await this.db('production_entries')
      .where({ work_order_id: id, company_id: companyId, is_deleted: false })
      .orderBy('entry_date', 'asc');

    // Get scrap entries
    const scraps = await this.db('scrap_entries')
      .where({ work_order_id: id, company_id: companyId, is_deleted: false })
      .orderBy('scrap_date', 'asc');

    return { ...header, materials, productions, scraps };
  }

  // ──────── UPDATE (draft only) ────────

  async updateWorkOrder(id: string, companyId: string, input: UpdateWorkOrderInput) {
    const existing = await this.getById(id, companyId);
    if (!existing) throw new Error('Work order not found');
    if (existing.status !== 'draft') {
      throw new Error(`Cannot update. Current status: "${existing.status}". Only draft work orders can be updated.`);
    }

    const updateData: Record<string, any> = {};
    if (input.work_order_date !== undefined) updateData.work_order_date = input.work_order_date;
    if (input.planned_start_date !== undefined) updateData.planned_start_date = input.planned_start_date;
    if (input.planned_end_date !== undefined) updateData.planned_end_date = input.planned_end_date;
    if (input.source_warehouse_id !== undefined) updateData.source_warehouse_id = input.source_warehouse_id;
    if (input.target_warehouse_id !== undefined) updateData.target_warehouse_id = input.target_warehouse_id;
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.internal_notes !== undefined) updateData.internal_notes = input.internal_notes;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;
    updateData.updated_by = input.updated_by || null;

    // If planned_quantity changed, recalculate materials
    if (input.planned_quantity !== undefined && input.planned_quantity !== parseNum(existing.planned_quantity)) {
      return await this.db.transaction(async (trx) => {
        updateData.planned_quantity = input.planned_quantity;

        const bom = await trx('bom_headers').where({ id: existing.bom_header_id }).first();
        const outputQty = parseNum(bom?.output_quantity) || 1;
        const multiplier = input.planned_quantity! / outputQty;

        // Get current materials linked to BOM lines
        const materials = await trx('work_order_materials')
          .where({ work_order_id: id, company_id: companyId, is_deleted: false })
          .whereNotNull('bom_line_id');

        let plannedCost = 0;
        for (const mat of materials) {
          const bomLine = await trx('bom_lines').where({ id: mat.bom_line_id }).first();
          if (!bomLine) continue;

          const plannedQty = round4(parseNum(bomLine.quantity) * multiplier);
          const wastagePct = parseNum(bomLine.wastage_pct);
          const plannedWithWastage = round4(plannedQty * (1 + wastagePct / 100));
          const unitCost = parseNum(mat.unit_cost);
          const totalCost = round2(plannedWithWastage * unitCost);
          plannedCost += totalCost;

          await trx('work_order_materials')
            .where({ id: mat.id })
            .update({
              planned_quantity: plannedWithWastage,
              total_cost: totalCost,
              updated_by: input.updated_by,
            });
        }

        updateData.planned_cost = round2(plannedCost);
        const [updated] = await trx('work_orders').where({ id }).update(updateData).returning('*');
        return updated;
      });
    }

    const [updated] = await this.db('work_orders').where({ id }).update(updateData).returning('*');
    return updated;
  }

  // ──────── APPROVE (draft → approved) ────────

  async approveWorkOrder(id: string, companyId: string, userId: string) {
    const wo = await this.getById(id, companyId);
    if (!wo) throw new Error('Work order not found');
    if (wo.status !== 'draft') throw new Error(`Cannot approve from status "${wo.status}".`);

    const [updated] = await this.db('work_orders')
      .where({ id, company_id: companyId })
      .update({ status: 'approved', approved_by: userId, approved_at: this.db.fn.now(), updated_by: userId })
      .returning('*');
    return updated;
  }

  // ========================================================
  // STEP 33: MATERIAL ISSUE & CONSUMPTION
  // ========================================================

  // ──────── MATERIAL ISSUE (approved/material_issued → material_issued) ────────
  // Deducts raw materials from source warehouse via stock ledger.

  async issueMaterials(id: string, companyId: string, userId: string, lines: MaterialIssueLineInput[]) {
    return await this.db.transaction(async (trx) => {
      const wo = await trx('work_orders')
        .where({ id, company_id: companyId, is_deleted: false })
        .forUpdate().first();

      if (!wo) throw new Error('Work order not found');
      const validStatuses = ['approved', 'material_issued', 'in_progress'];
      if (!validStatuses.includes(wo.status)) {
        throw new Error(`Cannot issue materials from status "${wo.status}".`);
      }

      for (const line of lines) {
        const mat = await trx('work_order_materials')
          .where({ id: line.material_id, work_order_id: id, company_id: companyId, is_deleted: false })
          .forUpdate().first();

        if (!mat) throw new Error(`Material line not found: ${line.material_id}`);
        if (line.issue_quantity <= 0) throw new Error('issue_quantity must be > 0');

        const alreadyIssued = parseNum(mat.issued_quantity);
        const planned = parseNum(mat.planned_quantity);
        const newIssued = round4(alreadyIssued + line.issue_quantity);

        // Allow over-issue with warning in metadata but don't block
        const itemId = mat.component_item_id || undefined;
        const productId = mat.component_product_id || undefined;
        const unitCost = parseNum(mat.unit_cost);

        // Resolve cost from stock_summary if not on material
        let movementCost = unitCost;
        if (!movementCost) {
          const balance = await inventoryService.getStockBalance(companyId, wo.source_warehouse_id, itemId, productId);
          movementCost = balance?.valuation_rate || 0;
          await trx('work_order_materials').where({ id: mat.id }).update({ unit_cost: round4(movementCost) });
        }

        // Deduct from source warehouse
        const movement: StockMovementInput = {
          company_id: companyId,
          branch_id: wo.branch_id,
          warehouse_id: wo.source_warehouse_id,
          item_id: itemId,
          product_id: productId,
          transaction_type: 'production_out',
          transaction_date: new Date().toISOString().split('T')[0],
          reference_type: 'work_order',
          reference_id: id,
          reference_number: wo.work_order_number,
          direction: 'out',
          quantity: line.issue_quantity,
          uom_id: mat.uom_id,
          unit_cost: movementCost,
          batch_id: line.batch_id,
          narration: `Material issued for WO ${wo.work_order_number}`,
          created_by: userId,
        };

        await inventoryService.recordMovement(movement, trx);

        // Update material line
        await trx('work_order_materials')
          .where({ id: mat.id })
          .update({
            issued_quantity: newIssued,
            batch_id: line.batch_id || mat.batch_id,
            total_cost: round2(newIssued * movementCost),
            updated_by: userId,
          });
      }

      // Update WO status and actual_cost
      const updatedMaterials = await trx('work_order_materials')
        .where({ work_order_id: id, company_id: companyId, is_deleted: false });

      let totalActualCost = 0;
      for (const m of updatedMaterials) {
        totalActualCost += round2(parseNum(m.issued_quantity) * parseNum(m.unit_cost));
      }

      const newStatus = wo.status === 'approved' ? 'material_issued' : wo.status;
      const updateData: Record<string, any> = {
        status: newStatus,
        actual_cost: round2(totalActualCost),
        updated_by: userId,
      };
      if (!wo.actual_start_date) {
        updateData.actual_start_date = new Date().toISOString().split('T')[0];
      }

      const [updated] = await trx('work_orders').where({ id }).update(updateData).returning('*');
      return { ...updated, materials_issued: lines.length };
    });
  }

  // ──────── MATERIAL CONSUMPTION (record actual usage) ────────
  // Records how much of issued material was actually consumed + wastage.
  // Calculates variance.

  async consumeMaterials(id: string, companyId: string, userId: string, lines: MaterialConsumeLineInput[]) {
    return await this.db.transaction(async (trx) => {
      const wo = await trx('work_orders')
        .where({ id, company_id: companyId, is_deleted: false }).first();

      if (!wo) throw new Error('Work order not found');
      const validStatuses = ['material_issued', 'in_progress'];
      if (!validStatuses.includes(wo.status)) {
        throw new Error(`Cannot consume materials from status "${wo.status}".`);
      }

      for (const line of lines) {
        const mat = await trx('work_order_materials')
          .where({ id: line.material_id, work_order_id: id, company_id: companyId, is_deleted: false })
          .first();

        if (!mat) throw new Error(`Material line not found: ${line.material_id}`);

        const issued = parseNum(mat.issued_quantity);
        const alreadyConsumed = parseNum(mat.consumed_quantity);
        const alreadyWasted = parseNum(mat.wastage_quantity);

        const newConsumed = round4(alreadyConsumed + line.consumed_quantity);
        const newWastage = round4(alreadyWasted + (line.wastage_quantity || 0));
        const totalUsed = round4(newConsumed + newWastage);

        if (totalUsed > issued + 0.001) {
          throw new Error(
            `Material ${mat.line_number}: Total consumed+wastage (${totalUsed}) ` +
            `exceeds issued quantity (${issued})`
          );
        }

        // Calculate variance vs planned
        const planned = parseNum(mat.planned_quantity);
        const varianceQty = round4(newConsumed - planned);
        const variancePct = planned > 0 ? round2((varianceQty / planned) * 100) : 0;

        await trx('work_order_materials')
          .where({ id: mat.id })
          .update({
            consumed_quantity: newConsumed,
            wastage_quantity: newWastage,
            variance_quantity: varianceQty,
            variance_pct: variancePct,
            updated_by: userId,
          });
      }

      // Transition to in_progress if still material_issued
      if (wo.status === 'material_issued') {
        await trx('work_orders').where({ id }).update({ status: 'in_progress', updated_by: userId });
      }

      return { success: true, consumed_lines: lines.length };
    });
  }

  // ──────── MATERIAL RETURN (return unused back to warehouse) ────────

  async returnMaterials(id: string, companyId: string, userId: string, lines: MaterialReturnLineInput[]) {
    return await this.db.transaction(async (trx) => {
      const wo = await trx('work_orders')
        .where({ id, company_id: companyId, is_deleted: false }).first();

      if (!wo) throw new Error('Work order not found');
      const validStatuses = ['material_issued', 'in_progress', 'completed'];
      if (!validStatuses.includes(wo.status)) {
        throw new Error(`Cannot return materials from status "${wo.status}".`);
      }

      for (const line of lines) {
        const mat = await trx('work_order_materials')
          .where({ id: line.material_id, work_order_id: id, company_id: companyId, is_deleted: false })
          .forUpdate().first();

        if (!mat) throw new Error(`Material line not found: ${line.material_id}`);
        if (line.return_quantity <= 0) throw new Error('return_quantity must be > 0');

        const issued = parseNum(mat.issued_quantity);
        const consumed = parseNum(mat.consumed_quantity);
        const wastage = parseNum(mat.wastage_quantity);
        const alreadyReturned = parseNum(mat.returned_quantity);
        const maxReturnable = round4(issued - consumed - wastage - alreadyReturned);

        if (line.return_quantity > maxReturnable + 0.001) {
          throw new Error(
            `Material ${mat.line_number}: Cannot return ${line.return_quantity}. ` +
            `Max returnable: ${maxReturnable}`
          );
        }

        const itemId = mat.component_item_id || undefined;
        const productId = mat.component_product_id || undefined;
        const unitCost = parseNum(mat.unit_cost);

        // Add back to source warehouse
        const movement: StockMovementInput = {
          company_id: companyId,
          branch_id: wo.branch_id,
          warehouse_id: wo.source_warehouse_id,
          item_id: itemId,
          product_id: productId,
          transaction_type: 'production_in',
          transaction_date: new Date().toISOString().split('T')[0],
          reference_type: 'work_order',
          reference_id: id,
          reference_number: wo.work_order_number,
          direction: 'in',
          quantity: line.return_quantity,
          uom_id: mat.uom_id,
          unit_cost: unitCost,
          batch_id: line.batch_id || mat.batch_id || undefined,
          narration: `Material returned from WO ${wo.work_order_number}`,
          created_by: userId,
        };

        await inventoryService.recordMovement(movement, trx);

        const newReturned = round4(alreadyReturned + line.return_quantity);
        await trx('work_order_materials')
          .where({ id: mat.id })
          .update({ returned_quantity: newReturned, updated_by: userId });
      }

      // Recalculate actual cost
      const allMats = await trx('work_order_materials')
        .where({ work_order_id: id, company_id: companyId, is_deleted: false });
      let totalCost = 0;
      for (const m of allMats) {
        const netIssued = parseNum(m.issued_quantity) - parseNum(m.returned_quantity);
        totalCost += round2(netIssued * parseNum(m.unit_cost));
      }

      await trx('work_orders').where({ id }).update({ actual_cost: round2(totalCost), updated_by: userId });

      return { success: true, returned_lines: lines.length };
    });
  }

  // ──────── START PRODUCTION (material_issued → in_progress) ────────

  async startProduction(id: string, companyId: string, userId: string) {
    const wo = await this.getById(id, companyId);
    if (!wo) throw new Error('Work order not found');
    if (wo.status !== 'material_issued') {
      throw new Error(`Cannot start production from status "${wo.status}".`);
    }

    const [updated] = await this.db('work_orders').where({ id, company_id: companyId })
      .update({
        status: 'in_progress',
        actual_start_date: wo.actual_start_date || new Date().toISOString().split('T')[0],
        updated_by: userId,
      })
      .returning('*');
    return updated;
  }

  // ──────── COMPLETE (in_progress → completed) ────────

  async completeWorkOrder(id: string, companyId: string, userId: string) {
    const wo = await this.getById(id, companyId);
    if (!wo) throw new Error('Work order not found');
    if (wo.status !== 'in_progress') {
      throw new Error(`Cannot complete from status "${wo.status}".`);
    }

    const [updated] = await this.db('work_orders').where({ id, company_id: companyId })
      .update({
        status: 'completed',
        actual_end_date: new Date().toISOString().split('T')[0],
        updated_by: userId,
      })
      .returning('*');
    return updated;
  }

  // ──────── CLOSE (completed → closed) ────────

  async closeWorkOrder(id: string, companyId: string, userId: string) {
    const wo = await this.getById(id, companyId);
    if (!wo) throw new Error('Work order not found');
    if (wo.status !== 'completed') {
      throw new Error(`Cannot close from status "${wo.status}".`);
    }

    const [updated] = await this.db('work_orders').where({ id, company_id: companyId })
      .update({ status: 'closed', updated_by: userId })
      .returning('*');
    return updated;
  }

  // ──────── CANCEL (draft/approved → cancelled) ────────

  async cancelWorkOrder(id: string, companyId: string, userId: string) {
    const wo = await this.getById(id, companyId);
    if (!wo) throw new Error('Work order not found');
    const cancelableStatuses = ['draft', 'approved'];
    if (!cancelableStatuses.includes(wo.status)) {
      throw new Error(`Cannot cancel from status "${wo.status}". Only draft/approved work orders can be cancelled.`);
    }

    const [updated] = await this.db('work_orders').where({ id, company_id: companyId })
      .update({ status: 'cancelled', updated_by: userId })
      .returning('*');
    return updated;
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteWorkOrder(id: string, companyId: string, userId: string) {
    const wo = await this.getById(id, companyId);
    if (!wo) throw new Error('Work order not found');
    if (wo.status !== 'draft') throw new Error('Only draft work orders can be deleted');

    return await this.db.transaction(async (trx) => {
      await trx('work_order_materials')
        .where({ work_order_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      const [deleted] = await trx('work_orders')
        .where({ id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId })
        .returning('*');
      return deleted;
    });
  }
}

export const workOrderService = new WorkOrderService();