// =============================================================
// File: server/services/inventory.service.ts
// Module: Inventory Management — Phase 7, Step 27
// Description: Core Stock Ledger Engine. Provides:
//   - recordMovement()  → append-only stock_ledger entry +
//                         atomic stock_summary update
//   - getStockBalance() → current balance from stock_summary
//   - getStockLedgerEntries() → paginated ledger query
//   - recalculateBalance() → full recalc from ledger (admin)
//   - getItemCostingMethod() → resolve FIFO / weighted_avg / standard
//
// Valuation methods supported:
//   - weighted_avg: new_rate = (old_value + in_value) / (old_qty + in_qty)
//   - fifo: cost layers tracked via batch_id + unit_cost per entry
//   - standard: uses items.standard_cost; variance in metadata
//
// This service is called internally by GRN, Production,
// Delivery Challan, Transfer, Adjustment, and Scrap modules.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

/** Valid transaction types matching stock_ledger CHECK constraint */
export type StockTransactionType =
  | 'grn_receipt'
  | 'production_in'
  | 'production_out'
  | 'sales_dispatch'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'
  | 'scrap';

/** Valid reference types matching stock_ledger CHECK constraint */
export type StockReferenceType =
  | 'grn'
  | 'work_order'
  | 'invoice'
  | 'transfer'
  | 'adjustment'
  | 'delivery_challan';

/** Direction of movement */
export type MovementDirection = 'in' | 'out';

/** Input for recording a stock movement */
export interface StockMovementInput {
  company_id: string;
  branch_id: string;
  warehouse_id: string;
  item_id?: string;
  product_id?: string;
  transaction_type: StockTransactionType;
  transaction_date: string; // ISO date string
  reference_type: StockReferenceType;
  reference_id: string;
  reference_number?: string;
  direction: MovementDirection;
  quantity: number; // always positive
  uom_id: string;
  unit_cost?: number;
  batch_id?: string;
  serial_number?: string;
  narration?: string;
  created_by?: string;
}

/** Filters for querying stock ledger entries */
export interface StockLedgerFilters extends ListOptions {
  branch_id?: string;
  warehouse_id?: string;
  item_id?: string;
  product_id?: string;
  transaction_type?: StockTransactionType;
  reference_type?: StockReferenceType;
  from_date?: string;
  to_date?: string;
}

/** Stock balance result */
export interface StockBalance {
  available_quantity: number;
  reserved_quantity: number;
  on_order_quantity: number;
  in_production_quantity: number;
  free_quantity: number;
  valuation_rate: number | null;
  total_value: number | null;
  uom_id: string;
  last_movement_date: string | null;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

class InventoryService extends BaseService {
  constructor() {
    super('stock_ledger');
  }

  // ──────────────────────────────────────────────────────────
  // CORE: Record a stock movement
  // This is the single entry-point for ALL inventory changes.
  // It creates a stock_ledger row and updates stock_summary
  // atomically within a transaction.
  //
  // If an external transaction (trx) is provided, it operates
  // within that transaction (e.g., called from GRN service).
  // Otherwise it creates its own transaction.
  // ──────────────────────────────────────────────────────────

  async recordMovement(input: StockMovementInput, trx?: Knex): Promise<Record<string, any>> {
    const execute = async (db: Knex) => {
      // ── 1. Validate required fields ──
      if (!input.item_id && !input.product_id) {
        throw new Error('Either item_id or product_id is required');
      }
      if (input.quantity <= 0) {
        throw new Error('Quantity must be greater than zero');
      }

      // ── 2. Resolve costing method for valuation ──
      const costingMethod = await this.getItemCostingMethod(
        db,
        input.company_id,
        input.item_id,
        input.product_id
      );

      // ── 3. Lock + get/create stock_summary row ──
      const summary = await this.getOrCreateSummary(
        db,
        input.company_id,
        input.branch_id,
        input.warehouse_id,
        input.item_id,
        input.product_id,
        input.uom_id,
        input.created_by
      );

      // ── 4. Calculate values based on direction ──
      const currentQty = parseNum(summary.available_quantity);
      const currentValue = parseNum(summary.total_value);
      const currentRate = parseNum(summary.valuation_rate);

      let quantityIn = 0;
      let quantityOut = 0;
      let unitCost = input.unit_cost ?? 0;
      let totalValue = 0;
      let newBalanceQty = 0;
      let newBalanceValue = 0;
      let newValuationRate = currentRate;

      if (input.direction === 'in') {
        quantityIn = input.quantity;
        newBalanceQty = round4(currentQty + input.quantity);

        // Valuation for inward
        if (costingMethod === 'weighted_avg') {
          totalValue = round2(input.quantity * unitCost);
          newBalanceValue = round2(currentValue + totalValue);
          newValuationRate = newBalanceQty > 0
            ? round4(newBalanceValue / newBalanceQty)
            : 0;
        } else if (costingMethod === 'standard') {
          // Use standard cost from item master
          const standardCost = await this.getStandardCost(db, input.company_id, input.item_id, input.product_id);
          unitCost = standardCost;
          totalValue = round2(input.quantity * standardCost);
          newBalanceValue = round2(currentValue + totalValue);
          newValuationRate = standardCost;
        } else {
          // FIFO: each inward creates a cost layer (unit_cost stored per entry)
          totalValue = round2(input.quantity * unitCost);
          newBalanceValue = round2(currentValue + totalValue);
          newValuationRate = newBalanceQty > 0
            ? round4(newBalanceValue / newBalanceQty)
            : 0;
        }

      } else {
        // direction === 'out'
        quantityOut = input.quantity;

        // Validate sufficient stock
        if (input.quantity > currentQty) {
          const entityId = input.item_id || input.product_id;
          throw new Error(
            `Insufficient stock. Available: ${currentQty}, Requested: ${input.quantity} ` +
            `(item/product: ${entityId}, warehouse: ${input.warehouse_id})`
          );
        }

        newBalanceQty = round4(currentQty - input.quantity);

        // Valuation for outward
        if (costingMethod === 'weighted_avg') {
          unitCost = currentRate;
          totalValue = round2(input.quantity * currentRate);
          newBalanceValue = round2(currentValue - totalValue);
          newValuationRate = newBalanceQty > 0
            ? round4(newBalanceValue / newBalanceQty)
            : 0;
        } else if (costingMethod === 'standard') {
          const standardCost = await this.getStandardCost(db, input.company_id, input.item_id, input.product_id);
          unitCost = standardCost;
          totalValue = round2(input.quantity * standardCost);
          newBalanceValue = round2(currentValue - totalValue);
          newValuationRate = standardCost;
        } else {
          // FIFO: consume oldest cost layers
          const { consumedCost, consumedDetails } = await this.consumeFifoLayers(
            db,
            input.company_id,
            input.warehouse_id,
            input.item_id,
            input.product_id,
            input.quantity
          );
          unitCost = input.quantity > 0 ? round4(consumedCost / input.quantity) : 0;
          totalValue = round2(consumedCost);
          newBalanceValue = round2(currentValue - consumedCost);
          newValuationRate = newBalanceQty > 0
            ? round4(newBalanceValue / newBalanceQty)
            : 0;
        }
      }

      // ── 5. Insert stock_ledger entry ──
      const [ledgerEntry] = await db('stock_ledger')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          warehouse_id: input.warehouse_id,
          item_id: input.item_id || null,
          product_id: input.product_id || null,
          transaction_type: input.transaction_type,
          transaction_date: input.transaction_date,
          reference_type: input.reference_type,
          reference_id: input.reference_id,
          reference_number: input.reference_number || null,
          quantity_in: quantityIn,
          quantity_out: quantityOut,
          balance_quantity: newBalanceQty,
          uom_id: input.uom_id,
          unit_cost: round4(unitCost),
          total_value: round2(totalValue),
          balance_value: round2(newBalanceValue),
          batch_id: input.batch_id || null,
          serial_number: input.serial_number || null,
          narration: input.narration || null,
          created_by: input.created_by || null,
        })
        .returning('*');

      // ── 6. Update stock_summary atomically ──
      const summaryUpdate: Record<string, any> = {
        available_quantity: newBalanceQty,
        valuation_rate: round4(newValuationRate),
        total_value: round2(newBalanceValue),
        free_quantity: round4(
          newBalanceQty - parseNum(summary.reserved_quantity)
        ),
        last_movement_date: input.transaction_date,
        updated_by: input.created_by || null,
      };

      // Track purchase-specific metadata on inward from GRN
      if (input.transaction_type === 'grn_receipt') {
        summaryUpdate.last_purchase_date = input.transaction_date;
        summaryUpdate.last_purchase_rate = round2(unitCost);
      }

      // Track sale date on dispatch
      if (input.transaction_type === 'sales_dispatch') {
        summaryUpdate.last_sale_date = input.transaction_date;
      }

      await db('stock_summary')
        .where({ id: summary.id })
        .update(summaryUpdate);

      return ledgerEntry;
    };

    // If external transaction provided, use it. Otherwise create one.
    if (trx) {
      return await execute(trx);
    }
    return await this.db.transaction(async (newTrx) => {
      return await execute(newTrx);
    });
  }

  // ──────────────────────────────────────────────────────────
  // Get or create stock_summary row with row-level lock
  // Uses SELECT ... FOR UPDATE to prevent concurrent writes
  // ──────────────────────────────────────────────────────────

  private async getOrCreateSummary(
    db: Knex,
    companyId: string,
    branchId: string,
    warehouseId: string,
    itemId: string | undefined,
    productId: string | undefined,
    uomId: string,
    userId?: string
  ): Promise<Record<string, any>> {
    // Build the where clause with COALESCE matching for the unique index
    const whereClause: Record<string, any> = {
      company_id: companyId,
      warehouse_id: warehouseId,
    };
    if (itemId) {
      whereClause.item_id = itemId;
    } else {
      whereClause.item_id = null;
    }
    if (productId) {
      whereClause.product_id = productId;
    } else {
      whereClause.product_id = null;
    }

    // Try to find existing summary with row lock
    let summary = await db('stock_summary')
      .where(function () {
        this.where('company_id', companyId)
          .andWhere('warehouse_id', warehouseId);
        if (itemId) {
          this.where('item_id', itemId);
        } else {
          this.whereNull('item_id');
        }
        if (productId) {
          this.where('product_id', productId);
        } else {
          this.whereNull('product_id');
        }
      })
      .forUpdate()
      .first();

    if (!summary) {
      // Create new summary row
      const [newSummary] = await db('stock_summary')
        .insert({
          company_id: companyId,
          branch_id: branchId,
          warehouse_id: warehouseId,
          item_id: itemId || null,
          product_id: productId || null,
          available_quantity: 0,
          reserved_quantity: 0,
          on_order_quantity: 0,
          in_production_quantity: 0,
          free_quantity: 0,
          uom_id: uomId,
          valuation_rate: 0,
          total_value: 0,
          created_by: userId || null,
        })
        .returning('*');

      // Lock the newly created row
      summary = await db('stock_summary')
        .where({ id: newSummary.id })
        .forUpdate()
        .first();
    }

    return summary;
  }

  // ──────────────────────────────────────────────────────────
  // Resolve costing method for an item or product
  // Items have costing_method directly.
  // Products inherit from their BOM or default to weighted_avg.
  // ──────────────────────────────────────────────────────────

  private async getItemCostingMethod(
    db: Knex,
    companyId: string,
    itemId?: string,
    productId?: string
  ): Promise<'fifo' | 'weighted_avg' | 'standard'> {
    if (itemId) {
      const item = await db('items')
        .where({ id: itemId, company_id: companyId })
        .select('costing_method')
        .first();
      if (item?.costing_method) {
        return item.costing_method as 'fifo' | 'weighted_avg' | 'standard';
      }
    }

    if (productId) {
      const product = await db('products')
        .where({ id: productId, company_id: companyId })
        .select('costing_method')
        .first();
      if (product?.costing_method) {
        return product.costing_method as 'fifo' | 'weighted_avg' | 'standard';
      }
    }

    // Default
    return 'weighted_avg';
  }

  // ──────────────────────────────────────────────────────────
  // Get standard cost from item/product master
  // ──────────────────────────────────────────────────────────

  private async getStandardCost(
    db: Knex,
    companyId: string,
    itemId?: string,
    productId?: string
  ): Promise<number> {
    if (itemId) {
      const item = await db('items')
        .where({ id: itemId, company_id: companyId })
        .select('standard_cost')
        .first();
      return parseNum(item?.standard_cost);
    }
    if (productId) {
      const product = await db('products')
        .where({ id: productId, company_id: companyId })
        .select('standard_cost')
        .first();
      return parseNum(product?.standard_cost);
    }
    return 0;
  }

  // ──────────────────────────────────────────────────────────
  // FIFO cost layer consumption
  // Finds oldest inward entries with remaining balance and
  // consumes them in order.
  // ──────────────────────────────────────────────────────────

  private async consumeFifoLayers(
    db: Knex,
    companyId: string,
    warehouseId: string,
    itemId?: string,
    productId?: string,
    quantityNeeded: number = 0
  ): Promise<{ consumedCost: number; consumedDetails: { entry_id: string; quantity: number; cost: number }[] }> {
    // Get all inward entries sorted by date (oldest first)
    // For FIFO, we track consumption by looking at total in vs total out
    let query = db('stock_ledger')
      .where({
        company_id: companyId,
        warehouse_id: warehouseId,
      })
      .andWhere('quantity_in', '>', 0)
      .orderBy('transaction_date', 'asc')
      .orderBy('created_at', 'asc');

    if (itemId) {
      query = query.where('item_id', itemId);
    }
    if (productId) {
      query = query.where('product_id', productId);
    }

    const inwardEntries = await query.select('id', 'quantity_in', 'unit_cost', 'transaction_date');

    // Get total already consumed (sum of all outward for this item+warehouse)
    let outQuery = db('stock_ledger')
      .where({
        company_id: companyId,
        warehouse_id: warehouseId,
      })
      .andWhere('quantity_out', '>', 0);

    if (itemId) {
      outQuery = outQuery.where('item_id', itemId);
    }
    if (productId) {
      outQuery = outQuery.where('product_id', productId);
    }

    const outResult = await outQuery.sum('quantity_out as total_out').first();
    let totalAlreadyConsumed = parseNum(outResult?.total_out);

    // Walk through inward layers, skip already consumed, consume new quantity
    let remainingToConsume = quantityNeeded;
    let consumedCost = 0;
    const consumedDetails: { entry_id: string; quantity: number; cost: number }[] = [];

    for (const entry of inwardEntries) {
      if (remainingToConsume <= 0) break;

      const layerQty = parseNum(entry.quantity_in);
      const layerCost = parseNum(entry.unit_cost);

      if (totalAlreadyConsumed >= layerQty) {
        // This entire layer was already consumed
        totalAlreadyConsumed -= layerQty;
        continue;
      }

      // This layer has some remaining
      const layerRemaining = layerQty - totalAlreadyConsumed;
      totalAlreadyConsumed = 0; // Fully accounted for previous consumption

      const consumeFromLayer = Math.min(remainingToConsume, layerRemaining);
      const layerValue = round2(consumeFromLayer * layerCost);

      consumedCost += layerValue;
      consumedDetails.push({
        entry_id: entry.id,
        quantity: consumeFromLayer,
        cost: layerValue,
      });

      remainingToConsume -= consumeFromLayer;
    }

    if (remainingToConsume > 0.001) {
      // Tolerance for floating point
      throw new Error(
        `FIFO: Insufficient cost layers. Could not consume ${remainingToConsume} units.`
      );
    }

    return { consumedCost: round2(consumedCost), consumedDetails };
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC: Get current stock balance from stock_summary
  // ──────────────────────────────────────────────────────────

  async getStockBalance(
    companyId: string,
    warehouseId: string,
    itemId?: string,
    productId?: string
  ): Promise<StockBalance | null> {
    let query = this.db('stock_summary')
      .where({
        company_id: companyId,
        warehouse_id: warehouseId,
      });

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
    if (!summary) return null;

    return {
      available_quantity: parseNum(summary.available_quantity),
      reserved_quantity: parseNum(summary.reserved_quantity),
      on_order_quantity: parseNum(summary.on_order_quantity),
      in_production_quantity: parseNum(summary.in_production_quantity),
      free_quantity: parseNum(summary.free_quantity),
      valuation_rate: summary.valuation_rate ? parseNum(summary.valuation_rate) : null,
      total_value: summary.total_value ? parseNum(summary.total_value) : null,
      uom_id: summary.uom_id,
      last_movement_date: summary.last_movement_date || null,
    };
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC: Get stock balance across ALL warehouses for an item
  // ──────────────────────────────────────────────────────────

  async getStockBalanceAllWarehouses(
    companyId: string,
    itemId?: string,
    productId?: string
  ): Promise<Record<string, any>[]> {
    let query = this.db('stock_summary as ss')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .where('ss.company_id', companyId);

    if (itemId) {
      query = query.where('ss.item_id', itemId);
    }
    if (productId) {
      query = query.where('ss.product_id', productId);
    }

    return await query.select(
      'ss.*',
      'w.name as warehouse_name',
      'w.code as warehouse_code',
      'b.name as branch_name',
      'b.code as branch_code'
    ).orderBy('b.name').orderBy('w.name');
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC: Query stock ledger entries (paginated, filterable)
  // ──────────────────────────────────────────────────────────

  async getStockLedgerEntries(filters: StockLedgerFilters) {
    const {
      companyId,
      page = 1,
      limit = 50,
      branch_id,
      warehouse_id,
      item_id,
      product_id,
      transaction_type,
      reference_type,
      from_date,
      to_date,
      sortBy = 'transaction_date',
      sortOrder = 'desc',
    } = filters;

    const offset = (page - 1) * limit;

    let query = this.db('stock_ledger as sl')
      .where('sl.company_id', companyId);

    if (branch_id) query = query.where('sl.branch_id', branch_id);
    if (warehouse_id) query = query.where('sl.warehouse_id', warehouse_id);
    if (item_id) query = query.where('sl.item_id', item_id);
    if (product_id) query = query.where('sl.product_id', product_id);
    if (transaction_type) query = query.where('sl.transaction_type', transaction_type);
    if (reference_type) query = query.where('sl.reference_type', reference_type);
    if (from_date) query = query.where('sl.transaction_date', '>=', from_date);
    if (to_date) query = query.where('sl.transaction_date', '<=', to_date);

    // Count
    const countResult = await query.clone().count('sl.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    // Data with joins for readable output
    const data = await query
      .clone()
      .leftJoin('items as i', 'sl.item_id', 'i.id')
      .leftJoin('products as p', 'sl.product_id', 'p.id')
      .leftJoin('warehouses as w', 'sl.warehouse_id', 'w.id')
      .leftJoin('branches as br', 'sl.branch_id', 'br.id')
      .leftJoin('units_of_measurement as u', 'sl.uom_id', 'u.id')
      .select(
        'sl.*',
        'i.name as item_name',
        'i.item_code',
        'p.name as product_name',
        'p.product_code',
        'w.name as warehouse_name',
        'br.name as branch_name',
        'u.name as uom_name',
        'u.code as uom_symbol'
      )
      .orderBy(`sl.${sortBy}`, sortOrder)
      .orderBy('sl.created_at', sortOrder)
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC: Update reserved quantity in stock_summary
  // Called when stock reservations change (SO confirm/cancel)
  // ──────────────────────────────────────────────────────────

  async updateReservedQuantity(
    companyId: string,
    warehouseId: string,
    itemId: string | undefined,
    productId: string | undefined,
    deltaQty: number,
    trx?: Knex
  ): Promise<void> {
    const db = trx || this.db;

    let query = db('stock_summary')
      .where({
        company_id: companyId,
        warehouse_id: warehouseId,
      });

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

    const summary = await query.forUpdate().first();
    if (!summary) return;

    const newReserved = round4(parseNum(summary.reserved_quantity) + deltaQty);
    const newFree = round4(parseNum(summary.available_quantity) - newReserved);

    await db('stock_summary')
      .where({ id: summary.id })
      .update({
        reserved_quantity: Math.max(0, newReserved),
        free_quantity: newFree,
      });
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC: Update on-order quantity in stock_summary
  // Called when PO is confirmed (increase) or GRN received (decrease)
  // ──────────────────────────────────────────────────────────

  async updateOnOrderQuantity(
    companyId: string,
    warehouseId: string,
    itemId: string | undefined,
    productId: string | undefined,
    deltaQty: number,
    uomId: string,
    branchId: string,
    trx?: Knex
  ): Promise<void> {
    const db = trx || this.db;

    const summary = await this.getOrCreateSummary(
      db,
      companyId,
      branchId,
      warehouseId,
      itemId,
      productId,
      uomId
    );

    const newOnOrder = round4(parseNum(summary.on_order_quantity) + deltaQty);

    await db('stock_summary')
      .where({ id: summary.id })
      .update({
        on_order_quantity: Math.max(0, newOnOrder),
      });
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC: Update in-production quantity in stock_summary
  // Called when work order consumes raw material or produces goods
  // ──────────────────────────────────────────────────────────

  async updateInProductionQuantity(
    companyId: string,
    warehouseId: string,
    itemId: string | undefined,
    productId: string | undefined,
    deltaQty: number,
    uomId: string,
    branchId: string,
    trx?: Knex
  ): Promise<void> {
    const db = trx || this.db;

    const summary = await this.getOrCreateSummary(
      db,
      companyId,
      branchId,
      warehouseId,
      itemId,
      productId,
      uomId
    );

    const newInProd = round4(parseNum(summary.in_production_quantity) + deltaQty);

    await db('stock_summary')
      .where({ id: summary.id })
      .update({
        in_production_quantity: Math.max(0, newInProd),
      });
  }

  // ──────────────────────────────────────────────────────────
  // ADMIN: Full recalculate balance from ledger
  // Replays all stock_ledger entries to rebuild stock_summary.
  // Use only for data repair / reconciliation.
  // ──────────────────────────────────────────────────────────

  async recalculateBalance(
    companyId: string,
    warehouseId: string,
    itemId?: string,
    productId?: string
  ): Promise<{ recalculated_quantity: number; recalculated_value: number }> {
    return await this.db.transaction(async (trx) => {
      let query = trx('stock_ledger')
        .where({
          company_id: companyId,
          warehouse_id: warehouseId,
        })
        .orderBy('transaction_date', 'asc')
        .orderBy('created_at', 'asc');

      if (itemId) query = query.where('item_id', itemId);
      if (productId) query = query.where('product_id', productId);

      const entries = await query.select(
        'id', 'quantity_in', 'quantity_out', 'unit_cost'
      );

      // Replay all entries
      let runningQty = 0;
      let runningValue = 0;

      for (const entry of entries) {
        const qtyIn = parseNum(entry.quantity_in);
        const qtyOut = parseNum(entry.quantity_out);
        const cost = parseNum(entry.unit_cost);

        if (qtyIn > 0) {
          runningValue = round2(runningValue + (qtyIn * cost));
          runningQty = round4(runningQty + qtyIn);
        }

        if (qtyOut > 0) {
          const outRate = runningQty > 0 ? round4(runningValue / runningQty) : 0;
          runningValue = round2(runningValue - (qtyOut * outRate));
          runningQty = round4(runningQty - qtyOut);
        }

        // Update the entry's balance fields
        await trx('stock_ledger')
          .where({ id: entry.id })
          .update({
            balance_quantity: round4(runningQty),
            balance_value: round2(runningValue),
          });
      }

      // Update stock_summary
      let summaryQuery = trx('stock_summary')
        .where({
          company_id: companyId,
          warehouse_id: warehouseId,
        });

      if (itemId) {
        summaryQuery = summaryQuery.where('item_id', itemId);
      } else {
        summaryQuery = summaryQuery.whereNull('item_id');
      }
      if (productId) {
        summaryQuery = summaryQuery.where('product_id', productId);
      } else {
        summaryQuery = summaryQuery.whereNull('product_id');
      }

      const summary = await summaryQuery.forUpdate().first();
      if (summary) {
        const newRate = runningQty > 0 ? round4(runningValue / runningQty) : 0;
        await trx('stock_summary')
          .where({ id: summary.id })
          .update({
            available_quantity: round4(runningQty),
            valuation_rate: newRate,
            total_value: round2(runningValue),
            free_quantity: round4(runningQty - parseNum(summary.reserved_quantity)),
          });
      }

      return {
        recalculated_quantity: round4(runningQty),
        recalculated_value: round2(runningValue),
      };
    });
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC: Get stock summary list (for stock reports)
  // Paginated, filterable by warehouse/branch/item/product
  // ──────────────────────────────────────────────────────────

  async getStockSummaryList(options: {
    companyId: string;
    branch_id?: string;
    warehouse_id?: string;
    item_id?: string;
    product_id?: string;
    below_minimum?: boolean; // items below min_stock_threshold
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      companyId,
      branch_id,
      warehouse_id,
      item_id,
      product_id,
      below_minimum,
      search,
      page = 1,
      limit = 50,
      sortBy = 'ss.updated_at',
      sortOrder = 'desc',
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('stock_summary as ss')
      .leftJoin('items as i', 'ss.item_id', 'i.id')
      .leftJoin('products as p', 'ss.product_id', 'p.id')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .leftJoin('units_of_measurement as u', 'ss.uom_id', 'u.id')
      .where('ss.company_id', companyId);

    if (branch_id) query = query.where('ss.branch_id', branch_id);
    if (warehouse_id) query = query.where('ss.warehouse_id', warehouse_id);
    if (item_id) query = query.where('ss.item_id', item_id);
    if (product_id) query = query.where('ss.product_id', product_id);

    // Below minimum stock filter
    if (below_minimum) {
      query = query.where(function () {
        this.whereNotNull('i.min_stock_threshold')
          .whereRaw('ss.available_quantity < i.min_stock_threshold');
      });
    }

    // Search across item/product name/code
    if (search) {
      query = query.where(function () {
        this.orWhereILike('i.name', `%${search}%`)
          .orWhereILike('i.item_code', `%${search}%`)
          .orWhereILike('p.name', `%${search}%`)
          .orWhereILike('p.product_code', `%${search}%`);
      });
    }

    // Count
    const countResult = await query.clone().count('ss.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    // Data
    const data = await query
      .clone()
      .select(
        'ss.*',
        'i.name as item_name',
        'i.item_code',
        'i.item_type',
        'i.min_stock_threshold',
        'i.reorder_quantity',
        'i.max_stock_level',
        'p.name as product_name',
        'p.product_code',
        'w.name as warehouse_name',
        'w.code as warehouse_code',
        'b.name as branch_name',
        'b.code as branch_code',
        'u.name as uom_name',
        'u.code as uom_symbol'
      )
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC: Stock valuation report
  // Aggregated stock value per item across warehouses
  // ──────────────────────────────────────────────────────────

  async getStockValuationReport(
    companyId: string,
    branchId?: string,
    warehouseId?: string
  ): Promise<Record<string, any>[]> {
    let query = this.db('stock_summary as ss')
      .leftJoin('items as i', 'ss.item_id', 'i.id')
      .leftJoin('products as p', 'ss.product_id', 'p.id')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .where('ss.company_id', companyId)
      .andWhere('ss.available_quantity', '>', 0);

    if (branchId) query = query.where('ss.branch_id', branchId);
    if (warehouseId) query = query.where('ss.warehouse_id', warehouseId);

    return await query
      .select(
        'ss.item_id',
        'ss.product_id',
        'i.name as item_name',
        'i.item_code',
        'p.name as product_name',
        'p.product_code',
        'w.name as warehouse_name',
        'b.name as branch_name',
        'ss.available_quantity',
        'ss.valuation_rate',
        'ss.total_value',
        'ss.last_purchase_date',
        'ss.last_purchase_rate',
        'ss.last_sale_date',
        'ss.last_movement_date'
      )
      .orderBy('b.name')
      .orderBy('w.name')
      .orderByRaw("COALESCE(i.name, p.name)");
  }

  // ============================================================
  // STEP 28: REAL-TIME STOCK VISIBILITY APIs
  // ============================================================

  // ──────────────────────────────────────────────────────────
  // Branch-wise aggregated stock report
  // Totals per branch across all warehouses
  // ──────────────────────────────────────────────────────────

  async getBranchWiseStock(companyId: string, branchId?: string) {
    let query = this.db('stock_summary as ss')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .where('ss.company_id', companyId)
      .andWhere('ss.available_quantity', '>', 0);

    if (branchId) query = query.where('ss.branch_id', branchId);

    const data = await query
      .select(
        'ss.branch_id',
        'b.name as branch_name',
        'b.code as branch_code'
      )
      .sum('ss.available_quantity as total_available')
      .sum('ss.reserved_quantity as total_reserved')
      .sum('ss.free_quantity as total_free')
      .sum('ss.total_value as total_value')
      .count('ss.id as item_count')
      .groupBy('ss.branch_id', 'b.name', 'b.code')
      .orderBy('b.name');

    return data;
  }

  // ──────────────────────────────────────────────────────────
  // Warehouse-wise stock report with indicators
  // Shows per-warehouse totals + item breakdown
  // ──────────────────────────────────────────────────────────

  async getWarehouseWiseStock(companyId: string, options: {
    branch_id?: string;
    warehouse_id?: string;
  } = {}) {
    let query = this.db('stock_summary as ss')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .where('ss.company_id', companyId)
      .andWhere('ss.available_quantity', '>', 0);

    if (options.branch_id) query = query.where('ss.branch_id', options.branch_id);
    if (options.warehouse_id) query = query.where('ss.warehouse_id', options.warehouse_id);

    const data = await query
      .select(
        'ss.warehouse_id',
        'w.name as warehouse_name',
        'w.code as warehouse_code',
        'ss.branch_id',
        'b.name as branch_name',
        'b.code as branch_code'
      )
      .sum('ss.available_quantity as total_available')
      .sum('ss.reserved_quantity as total_reserved')
      .sum('ss.free_quantity as total_free')
      .sum('ss.total_value as total_value')
      .count('ss.id as item_count')
      .groupBy(
        'ss.warehouse_id', 'w.name', 'w.code',
        'ss.branch_id', 'b.name', 'b.code'
      )
      .orderBy('b.name')
      .orderBy('w.name');

    return data;
  }

  // ──────────────────────────────────────────────────────────
  // Low stock alerts — items below min_stock_threshold
  // ──────────────────────────────────────────────────────────

  async getLowStockItems(companyId: string, options: {
    branch_id?: string;
    warehouse_id?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { branch_id, warehouse_id, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .leftJoin('units_of_measurement as u', 'ss.uom_id', 'u.id')
      .where('ss.company_id', companyId)
      .whereNotNull('i.min_stock_threshold')
      .whereRaw('ss.available_quantity < i.min_stock_threshold');

    if (branch_id) query = query.where('ss.branch_id', branch_id);
    if (warehouse_id) query = query.where('ss.warehouse_id', warehouse_id);

    const countResult = await query.clone().count('ss.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .select(
        'ss.id',
        'ss.item_id',
        'i.name as item_name',
        'i.item_code',
        'i.item_type',
        'ss.warehouse_id',
        'w.name as warehouse_name',
        'ss.branch_id',
        'b.name as branch_name',
        'ss.available_quantity',
        'i.min_stock_threshold',
        'i.reorder_quantity',
        'i.max_stock_level',
        'i.lead_time_days',
        'ss.reserved_quantity',
        'ss.free_quantity',
        'ss.last_purchase_date',
        'ss.last_movement_date',
        'u.code as uom_symbol'
      )
      .select(
        this.db.raw('ROUND(i.min_stock_threshold - ss.available_quantity, 3) as shortage_quantity'),
        this.db.raw(`
          CASE
            WHEN ss.available_quantity <= 0 THEN 'out_of_stock'
            WHEN ss.available_quantity <= i.min_stock_threshold * 0.5 THEN 'critical'
            ELSE 'low'
          END as severity
        `)
      )
      .orderByRaw(`
        CASE
          WHEN ss.available_quantity <= 0 THEN 1
          WHEN ss.available_quantity <= i.min_stock_threshold * 0.5 THEN 2
          ELSE 3
        END
      `)
      .orderBy('i.name')
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────────────────────────────────────────────────────────
  // Overstock alerts — items above max_stock_level
  // ──────────────────────────────────────────────────────────

  async getOverstockItems(companyId: string, options: {
    branch_id?: string;
    warehouse_id?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { branch_id, warehouse_id, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .leftJoin('units_of_measurement as u', 'ss.uom_id', 'u.id')
      .where('ss.company_id', companyId)
      .whereNotNull('i.max_stock_level')
      .where('i.max_stock_level', '>', 0)
      .whereRaw('ss.available_quantity > i.max_stock_level');

    if (branch_id) query = query.where('ss.branch_id', branch_id);
    if (warehouse_id) query = query.where('ss.warehouse_id', warehouse_id);

    const countResult = await query.clone().count('ss.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .select(
        'ss.id',
        'ss.item_id',
        'i.name as item_name',
        'i.item_code',
        'i.item_type',
        'ss.warehouse_id',
        'w.name as warehouse_name',
        'ss.branch_id',
        'b.name as branch_name',
        'ss.available_quantity',
        'i.max_stock_level',
        'ss.valuation_rate',
        'ss.total_value',
        'ss.last_sale_date',
        'ss.last_movement_date',
        'u.code as uom_symbol'
      )
      .select(
        this.db.raw('ROUND(ss.available_quantity - i.max_stock_level, 3) as excess_quantity'),
        this.db.raw('ROUND((ss.available_quantity - i.max_stock_level) * COALESCE(ss.valuation_rate, 0), 2) as excess_value')
      )
      .orderByRaw('(ss.available_quantity - i.max_stock_level) DESC')
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────────────────────────────────────────────────────────
  // Dead / slow-moving stock
  // Items with no movement in the last N days (default 90)
  // ──────────────────────────────────────────────────────────

  async getSlowMovingStock(companyId: string, options: {
    days_threshold?: number;
    branch_id?: string;
    warehouse_id?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { days_threshold = 90, branch_id, warehouse_id, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days_threshold);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let query = this.db('stock_summary as ss')
      .leftJoin('items as i', 'ss.item_id', 'i.id')
      .leftJoin('products as p', 'ss.product_id', 'p.id')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .leftJoin('units_of_measurement as u', 'ss.uom_id', 'u.id')
      .where('ss.company_id', companyId)
      .andWhere('ss.available_quantity', '>', 0)
      .where(function () {
        this.whereNull('ss.last_movement_date')
          .orWhere('ss.last_movement_date', '<', cutoffStr);
      });

    if (branch_id) query = query.where('ss.branch_id', branch_id);
    if (warehouse_id) query = query.where('ss.warehouse_id', warehouse_id);

    const countResult = await query.clone().count('ss.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .select(
        'ss.id',
        'ss.item_id',
        'ss.product_id',
        'i.name as item_name',
        'i.item_code',
        'p.name as product_name',
        'p.product_code',
        'ss.warehouse_id',
        'w.name as warehouse_name',
        'ss.branch_id',
        'b.name as branch_name',
        'ss.available_quantity',
        'ss.valuation_rate',
        'ss.total_value',
        'ss.last_movement_date',
        'ss.last_sale_date',
        'ss.last_purchase_date',
        'u.code as uom_symbol'
      )
      .select(
        this.db.raw(`
          CASE
            WHEN ss.last_movement_date IS NULL THEN 'dead_stock'
            WHEN ss.last_movement_date < (CURRENT_DATE - INTERVAL '${days_threshold * 2} days') THEN 'dead_stock'
            ELSE 'slow_moving'
          END as classification
        `),
        this.db.raw(`
          CASE
            WHEN ss.last_movement_date IS NULL THEN NULL
            ELSE (CURRENT_DATE - ss.last_movement_date::date)
          END as days_since_last_movement
        `)
      )
      .orderByRaw('ss.last_movement_date ASC NULLS FIRST')
      .limit(limit)
      .offset(offset);

    // Calculate total tied-up value
    const valueResult = await query.clone()
      .clearSelect()
      .clearOrder()
      .sum('ss.total_value as tied_up_value')
      .first();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        tied_up_value: parseFloat(String(valueResult?.tied_up_value || '0')),
        days_threshold,
      },
    };
  }

  // ──────────────────────────────────────────────────────────
  // Stock movement summary
  // Aggregated inward vs outward over a date range
  // ──────────────────────────────────────────────────────────

  async getStockMovementSummary(companyId: string, options: {
    from_date: string;
    to_date: string;
    branch_id?: string;
    warehouse_id?: string;
    item_id?: string;
    product_id?: string;
    group_by?: 'transaction_type' | 'item' | 'warehouse' | 'date';
  }) {
    const {
      from_date, to_date,
      branch_id, warehouse_id,
      item_id, product_id,
      group_by = 'transaction_type',
    } = options;

    let query = this.db('stock_ledger as sl')
      .where('sl.company_id', companyId)
      .andWhere('sl.transaction_date', '>=', from_date)
      .andWhere('sl.transaction_date', '<=', to_date);

    if (branch_id) query = query.where('sl.branch_id', branch_id);
    if (warehouse_id) query = query.where('sl.warehouse_id', warehouse_id);
    if (item_id) query = query.where('sl.item_id', item_id);
    if (product_id) query = query.where('sl.product_id', product_id);

    // Define grouping and select based on group_by
    let groupFields: string[];
    let selectFields: any[];

    switch (group_by) {
      case 'item':
        query = query
          .leftJoin('items as i', 'sl.item_id', 'i.id')
          .leftJoin('products as p', 'sl.product_id', 'p.id');
        groupFields = ['sl.item_id', 'sl.product_id', 'i.name', 'i.item_code', 'p.name', 'p.product_code'];
        selectFields = [
          'sl.item_id',
          'sl.product_id',
          'i.name as item_name',
          'i.item_code',
          'p.name as product_name',
          'p.product_code',
        ];
        break;

      case 'warehouse':
        query = query.join('warehouses as w', 'sl.warehouse_id', 'w.id');
        groupFields = ['sl.warehouse_id', 'w.name', 'w.code'];
        selectFields = [
          'sl.warehouse_id',
          'w.name as warehouse_name',
          'w.code as warehouse_code',
        ];
        break;

      case 'date':
        groupFields = ['sl.transaction_date'];
        selectFields = ['sl.transaction_date'];
        break;

      default: // transaction_type
        groupFields = ['sl.transaction_type'];
        selectFields = ['sl.transaction_type'];
        break;
    }

    const data = await query
      .select(...selectFields)
      .sum('sl.quantity_in as total_in')
      .sum('sl.quantity_out as total_out')
      .sum('sl.total_value as total_value')
      .count('sl.id as transaction_count')
      .groupBy(...groupFields)
      .orderBy(groupFields[0]);

    // Overall totals
    let totalsQuery = this.db('stock_ledger as sl')
      .where('sl.company_id', companyId)
      .andWhere('sl.transaction_date', '>=', from_date)
      .andWhere('sl.transaction_date', '<=', to_date);

    if (branch_id) totalsQuery = totalsQuery.where('sl.branch_id', branch_id);
    if (warehouse_id) totalsQuery = totalsQuery.where('sl.warehouse_id', warehouse_id);
    if (item_id) totalsQuery = totalsQuery.where('sl.item_id', item_id);
    if (product_id) totalsQuery = totalsQuery.where('sl.product_id', product_id);

    const totals = await totalsQuery
      .sum('sl.quantity_in as grand_total_in')
      .sum('sl.quantity_out as grand_total_out')
      .count('sl.id as grand_transaction_count')
      .first();

    return {
      data,
      summary: {
        from_date,
        to_date,
        grand_total_in: parseFloat(String(totals?.grand_total_in || '0')),
        grand_total_out: parseFloat(String(totals?.grand_total_out || '0')),
        net_movement: parseFloat(String(totals?.grand_total_in || '0')) - parseFloat(String(totals?.grand_total_out || '0')),
        grand_transaction_count: parseInt(String(totals?.grand_transaction_count || '0'), 10),
        group_by,
      },
    };
  }

  // ──────────────────────────────────────────────────────────
  // Fast-moving items — most outward movements in N days
  // ──────────────────────────────────────────────────────────

  async getFastMovingItems(companyId: string, options: {
    days?: number;
    branch_id?: string;
    warehouse_id?: string;
    limit?: number;
  } = {}) {
    const { days = 30, branch_id, warehouse_id, limit: resultLimit = 20 } = options;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let query = this.db('stock_ledger as sl')
      .leftJoin('items as i', 'sl.item_id', 'i.id')
      .leftJoin('products as p', 'sl.product_id', 'p.id')
      .where('sl.company_id', companyId)
      .andWhere('sl.transaction_date', '>=', cutoffStr)
      .andWhere('sl.quantity_out', '>', 0);

    if (branch_id) query = query.where('sl.branch_id', branch_id);
    if (warehouse_id) query = query.where('sl.warehouse_id', warehouse_id);

    const data = await query
      .select(
        'sl.item_id',
        'sl.product_id',
        'i.name as item_name',
        'i.item_code',
        'p.name as product_name',
        'p.product_code'
      )
      .sum('sl.quantity_out as total_consumed')
      .count('sl.id as transaction_count')
      .groupBy('sl.item_id', 'sl.product_id', 'i.name', 'i.item_code', 'p.name', 'p.product_code')
      .orderByRaw('SUM(sl.quantity_out) DESC')
      .limit(resultLimit);

    return {
      data,
      summary: { days, item_count: data.length },
    };
  }
}

export const inventoryService = new InventoryService();