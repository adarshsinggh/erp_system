// =============================================================
// File: server/services/production-entry.service.ts
// Module: Manufacturing — Phase 8, Step 34
// Description: Production Entry service.
//   Records finished goods output from work orders.
//   - Adds produced quantity to target warehouse via stock ledger
//   - Calculates unit cost from consumed materials
//   - Updates work_orders.completed_quantity
//   - Supports batch/serial assignment for produced goods
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { inventoryService, StockMovementInput } from './inventory.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface CreateProductionEntryInput {
  company_id: string;
  branch_id: string;
  work_order_id: string;
  entry_date: string;
  quantity_produced: number;
  scrap_quantity?: number;
  warehouse_id: string;
  batch_number?: string;
  serial_numbers?: string[];
  remarks?: string;
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface ListProductionEntriesOptions extends ListOptions {
  work_order_id?: string;
  product_id?: string;
  from_date?: string;
  to_date?: string;
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

class ProductionEntryService extends BaseService {
  constructor() {
    super('production_entries');
  }

  // ──────── CREATE ────────

  async createEntry(input: CreateProductionEntryInput) {
    return await this.db.transaction(async (trx) => {
      // Validate work order
      const wo = await trx('work_orders')
        .where({ id: input.work_order_id, company_id: input.company_id, is_deleted: false })
        .forUpdate().first();

      if (!wo) throw new Error('Work order not found');
      const validStatuses = ['in_progress', 'material_issued'];
      if (!validStatuses.includes(wo.status)) {
        throw new Error(`Cannot record production for status "${wo.status}".`);
      }

      // Check production won't exceed planned
      const currentCompleted = parseNum(wo.completed_quantity);
      const currentScrap = parseNum(wo.scrap_quantity);
      const planned = parseNum(wo.planned_quantity);
      const newTotal = currentCompleted + input.quantity_produced + (input.scrap_quantity || 0);

      // Allow slight overproduction (10% tolerance) but warn in metadata
      const overproductionLimit = planned * 1.1;
      if (newTotal > overproductionLimit) {
        throw new Error(
          `Production would exceed planned quantity by more than 10%. ` +
          `Planned: ${planned}, Already completed: ${currentCompleted}, This entry: ${input.quantity_produced}`
        );
      }

      // Calculate unit cost from consumed materials
      const materials = await trx('work_order_materials')
        .where({ work_order_id: input.work_order_id, company_id: input.company_id, is_deleted: false });

      let totalMaterialCost = 0;
      for (const m of materials) {
        const netConsumed = parseNum(m.consumed_quantity) || parseNum(m.issued_quantity);
        totalMaterialCost += round2(netConsumed * parseNum(m.unit_cost));
      }

      const totalProduced = currentCompleted + input.quantity_produced;
      const unitCost = totalProduced > 0 ? round4(totalMaterialCost / totalProduced) : 0;
      const totalCost = round2(input.quantity_produced * unitCost);

      // Generate entry number
      const [numResult] = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'production_entry') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const entryNumber = numResult?.rows?.[0]?.doc_number || numResult?.[0]?.doc_number || numResult?.doc_number;
      if (!entryNumber) throw new Error('Failed to generate production entry number.');

      // Insert entry
      const [entry] = await trx('production_entries')
        .insert({
          company_id: input.company_id,
          work_order_id: input.work_order_id,
          entry_number: entryNumber,
          entry_date: input.entry_date,
          product_id: wo.product_id,
          quantity_produced: input.quantity_produced,
          scrap_quantity: input.scrap_quantity || 0,
          uom_id: wo.uom_id,
          warehouse_id: input.warehouse_id || wo.target_warehouse_id,
          batch_number: input.batch_number || null,
          serial_numbers: input.serial_numbers || null,
          unit_cost: round4(unitCost),
          total_cost: round2(totalCost),
          remarks: input.remarks || null,
          metadata: input.metadata || {},
          created_by: input.created_by || null,
        })
        .returning('*');

      // Add finished goods to target warehouse via stock ledger
      const targetWarehouse = input.warehouse_id || wo.target_warehouse_id;

      const movement: StockMovementInput = {
        company_id: input.company_id,
        branch_id: wo.branch_id,
        warehouse_id: targetWarehouse,
        product_id: wo.product_id,
        transaction_type: 'production_in',
        transaction_date: input.entry_date,
        reference_type: 'work_order',
        reference_id: input.work_order_id,
        reference_number: wo.work_order_number,
        direction: 'in',
        quantity: input.quantity_produced,
        uom_id: wo.uom_id,
        unit_cost: unitCost,
        narration: `Production entry ${entryNumber} — WO ${wo.work_order_number}`,
        created_by: input.created_by,
      };

      await inventoryService.recordMovement(movement, trx);

      // Update work order quantities
      const newCompleted = round4(currentCompleted + input.quantity_produced);
      const newScrap = round4(currentScrap + (input.scrap_quantity || 0));
      const woUpdate: Record<string, any> = {
        completed_quantity: newCompleted,
        scrap_quantity: newScrap,
        actual_cost: round2(totalMaterialCost),
        updated_by: input.created_by,
      };

      // Auto-transition to in_progress if material_issued
      if (wo.status === 'material_issued') {
        woUpdate.status = 'in_progress';
        if (!wo.actual_start_date) {
          woUpdate.actual_start_date = input.entry_date;
        }
      }

      await trx('work_orders').where({ id: input.work_order_id }).update(woUpdate);

      return entry;
    });
  }

  // ──────── LIST ────────

  async listEntries(options: ListProductionEntriesOptions) {
    const {
      companyId, page = 1, limit = 50, search,
      work_order_id, product_id, from_date, to_date,
      sortBy = 'entry_date', sortOrder = 'desc',
    } = options;
    const offset = (page - 1) * limit;

    let query = this.db('production_entries as pe')
      .where('pe.company_id', companyId).andWhere('pe.is_deleted', false);

    if (work_order_id) query = query.where('pe.work_order_id', work_order_id);
    if (product_id) query = query.where('pe.product_id', product_id);
    if (from_date) query = query.where('pe.entry_date', '>=', from_date);
    if (to_date) query = query.where('pe.entry_date', '<=', to_date);
    if (search) {
      query = query.where(function () {
        this.whereILike('pe.entry_number', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('pe.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .join('work_orders as wo', 'pe.work_order_id', 'wo.id')
      .join('products as p', 'pe.product_id', 'p.id')
      .join('warehouses as w', 'pe.warehouse_id', 'w.id')
      .leftJoin('units_of_measurement as u', 'pe.uom_id', 'u.id')
      .select(
        'pe.*',
        'wo.work_order_number',
        'p.name as product_name', 'p.product_code',
        'w.name as warehouse_name',
        'u.code as uom_symbol'
      )
      .orderBy(`pe.${sortBy}`, sortOrder)
      .limit(limit).offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── GET BY ID ────────

  async getEntryWithDetails(id: string, companyId: string) {
    const entry = await this.db('production_entries as pe')
      .join('work_orders as wo', 'pe.work_order_id', 'wo.id')
      .join('products as p', 'pe.product_id', 'p.id')
      .join('warehouses as w', 'pe.warehouse_id', 'w.id')
      .leftJoin('units_of_measurement as u', 'pe.uom_id', 'u.id')
      .where('pe.id', id).andWhere('pe.company_id', companyId).andWhere('pe.is_deleted', false)
      .select(
        'pe.*',
        'wo.work_order_number', 'wo.planned_quantity', 'wo.completed_quantity as wo_completed',
        'p.name as product_name', 'p.product_code',
        'w.name as warehouse_name',
        'u.name as uom_name', 'u.code as uom_symbol'
      )
      .first();

    return entry || null;
  }
}

export const productionEntryService = new ProductionEntryService();