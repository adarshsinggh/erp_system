// =============================================================
// File: server/services/batch-serial.service.ts
// Module: Inventory Management — Phase 7, Step 31
// Description: Batch & Serial Tracking service.
//   - Batch CRUD with quantity tracking
//   - Expiry monitoring and FEFO (First Expiry First Out) queries
//   - Batch status management (active/depleted/expired/quarantine)
//   - Batch movement history from stock_ledger
//   - Serial number search across stock_ledger
//   - Auto batch quantity update helper (called by inventory engine)
//
// Batches are created:
//   1. Manually via API (opening stock, corrections)
//   2. Automatically by GRN when item.batch_tracking = true
//
// Serial numbers are stored on stock_ledger.serial_number
// and queried via ledger — no separate serial table needed.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface CreateBatchInput {
  company_id: string;
  item_id: string;
  batch_number: string;
  manufacturing_date?: string;
  expiry_date?: string;
  vendor_id?: string;
  grn_id?: string;
  initial_quantity: number;
  unit_cost?: number;
  created_by?: string;
}

export interface UpdateBatchInput {
  manufacturing_date?: string;
  expiry_date?: string;
  unit_cost?: number;
  updated_by?: string;
}

export interface ListBatchesOptions extends ListOptions {
  item_id?: string;
  vendor_id?: string;
  batch_status?: string;
  expiry_before?: string;
  expiry_after?: string;
  warehouse_id?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function parseNum(val: any): number {
  return parseFloat(val) || 0;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class BatchSerialService extends BaseService {
  constructor() {
    super('stock_batches');
  }

  // ──────── CREATE BATCH ────────

  async createBatch(input: CreateBatchInput, trx?: Knex) {
    const db = trx || this.db;

    // Validate item exists and has batch_tracking enabled
    const item = await db('items')
      .where({ id: input.item_id, company_id: input.company_id, is_deleted: false })
      .first();
    if (!item) throw new Error('Item not found');

    // Check duplicate batch number for same item
    const existing = await db('stock_batches')
      .where({
        company_id: input.company_id,
        item_id: input.item_id,
        batch_number: input.batch_number,
        is_deleted: false,
      })
      .first();
    if (existing) {
      throw new Error(`Batch number "${input.batch_number}" already exists for item "${item.name}"`);
    }

    // Validate vendor if provided
    if (input.vendor_id) {
      const vendor = await db('vendors')
        .where({ id: input.vendor_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!vendor) throw new Error('Vendor not found');
    }

    const [batch] = await db('stock_batches')
      .insert({
        company_id: input.company_id,
        item_id: input.item_id,
        batch_number: input.batch_number,
        manufacturing_date: input.manufacturing_date || null,
        expiry_date: input.expiry_date || null,
        vendor_id: input.vendor_id || null,
        grn_id: input.grn_id || null,
        initial_quantity: input.initial_quantity,
        current_quantity: input.initial_quantity,
        unit_cost: input.unit_cost || null,
        status: 'active',
        created_by: input.created_by || null,
      })
      .returning('*');

    return batch;
  }

  // ──────── LIST BATCHES ────────

  async listBatches(options: ListBatchesOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      item_id,
      vendor_id,
      batch_status,
      expiry_before,
      expiry_after,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('stock_batches as sb')
      .join('items as i', 'sb.item_id', 'i.id')
      .leftJoin('vendors as v', 'sb.vendor_id', 'v.id')
      .where('sb.company_id', companyId)
      .andWhere('sb.is_deleted', false);

    if (item_id) query = query.where('sb.item_id', item_id);
    if (vendor_id) query = query.where('sb.vendor_id', vendor_id);
    if (batch_status) query = query.where('sb.status', batch_status);
    if (expiry_before) query = query.where('sb.expiry_date', '<=', expiry_before);
    if (expiry_after) query = query.where('sb.expiry_date', '>=', expiry_after);

    if (search) {
      query = query.where(function () {
        this.whereILike('sb.batch_number', `%${search}%`)
          .orWhereILike('i.name', `%${search}%`)
          .orWhereILike('i.item_code', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('sb.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .select(
        'sb.*',
        'i.name as item_name',
        'i.item_code',
        'i.item_type',
        'v.name as vendor_name'
      )
      .orderBy(`sb.${sortBy}`, sortOrder)
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── GET BATCH WITH MOVEMENT HISTORY ────────

  async getBatchWithHistory(id: string, companyId: string) {
    const batch = await this.db('stock_batches as sb')
      .join('items as i', 'sb.item_id', 'i.id')
      .leftJoin('vendors as v', 'sb.vendor_id', 'v.id')
      .where('sb.id', id)
      .andWhere('sb.company_id', companyId)
      .andWhere('sb.is_deleted', false)
      .select(
        'sb.*',
        'i.name as item_name',
        'i.item_code',
        'i.item_type',
        'i.primary_uom_id',
        'v.name as vendor_name'
      )
      .first();

    if (!batch) return null;

    // Get movement history from stock_ledger
    const movements = await this.db('stock_ledger as sl')
      .join('warehouses as w', 'sl.warehouse_id', 'w.id')
      .join('branches as b', 'sl.branch_id', 'b.id')
      .where('sl.batch_id', id)
      .andWhere('sl.company_id', companyId)
      .select(
        'sl.id',
        'sl.transaction_type',
        'sl.transaction_date',
        'sl.reference_type',
        'sl.reference_id',
        'sl.reference_number',
        'sl.quantity_in',
        'sl.quantity_out',
        'sl.balance_quantity',
        'sl.unit_cost',
        'sl.narration',
        'sl.created_at',
        'w.name as warehouse_name',
        'b.name as branch_name'
      )
      .orderBy('sl.transaction_date', 'asc')
      .orderBy('sl.created_at', 'asc');

    return { ...batch, movements };
  }

  // ──────── GET ALL BATCHES FOR AN ITEM ────────

  async getBatchesByItem(
    itemId: string,
    companyId: string,
    options: {
      status?: string;
      warehouse_id?: string;
      include_depleted?: boolean;
    } = {}
  ) {
    let query = this.db('stock_batches as sb')
      .leftJoin('vendors as v', 'sb.vendor_id', 'v.id')
      .where('sb.item_id', itemId)
      .andWhere('sb.company_id', companyId)
      .andWhere('sb.is_deleted', false);

    if (options.status) {
      query = query.where('sb.status', options.status);
    } else if (!options.include_depleted) {
      query = query.where('sb.current_quantity', '>', 0);
    }

    const batches = await query
      .select(
        'sb.*',
        'v.name as vendor_name'
      )
      .orderBy('sb.expiry_date', 'asc') // FEFO order
      .orderBy('sb.created_at', 'asc');

    return batches;
  }

  // ──────── FEFO BATCH SELECTION ────────
  // Returns batches for an item sorted by expiry (First Expiry First Out).
  // Used by dispatch/production to auto-select which batch to consume.

  async getFefoBatches(
    itemId: string,
    companyId: string,
    quantityNeeded: number
  ): Promise<{ batch_id: string; batch_number: string; available: number; consume: number; expiry_date: string | null }[]> {
    const batches = await this.db('stock_batches')
      .where({
        item_id: itemId,
        company_id: companyId,
        status: 'active',
        is_deleted: false,
      })
      .andWhere('current_quantity', '>', 0)
      .orderByRaw('expiry_date ASC NULLS LAST')
      .orderBy('created_at', 'asc');

    let remaining = quantityNeeded;
    const selections: { batch_id: string; batch_number: string; available: number; consume: number; expiry_date: string | null }[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const available = parseNum(batch.current_quantity);
      const consume = Math.min(remaining, available);

      selections.push({
        batch_id: batch.id,
        batch_number: batch.batch_number,
        available,
        consume: round3(consume),
        expiry_date: batch.expiry_date,
      });

      remaining = round3(remaining - consume);
    }

    return selections;
  }

  // ──────── UPDATE BATCH METADATA ────────

  async updateBatch(id: string, companyId: string, input: UpdateBatchInput) {
    const batch = await this.getById(id, companyId);
    if (!batch) throw new Error('Batch not found');

    const updateData: Record<string, any> = {};
    if (input.manufacturing_date !== undefined) updateData.manufacturing_date = input.manufacturing_date;
    if (input.expiry_date !== undefined) updateData.expiry_date = input.expiry_date;
    if (input.unit_cost !== undefined) updateData.unit_cost = input.unit_cost;
    updateData.updated_by = input.updated_by || null;

    const [updated] = await this.db('stock_batches')
      .where({ id, company_id: companyId, is_deleted: false })
      .update(updateData)
      .returning('*');

    return updated;
  }

  // ──────── UPDATE BATCH QUANTITY ────────
  // Called by inventory engine after movements with batch_id.

  async updateBatchQuantity(
    batchId: string,
    companyId: string,
    deltaQty: number,
    direction: 'in' | 'out',
    trx?: Knex
  ): Promise<void> {
    const db = trx || this.db;

    const batch = await db('stock_batches')
      .where({ id: batchId, company_id: companyId, is_deleted: false })
      .forUpdate()
      .first();

    if (!batch) throw new Error(`Batch not found: ${batchId}`);

    let newQty: number;
    if (direction === 'in') {
      newQty = round3(parseNum(batch.current_quantity) + deltaQty);
    } else {
      newQty = round3(parseNum(batch.current_quantity) - deltaQty);
      if (newQty < 0) {
        throw new Error(
          `Insufficient batch quantity. Batch: ${batch.batch_number}, ` +
          `Available: ${batch.current_quantity}, Requested: ${deltaQty}`
        );
      }
    }

    const updateData: Record<string, any> = { current_quantity: newQty };

    // Auto-update status
    if (newQty <= 0) {
      updateData.status = 'depleted';
    } else if (batch.status === 'depleted' && newQty > 0) {
      updateData.status = 'active';
    }

    await db('stock_batches')
      .where({ id: batchId })
      .update(updateData);
  }

  // ──────── CHANGE BATCH STATUS ────────

  async changeBatchStatus(
    id: string,
    companyId: string,
    newStatus: 'active' | 'depleted' | 'expired' | 'quarantine',
    userId: string
  ) {
    const batch = await this.getById(id, companyId);
    if (!batch) throw new Error('Batch not found');

    const validStatuses = ['active', 'depleted', 'expired', 'quarantine'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const [updated] = await this.db('stock_batches')
      .where({ id, company_id: companyId, is_deleted: false })
      .update({
        status: newStatus,
        updated_by: userId,
      })
      .returning('*');

    return updated;
  }

  // ──────── EXPIRING BATCHES ────────
  // Batches expiring within N days from today.

  async getExpiringBatches(companyId: string, options: {
    days?: number;
    item_id?: string;
    include_expired?: boolean;
    page?: number;
    limit?: number;
  } = {}) {
    const { days = 30, item_id, include_expired = false, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const futureDateStr = futureDate.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    let query = this.db('stock_batches as sb')
      .join('items as i', 'sb.item_id', 'i.id')
      .leftJoin('vendors as v', 'sb.vendor_id', 'v.id')
      .where('sb.company_id', companyId)
      .andWhere('sb.is_deleted', false)
      .andWhere('sb.current_quantity', '>', 0)
      .whereNotNull('sb.expiry_date');

    if (include_expired) {
      // Include already expired + expiring soon
      query = query.where('sb.expiry_date', '<=', futureDateStr);
    } else {
      // Only expiring soon (not yet expired)
      query = query
        .where('sb.expiry_date', '>=', todayStr)
        .andWhere('sb.expiry_date', '<=', futureDateStr);
    }

    if (item_id) query = query.where('sb.item_id', item_id);

    const countResult = await query.clone().count('sb.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .select(
        'sb.*',
        'i.name as item_name',
        'i.item_code',
        'v.name as vendor_name'
      )
      .select(
        this.db.raw(`(sb.expiry_date - CURRENT_DATE) as days_until_expiry`),
        this.db.raw(`
          CASE
            WHEN sb.expiry_date < CURRENT_DATE THEN 'expired'
            WHEN sb.expiry_date <= (CURRENT_DATE + INTERVAL '7 days') THEN 'critical'
            ELSE 'warning'
          END as urgency
        `)
      )
      .orderBy('sb.expiry_date', 'asc')
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── SERIAL NUMBER SEARCH ────────
  // Search stock_ledger for entries with a specific serial number.
  // Returns full traceability chain.

  async searchBySerialNumber(companyId: string, serialNumber: string) {
    const entries = await this.db('stock_ledger as sl')
      .leftJoin('items as i', 'sl.item_id', 'i.id')
      .leftJoin('products as p', 'sl.product_id', 'p.id')
      .join('warehouses as w', 'sl.warehouse_id', 'w.id')
      .join('branches as b', 'sl.branch_id', 'b.id')
      .where('sl.company_id', companyId)
      .andWhereRaw('LOWER(sl.serial_number) = ?', [serialNumber.toLowerCase()])
      .select(
        'sl.id',
        'sl.transaction_type',
        'sl.transaction_date',
        'sl.reference_type',
        'sl.reference_id',
        'sl.reference_number',
        'sl.quantity_in',
        'sl.quantity_out',
        'sl.unit_cost',
        'sl.narration',
        'sl.serial_number',
        'sl.created_at',
        'sl.item_id',
        'sl.product_id',
        'i.name as item_name',
        'i.item_code',
        'p.name as product_name',
        'p.product_code',
        'w.name as warehouse_name',
        'w.code as warehouse_code',
        'b.name as branch_name',
        'b.code as branch_code'
      )
      .orderBy('sl.transaction_date', 'asc')
      .orderBy('sl.created_at', 'asc');

    // Determine current location
    let currentLocation: Record<string, any> | null = null;
    if (entries.length > 0) {
      const lastEntry = entries[entries.length - 1];
      const totalIn = entries.reduce((sum: number, e: any) => sum + parseNum(e.quantity_in), 0);
      const totalOut = entries.reduce((sum: number, e: any) => sum + parseNum(e.quantity_out), 0);

      currentLocation = {
        warehouse_name: lastEntry.warehouse_name,
        branch_name: lastEntry.branch_name,
        last_transaction: lastEntry.transaction_type,
        last_date: lastEntry.transaction_date,
        in_stock: totalIn > totalOut,
      };
    }

    return {
      serial_number: serialNumber,
      found: entries.length > 0,
      entries,
      current_location: currentLocation,
      total_movements: entries.length,
    };
  }

  // ──────── LIST SERIAL NUMBERS ────────
  // Returns paginated list of distinct serial numbers with latest info.

  async listSerialNumbers(
    companyId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      item_id?: string;
      warehouse_id?: string;
    } = {}
  ) {
    const pg = options.page || 1;
    const lim = options.limit || 50;
    const offset = (pg - 1) * lim;

    let baseQuery = this.db('stock_ledger as sl')
      .leftJoin('items as i', 'sl.item_id', 'i.id')
      .join('warehouses as w', 'sl.warehouse_id', 'w.id')
      .where('sl.company_id', companyId)
      .andWhere('sl.serial_number', '!=', '')
      .whereNotNull('sl.serial_number');

    if (options.search) {
      baseQuery = baseQuery.andWhere(function () {
        this.whereRaw('LOWER(sl.serial_number) LIKE ?', [`%${options.search!.toLowerCase()}%`])
          .orWhereRaw('LOWER(i.name) LIKE ?', [`%${options.search!.toLowerCase()}%`])
          .orWhereRaw('LOWER(i.item_code) LIKE ?', [`%${options.search!.toLowerCase()}%`]);
      });
    }

    if (options.item_id) {
      baseQuery = baseQuery.andWhere('sl.item_id', options.item_id);
    }

    if (options.warehouse_id) {
      baseQuery = baseQuery.andWhere('sl.warehouse_id', options.warehouse_id);
    }

    // Count distinct serial numbers
    const [{ count }] = await baseQuery.clone()
      .countDistinct('sl.serial_number as count');
    const total = parseInt(count as string) || 0;

    // Get distinct serial numbers with aggregated info
    // Use a subquery approach: get latest entry per serial number
    const rows = await this.db
      .from(
        this.db.raw(`(
          SELECT DISTINCT ON (sl.serial_number)
            sl.serial_number,
            sl.item_id,
            sl.warehouse_id,
            sl.transaction_type,
            sl.transaction_date,
            sl.quantity_in,
            sl.quantity_out,
            sl.reference_number,
            i.name as item_name,
            i.item_code,
            w.name as warehouse_name
          FROM stock_ledger sl
          LEFT JOIN items i ON sl.item_id = i.id
          JOIN warehouses w ON sl.warehouse_id = w.id
          WHERE sl.company_id = ?
            AND sl.serial_number IS NOT NULL
            AND sl.serial_number != ''
            ${options.search ? `AND (LOWER(sl.serial_number) LIKE ? OR LOWER(i.name) LIKE ? OR LOWER(i.item_code) LIKE ?)` : ''}
            ${options.item_id ? `AND sl.item_id = ?` : ''}
            ${options.warehouse_id ? `AND sl.warehouse_id = ?` : ''}
          ORDER BY sl.serial_number, sl.transaction_date DESC, sl.created_at DESC
        ) as sub`,
          [
            companyId,
            ...(options.search ? [`%${options.search.toLowerCase()}%`, `%${options.search.toLowerCase()}%`, `%${options.search.toLowerCase()}%`] : []),
            ...(options.item_id ? [options.item_id] : []),
            ...(options.warehouse_id ? [options.warehouse_id] : []),
          ]
        )
      )
      .select('*')
      .orderBy('transaction_date', 'desc')
      .offset(offset)
      .limit(lim);

    return {
      data: rows.map((r: any) => ({
        serial_number: r.serial_number,
        item_id: r.item_id,
        item_code: r.item_code,
        item_name: r.item_name,
        warehouse_name: r.warehouse_name,
        last_transaction_type: r.transaction_type,
        last_transaction_date: r.transaction_date,
        last_direction: parseNum(r.quantity_in) > 0 ? 'in' : 'out',
        last_quantity: parseNum(r.quantity_in) > 0 ? parseNum(r.quantity_in) : parseNum(r.quantity_out),
        reference_number: r.reference_number,
      })),
      total,
      page: pg,
      limit: lim,
      totalPages: Math.ceil(total / lim),
    };
  }

  // ──────── BATCH SUMMARY BY WAREHOUSE ────────
  // For a given item, shows batch quantities across warehouses.

  async getBatchWarehouseDistribution(
    batchId: string,
    companyId: string
  ): Promise<Record<string, any>[]> {
    // Sum up ledger entries grouped by warehouse for this batch
    const distribution = await this.db('stock_ledger as sl')
      .join('warehouses as w', 'sl.warehouse_id', 'w.id')
      .join('branches as b', 'sl.branch_id', 'b.id')
      .where('sl.batch_id', batchId)
      .andWhere('sl.company_id', companyId)
      .select(
        'sl.warehouse_id',
        'w.name as warehouse_name',
        'w.code as warehouse_code',
        'b.name as branch_name'
      )
      .sum('sl.quantity_in as total_in')
      .sum('sl.quantity_out as total_out')
      .groupBy('sl.warehouse_id', 'w.name', 'w.code', 'b.name')
      .orderBy('w.name');

    return distribution.map((row: any) => ({
      ...row,
      net_quantity: round3(parseNum(row.total_in) - parseNum(row.total_out)),
    }));
  }
}

export const batchSerialService = new BatchSerialService();