// =============================================================
// File: server/services/scrap-entry.service.ts
// Module: Manufacturing — Phase 8, Step 35
// Description: Scrap Entry service.
//   Records wastage/scrap from production.
//   - Creates stock ledger 'scrap' entry to deduct from warehouse
//   - Updates work_orders.scrap_quantity
//   - Tracks reason codes and disposal methods
//   - Calculates scrap value (recoverable value)
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { inventoryService, StockMovementInput } from './inventory.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface CreateScrapEntryInput {
  company_id: string;
  branch_id: string;
  scrap_date: string;
  work_order_id?: string;
  item_id?: string;
  product_id?: string;
  quantity: number;
  uom_id: string;
  scrap_reason: 'defective' | 'damaged' | 'expired' | 'process_waste';
  reason_detail?: string;
  scrap_value?: number;
  disposal_method?: 'sell' | 'recycle' | 'discard';
  warehouse_id: string;
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface ListScrapEntriesOptions extends ListOptions {
  branch_id?: string;
  work_order_id?: string;
  scrap_reason?: string;
  disposal_method?: string;
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

class ScrapEntryService extends BaseService {
  constructor() {
    super('scrap_entries');
  }

  // ──────── CREATE ────────

  async createEntry(input: CreateScrapEntryInput) {
    return await this.db.transaction(async (trx) => {
      if (!input.item_id && !input.product_id) {
        throw new Error('Either item_id or product_id is required');
      }

      // Validate work order if linked
      let wo: Record<string, any> | null = null;
      if (input.work_order_id) {
        wo = await trx('work_orders')
          .where({ id: input.work_order_id, company_id: input.company_id, is_deleted: false })
          .first();
        if (!wo) throw new Error('Work order not found');
      }

      // Validate warehouse
      const warehouse = await trx('warehouses')
        .where({ id: input.warehouse_id, company_id: input.company_id, is_deleted: false }).first();
      if (!warehouse) throw new Error('Warehouse not found');

      // Generate scrap number
      const [numResult] = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'scrap_entry') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const scrapNumber = numResult?.rows?.[0]?.doc_number || numResult?.[0]?.doc_number || numResult?.doc_number;
      if (!scrapNumber) throw new Error('Failed to generate scrap entry number.');

      // Resolve scrap value from current valuation if not provided
      let scrapValue = input.scrap_value;
      if (scrapValue === undefined || scrapValue === null) {
        const balance = await inventoryService.getStockBalance(
          input.company_id, input.warehouse_id,
          input.item_id, input.product_id
        );
        const rate = balance?.valuation_rate || 0;
        scrapValue = round2(input.quantity * rate);
      }

      // Insert entry
      const [entry] = await trx('scrap_entries')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          scrap_number: scrapNumber,
          scrap_date: input.scrap_date,
          work_order_id: input.work_order_id || null,
          item_id: input.item_id || null,
          product_id: input.product_id || null,
          quantity: input.quantity,
          uom_id: input.uom_id,
          scrap_reason: input.scrap_reason,
          reason_detail: input.reason_detail || null,
          scrap_value: round2(scrapValue),
          disposal_method: input.disposal_method || null,
          warehouse_id: input.warehouse_id,
          status: 'recorded',
          metadata: input.metadata || {},
          created_by: input.created_by || null,
        })
        .returning('*');

      // Deduct scrapped quantity from warehouse via stock ledger
      const balance = await inventoryService.getStockBalance(
        input.company_id, input.warehouse_id,
        input.item_id, input.product_id
      );
      const unitCost = balance?.valuation_rate || 0;

      const movement: StockMovementInput = {
        company_id: input.company_id,
        branch_id: input.branch_id,
        warehouse_id: input.warehouse_id,
        item_id: input.item_id,
        product_id: input.product_id,
        transaction_type: 'scrap',
        transaction_date: input.scrap_date,
        reference_type: input.work_order_id ? 'work_order' : 'adjustment',
        reference_id: input.work_order_id || entry.id,
        reference_number: scrapNumber,
        direction: 'out',
        quantity: input.quantity,
        uom_id: input.uom_id,
        unit_cost: unitCost,
        narration: `Scrap: ${input.scrap_reason}${input.reason_detail ? ' — ' + input.reason_detail : ''} — ${scrapNumber}`,
        created_by: input.created_by,
      };

      await inventoryService.recordMovement(movement, trx);

      // Update work order scrap quantity if linked
      if (wo) {
        const newScrap = round4(parseNum(wo.scrap_quantity) + input.quantity);
        await trx('work_orders')
          .where({ id: input.work_order_id })
          .update({ scrap_quantity: newScrap, updated_by: input.created_by });
      }

      return entry;
    });
  }

  // ──────── LIST ────────

  async listEntries(options: ListScrapEntriesOptions) {
    const {
      companyId, page = 1, limit = 50, search, status,
      branch_id, work_order_id, scrap_reason, disposal_method,
      from_date, to_date,
      sortBy = 'scrap_date', sortOrder = 'desc',
    } = options;
    const offset = (page - 1) * limit;

    let query = this.db('scrap_entries as se')
      .where('se.company_id', companyId).andWhere('se.is_deleted', false);

    if (status) query = query.where('se.status', status);
    if (branch_id) query = query.where('se.branch_id', branch_id);
    if (work_order_id) query = query.where('se.work_order_id', work_order_id);
    if (scrap_reason) query = query.where('se.scrap_reason', scrap_reason);
    if (disposal_method) query = query.where('se.disposal_method', disposal_method);
    if (from_date) query = query.where('se.scrap_date', '>=', from_date);
    if (to_date) query = query.where('se.scrap_date', '<=', to_date);
    if (search) {
      query = query.where(function () {
        this.whereILike('se.scrap_number', `%${search}%`)
          .orWhereILike('se.reason_detail', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('se.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .leftJoin('items as i', 'se.item_id', 'i.id')
      .leftJoin('products as p', 'se.product_id', 'p.id')
      .join('branches as b', 'se.branch_id', 'b.id')
      .leftJoin('warehouses as w', 'se.warehouse_id', 'w.id')
      .leftJoin('work_orders as wo', 'se.work_order_id', 'wo.id')
      .leftJoin('units_of_measurement as u', 'se.uom_id', 'u.id')
      .select(
        'se.*',
        'i.name as item_name', 'i.item_code',
        'p.name as product_name', 'p.product_code',
        'b.name as branch_name',
        'w.name as warehouse_name',
        'wo.work_order_number',
        'u.symbol as uom_symbol'
      )
      .orderBy(`se.${sortBy}`, sortOrder)
      .limit(limit).offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── GET BY ID ────────

  async getEntryWithDetails(id: string, companyId: string) {
    const entry = await this.db('scrap_entries as se')
      .leftJoin('items as i', 'se.item_id', 'i.id')
      .leftJoin('products as p', 'se.product_id', 'p.id')
      .join('branches as b', 'se.branch_id', 'b.id')
      .leftJoin('warehouses as w', 'se.warehouse_id', 'w.id')
      .leftJoin('work_orders as wo', 'se.work_order_id', 'wo.id')
      .leftJoin('units_of_measurement as u', 'se.uom_id', 'u.id')
      .where('se.id', id).andWhere('se.company_id', companyId).andWhere('se.is_deleted', false)
      .select(
        'se.*',
        'i.name as item_name', 'i.item_code',
        'p.name as product_name', 'p.product_code',
        'b.name as branch_name',
        'w.name as warehouse_name',
        'wo.work_order_number',
        'u.name as uom_name', 'u.symbol as uom_symbol'
      )
      .first();

    return entry || null;
  }

  // ──────── MARK AS DISPOSED ────────

  async markDisposed(id: string, companyId: string, disposalMethod: 'sell' | 'recycle' | 'discard', userId: string) {
    const entry = await this.getById(id, companyId);
    if (!entry) throw new Error('Scrap entry not found');
    if (entry.status === 'disposed') throw new Error('Already disposed');

    const [updated] = await this.db('scrap_entries')
      .where({ id, company_id: companyId })
      .update({
        status: 'disposed',
        disposal_method: disposalMethod,
        updated_by: userId,
      })
      .returning('*');

    return updated;
  }

  // ──────── SCRAP ANALYSIS REPORT ────────

  async getScrapAnalysis(companyId: string, options: {
    from_date?: string;
    to_date?: string;
    branch_id?: string;
    group_by?: 'reason' | 'product' | 'work_order';
  } = {}) {
    const { from_date, to_date, branch_id, group_by = 'reason' } = options;

    let query = this.db('scrap_entries as se')
      .where('se.company_id', companyId).andWhere('se.is_deleted', false);

    if (from_date) query = query.where('se.scrap_date', '>=', from_date);
    if (to_date) query = query.where('se.scrap_date', '<=', to_date);
    if (branch_id) query = query.where('se.branch_id', branch_id);

    let groupFields: string[];
    let selectFields: string[];

    switch (group_by) {
      case 'product':
        query = query.leftJoin('items as i', 'se.item_id', 'i.id')
          .leftJoin('products as p', 'se.product_id', 'p.id');
        groupFields = ['se.item_id', 'se.product_id', 'i.name', 'i.item_code', 'p.name', 'p.product_code'];
        selectFields = ['se.item_id', 'se.product_id', 'i.name as item_name', 'i.item_code', 'p.name as product_name', 'p.product_code'];
        break;
      case 'work_order':
        query = query.leftJoin('work_orders as wo', 'se.work_order_id', 'wo.id');
        groupFields = ['se.work_order_id', 'wo.work_order_number'];
        selectFields = ['se.work_order_id', 'wo.work_order_number'];
        break;
      default:
        groupFields = ['se.scrap_reason'];
        selectFields = ['se.scrap_reason'];
    }

    const data = await query
      .select(...selectFields)
      .sum('se.quantity as total_quantity')
      .sum('se.scrap_value as total_value')
      .count('se.id as entry_count')
      .groupBy(...groupFields);

    // Grand totals
    let totalsQuery = this.db('scrap_entries as se')
      .where('se.company_id', companyId).andWhere('se.is_deleted', false);
    if (from_date) totalsQuery = totalsQuery.where('se.scrap_date', '>=', from_date);
    if (to_date) totalsQuery = totalsQuery.where('se.scrap_date', '<=', to_date);
    if (branch_id) totalsQuery = totalsQuery.where('se.branch_id', branch_id);

    const totals = await totalsQuery
      .sum('se.quantity as grand_quantity')
      .sum('se.scrap_value as grand_value')
      .count('se.id as grand_count')
      .first();

    return {
      data,
      summary: {
        grand_quantity: parseNum(totals?.grand_quantity),
        grand_value: parseNum(totals?.grand_value),
        grand_count: parseInt(String(totals?.grand_count || '0'), 10),
        group_by,
      },
    };
  }
}

export const scrapEntryService = new ScrapEntryService();