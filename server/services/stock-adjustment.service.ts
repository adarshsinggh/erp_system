// =============================================================
// File: server/services/stock-adjustment.service.ts
// Module: Inventory Management — Phase 7, Step 30
// Description: Stock Adjustment service with header+lines CRUD,
//              auto document numbering, auto system_quantity
//              population from stock_summary, approval workflow,
//              posting (creates stock ledger entries for gains/
//              losses), and cancel with reversal.
//
// Reasons: physical_count, damage, theft, correction, opening_stock
// Status lifecycle: draft → approved → posted → (or cancelled)
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { inventoryService, StockMovementInput } from './inventory.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface StockAdjustmentLineInput {
  line_number: number;
  item_id?: string;
  product_id?: string;
  actual_quantity: number;
  uom_id: string;
  unit_cost?: number;
  batch_id?: string;
  remarks?: string;
}

export interface CreateStockAdjustmentInput {
  company_id: string;
  branch_id: string;
  adjustment_date: string;
  warehouse_id: string;
  reason: 'physical_count' | 'damage' | 'theft' | 'correction' | 'opening_stock';
  reason_detail?: string;
  metadata?: Record<string, any>;
  lines: StockAdjustmentLineInput[];
  created_by?: string;
}

export interface UpdateStockAdjustmentInput {
  adjustment_date?: string;
  reason?: 'physical_count' | 'damage' | 'theft' | 'correction' | 'opening_stock';
  reason_detail?: string;
  metadata?: Record<string, any>;
  lines?: StockAdjustmentLineInput[];
  updated_by?: string;
}

export interface ListStockAdjustmentsOptions extends ListOptions {
  branch_id?: string;
  warehouse_id?: string;
  reason?: string;
  from_date?: string;
  to_date?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function parseNum(val: any): number {
  return parseFloat(val) || 0;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class StockAdjustmentService extends BaseService {
  constructor() {
    super('stock_adjustments');
  }

  // ──────── Private: Resolve system quantity from stock_summary ────────

  private async resolveSystemQuantity(
    db: Knex,
    companyId: string,
    warehouseId: string,
    itemId?: string,
    productId?: string
  ): Promise<number> {
    let query = db('stock_summary')
      .where({ company_id: companyId, warehouse_id: warehouseId });

    if (itemId) {
      query = query.where('item_id', itemId);
    } else {
      query = query.whereNull('item_id');
    }
    if (productId) {
      query = query.where('product_id', productId);
    } else {
      query = query.whereNull('product_id');
    }

    const summary = await query.first();
    return parseNum(summary?.available_quantity);
  }

  // ──────── Private: Resolve unit cost from stock_summary ────────

  private async resolveUnitCost(
    db: Knex,
    companyId: string,
    warehouseId: string,
    itemId?: string,
    productId?: string
  ): Promise<number> {
    let query = db('stock_summary')
      .where({ company_id: companyId, warehouse_id: warehouseId });

    if (itemId) {
      query = query.where('item_id', itemId);
    } else {
      query = query.whereNull('item_id');
    }
    if (productId) {
      query = query.where('product_id', productId);
    } else {
      query = query.whereNull('product_id');
    }

    const summary = await query.first();
    return parseNum(summary?.valuation_rate);
  }

  // ──────── CREATE ────────

  async createAdjustment(input: CreateStockAdjustmentInput) {
    const { lines, ...headerInput } = input;

    if (!lines || lines.length === 0) {
      throw new Error('At least one line item is required');
    }

    return await this.db.transaction(async (trx) => {
      // Validate warehouse
      const warehouse = await trx('warehouses')
        .where({ id: input.warehouse_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!warehouse) throw new Error('Warehouse not found');

      // Validate branch
      const branch = await trx('branches')
        .where({ id: input.branch_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!branch) throw new Error('Branch not found');

      // Generate document number
      const [numResult] = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'stock_adjustment') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const adjustmentNumber = numResult?.rows?.[0]?.doc_number || numResult?.[0]?.doc_number || numResult?.doc_number;
      if (!adjustmentNumber) throw new Error('Failed to generate adjustment number. Check document_sequences configuration.');

      // Validate and resolve lines
      const computedLines: Record<string, any>[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!line.item_id && !line.product_id) {
          throw new Error(`Line ${i + 1}: Either item_id or product_id is required`);
        }

        // Validate item/product exists
        if (line.item_id) {
          const item = await trx('items')
            .where({ id: line.item_id, company_id: input.company_id, is_deleted: false })
            .first();
          if (!item) throw new Error(`Line ${i + 1}: Item not found: ${line.item_id}`);
        }
        if (line.product_id) {
          const product = await trx('products')
            .where({ id: line.product_id, company_id: input.company_id, is_deleted: false })
            .first();
          if (!product) throw new Error(`Line ${i + 1}: Product not found: ${line.product_id}`);
        }

        // Get system quantity from stock_summary
        const systemQty = await this.resolveSystemQuantity(
          trx, input.company_id, input.warehouse_id,
          line.item_id, line.product_id
        );

        const adjustmentQty = round3(line.actual_quantity - systemQty);

        // Resolve unit cost if not provided
        let unitCost = line.unit_cost;
        if (unitCost === undefined || unitCost === null) {
          unitCost = await this.resolveUnitCost(
            trx, input.company_id, input.warehouse_id,
            line.item_id, line.product_id
          );
        }

        const totalValue = round2(Math.abs(adjustmentQty) * unitCost);

        computedLines.push({
          company_id: input.company_id,
          adjustment_id: null, // set after header insert
          line_number: line.line_number,
          item_id: line.item_id || null,
          product_id: line.product_id || null,
          system_quantity: systemQty,
          actual_quantity: line.actual_quantity,
          adjustment_quantity: adjustmentQty,
          uom_id: line.uom_id,
          unit_cost: round4(unitCost),
          total_value: totalValue,
          batch_id: line.batch_id || null,
          remarks: line.remarks || null,
          created_by: input.created_by || null,
        });
      }

      // Insert header
      const [header] = await trx('stock_adjustments')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          adjustment_number: adjustmentNumber,
          adjustment_date: input.adjustment_date,
          warehouse_id: input.warehouse_id,
          reason: input.reason,
          reason_detail: input.reason_detail || null,
          status: 'draft',
          metadata: input.metadata || {},
          created_by: input.created_by || null,
        })
        .returning('*');

      // Insert lines with adjustment_id
      for (const cl of computedLines) {
        cl.adjustment_id = header.id;
      }

      const insertedLines = await trx('stock_adjustment_lines')
        .insert(computedLines)
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── LIST ────────

  async listAdjustments(options: ListStockAdjustmentsOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      branch_id,
      warehouse_id,
      reason,
      from_date,
      to_date,
      sortBy = 'adjustment_date',
      sortOrder = 'desc',
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('stock_adjustments as sa')
      .where('sa.company_id', companyId)
      .andWhere('sa.is_deleted', false);

    if (status) query = query.where('sa.status', status);
    if (branch_id) query = query.where('sa.branch_id', branch_id);
    if (warehouse_id) query = query.where('sa.warehouse_id', warehouse_id);
    if (reason) query = query.where('sa.reason', reason);
    if (from_date) query = query.where('sa.adjustment_date', '>=', from_date);
    if (to_date) query = query.where('sa.adjustment_date', '<=', to_date);
    if (search) {
      query = query.where(function () {
        this.whereILike('sa.adjustment_number', `%${search}%`)
          .orWhereILike('sa.reason_detail', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('sa.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .join('branches as b', 'sa.branch_id', 'b.id')
      .join('warehouses as w', 'sa.warehouse_id', 'w.id')
      .select(
        'sa.*',
        'b.name as branch_name',
        'w.name as warehouse_name'
      )
      .orderBy(`sa.${sortBy}`, sortOrder)
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── GET WITH DETAILS ────────

  async getAdjustmentWithDetails(id: string, companyId: string) {
    const header = await this.db('stock_adjustments as sa')
      .join('branches as b', 'sa.branch_id', 'b.id')
      .join('warehouses as w', 'sa.warehouse_id', 'w.id')
      .where('sa.id', id)
      .andWhere('sa.company_id', companyId)
      .andWhere('sa.is_deleted', false)
      .select(
        'sa.*',
        'b.name as branch_name',
        'w.name as warehouse_name'
      )
      .first();

    if (!header) return null;

    const lines = await this.db('stock_adjustment_lines as sal')
      .leftJoin('items as i', 'sal.item_id', 'i.id')
      .leftJoin('products as p', 'sal.product_id', 'p.id')
      .leftJoin('units_of_measurement as u', 'sal.uom_id', 'u.id')
      .leftJoin('stock_batches as sb', 'sal.batch_id', 'sb.id')
      .where('sal.adjustment_id', id)
      .andWhere('sal.company_id', companyId)
      .andWhere('sal.is_deleted', false)
      .select(
        'sal.*',
        'i.name as item_name',
        'i.item_code',
        'p.name as product_name',
        'p.product_code',
        'u.name as uom_name',
        'u.code as uom_symbol',
        'sb.batch_number'
      )
      .orderBy('sal.line_number');

    return { ...header, lines };
  }

  // ──────── UPDATE (draft only) ────────

  async updateAdjustment(id: string, companyId: string, input: UpdateStockAdjustmentInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('stock_adjustments')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Stock adjustment not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot update. Current status: "${existing.status}". Only draft adjustments can be updated.`);
      }

      // Update header
      const headerUpdate: Record<string, any> = {};
      if (input.adjustment_date !== undefined) headerUpdate.adjustment_date = input.adjustment_date;
      if (input.reason !== undefined) headerUpdate.reason = input.reason;
      if (input.reason_detail !== undefined) headerUpdate.reason_detail = input.reason_detail;
      if (input.metadata !== undefined) headerUpdate.metadata = input.metadata;
      headerUpdate.updated_by = input.updated_by || null;

      if (Object.keys(headerUpdate).length > 1) {
        await trx('stock_adjustments').where({ id }).update(headerUpdate);
      }

      // Replace lines if provided
      if (input.lines && input.lines.length > 0) {
        // Soft-delete old lines
        await trx('stock_adjustment_lines')
          .where({ adjustment_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Resolve and insert new lines
        const warehouseId = existing.warehouse_id;
        const computedLines: Record<string, any>[] = [];

        for (let i = 0; i < input.lines.length; i++) {
          const line = input.lines[i];

          if (!line.item_id && !line.product_id) {
            throw new Error(`Line ${i + 1}: Either item_id or product_id is required`);
          }

          const systemQty = await this.resolveSystemQuantity(
            trx, companyId, warehouseId,
            line.item_id, line.product_id
          );

          const adjustmentQty = round3(line.actual_quantity - systemQty);

          let unitCost = line.unit_cost;
          if (unitCost === undefined || unitCost === null) {
            unitCost = await this.resolveUnitCost(
              trx, companyId, warehouseId,
              line.item_id, line.product_id
            );
          }

          const totalValue = round2(Math.abs(adjustmentQty) * unitCost);

          computedLines.push({
            company_id: companyId,
            adjustment_id: id,
            line_number: line.line_number,
            item_id: line.item_id || null,
            product_id: line.product_id || null,
            system_quantity: systemQty,
            actual_quantity: line.actual_quantity,
            adjustment_quantity: adjustmentQty,
            uom_id: line.uom_id,
            unit_cost: round4(unitCost),
            total_value: totalValue,
            batch_id: line.batch_id || null,
            remarks: line.remarks || null,
            created_by: input.updated_by || null,
          });
        }

        await trx('stock_adjustment_lines').insert(computedLines);
      }

      // Return updated
      const updated = await trx('stock_adjustments').where({ id }).first();
      const updatedLines = await trx('stock_adjustment_lines')
        .where({ adjustment_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── APPROVE (draft → approved) ────────

  async approveAdjustment(id: string, companyId: string, userId: string) {
    const adjustment = await this.getById(id, companyId);
    if (!adjustment) throw new Error('Stock adjustment not found');
    if (adjustment.status !== 'draft') {
      throw new Error(`Cannot approve. Current status: "${adjustment.status}". Only draft adjustments can be approved.`);
    }

    const [updated] = await this.db('stock_adjustments')
      .where({ id, company_id: companyId })
      .update({
        status: 'approved',
        approved_by: userId,
        approved_at: this.db.fn.now(),
        updated_by: userId,
      })
      .returning('*');

    return updated;
  }

  // ──────── POST (approved → posted) ────────
  // Creates stock ledger entries for each line.
  // Positive adjustment_quantity → direction 'in' (gain)
  // Negative adjustment_quantity → direction 'out' (loss)

  async postAdjustment(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const adjustment = await trx('stock_adjustments')
        .where({ id, company_id: companyId, is_deleted: false })
        .forUpdate()
        .first();

      if (!adjustment) throw new Error('Stock adjustment not found');
      if (adjustment.status !== 'approved') {
        throw new Error(`Cannot post. Current status: "${adjustment.status}". Only approved adjustments can be posted.`);
      }

      const lines = await trx('stock_adjustment_lines')
        .where({ adjustment_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      if (lines.length === 0) throw new Error('Adjustment has no lines');

      // Create stock ledger entries for each line
      for (const line of lines) {
        const adjQty = parseNum(line.adjustment_quantity);
        if (adjQty === 0) continue; // No change needed

        const direction = adjQty > 0 ? 'in' : 'out';
        const absQty = Math.abs(adjQty);
        const unitCost = parseNum(line.unit_cost);

        const narrationParts = [
          `Stock adjustment (${adjustment.reason})`,
          adjustment.reason_detail ? `: ${adjustment.reason_detail}` : '',
          ` — ${adjustment.adjustment_number}`,
          ` — System: ${line.system_quantity}, Actual: ${line.actual_quantity}`,
        ];

        const movement: StockMovementInput = {
          company_id: companyId,
          branch_id: adjustment.branch_id,
          warehouse_id: adjustment.warehouse_id,
          item_id: line.item_id || undefined,
          product_id: line.product_id || undefined,
          transaction_type: 'adjustment',
          transaction_date: adjustment.adjustment_date,
          reference_type: 'adjustment',
          reference_id: id,
          reference_number: adjustment.adjustment_number,
          direction,
          quantity: absQty,
          uom_id: line.uom_id,
          unit_cost: unitCost,
          batch_id: line.batch_id || undefined,
          narration: narrationParts.join(''),
          created_by: userId,
        };

        await inventoryService.recordMovement(movement, trx);
      }

      // Update status to posted
      const [updated] = await trx('stock_adjustments')
        .where({ id })
        .update({
          status: 'posted',
          updated_by: userId,
        })
        .returning('*');

      return updated;
    });
  }

  // ──────── CANCEL ────────
  // If posted: reverse each ledger entry with opposite direction.
  // If draft/approved: just cancel, no stock impact.

  async cancelAdjustment(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const adjustment = await trx('stock_adjustments')
        .where({ id, company_id: companyId, is_deleted: false })
        .forUpdate()
        .first();

      if (!adjustment) throw new Error('Stock adjustment not found');
      if (adjustment.status === 'cancelled') {
        throw new Error('Adjustment is already cancelled');
      }

      // If posted, reverse the stock movements
      if (adjustment.status === 'posted') {
        const lines = await trx('stock_adjustment_lines')
          .where({ adjustment_id: id, company_id: companyId, is_deleted: false });

        for (const line of lines) {
          const adjQty = parseNum(line.adjustment_quantity);
          if (adjQty === 0) continue;

          // Reverse: if original was 'in', reverse is 'out' and vice versa
          const reverseDirection = adjQty > 0 ? 'out' : 'in';
          const absQty = Math.abs(adjQty);
          const unitCost = parseNum(line.unit_cost);

          const movement: StockMovementInput = {
            company_id: companyId,
            branch_id: adjustment.branch_id,
            warehouse_id: adjustment.warehouse_id,
            item_id: line.item_id || undefined,
            product_id: line.product_id || undefined,
            transaction_type: 'adjustment',
            transaction_date: new Date().toISOString().split('T')[0],
            reference_type: 'adjustment',
            reference_id: id,
            reference_number: adjustment.adjustment_number,
            direction: reverseDirection,
            quantity: absQty,
            uom_id: line.uom_id,
            unit_cost: unitCost,
            batch_id: line.batch_id || undefined,
            narration: `Reversal of adjustment ${adjustment.adjustment_number} (cancelled)`,
            created_by: userId,
          };

          await inventoryService.recordMovement(movement, trx);
        }
      }

      // Update status to cancelled
      const [updated] = await trx('stock_adjustments')
        .where({ id })
        .update({
          status: 'cancelled',
          updated_by: userId,
        })
        .returning('*');

      return updated;
    });
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteAdjustment(id: string, companyId: string, userId: string) {
    const adjustment = await this.getById(id, companyId);
    if (!adjustment) throw new Error('Stock adjustment not found');
    if (adjustment.status !== 'draft') {
      throw new Error('Only draft adjustments can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      await trx('stock_adjustment_lines')
        .where({ adjustment_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      const [deleted] = await trx('stock_adjustments')
        .where({ id, company_id: companyId, is_deleted: false })
        .update({
          is_deleted: true,
          deleted_at: trx.fn.now(),
          deleted_by: userId,
        })
        .returning('*');

      return deleted;
    });
  }
}

export const stockAdjustmentService = new StockAdjustmentService();