// =============================================================
// File: server/routes/inventory.ts
// Module: Inventory Management — Phase 7, Step 27
// Description: REST API routes for Inventory / Stock Ledger.
//              Endpoints:
//                GET /inventory/stock-ledger   — query ledger entries
//                GET /inventory/stock-summary  — stock summary list
//                GET /inventory/stock-balance  — single item balance
//                GET /inventory/stock-balance/all-warehouses — item across all warehouses
//                GET /inventory/valuation      — stock valuation report
//                POST /inventory/recalculate   — admin: recalculate balance from ledger
//
// Note: recordMovement() is NOT exposed as a direct REST endpoint.
//       It is called internally by GRN, Production, Delivery Challan,
//       Transfer, and Adjustment services.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { inventoryService } from '../services/inventory.service';

export async function inventoryRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // GET /inventory/stock-ledger
  // Query append-only stock ledger entries with filters.
  //
  // Query params:
  //   page, limit, branch_id, warehouse_id, item_id, product_id,
  //   transaction_type, reference_type, from_date, to_date,
  //   sort_by, sort_order
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/stock-ledger', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit,
      branch_id, warehouse_id,
      item_id, product_id,
      transaction_type, reference_type,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await inventoryService.getStockLedgerEntries({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      branch_id,
      warehouse_id,
      item_id,
      product_id,
      transaction_type,
      reference_type,
      from_date,
      to_date,
      sortBy: sort_by || 'transaction_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/stock-summary
  // Paginated stock summary across items and warehouses.
  //
  // Query params:
  //   page, limit, branch_id, warehouse_id, item_id, product_id,
  //   below_minimum (boolean), search, sort_by, sort_order
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/stock-summary', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const {
        page, limit,
        branch_id, warehouse_id,
        item_id, product_id,
        below_minimum, search,
        sort_by, sort_order,
      } = request.query as any;

      const result = await inventoryService.getStockSummaryList({
        companyId: request.user!.companyId,
        branch_id,
        warehouse_id,
        item_id,
        product_id,
        below_minimum: below_minimum === 'true' || below_minimum === '1',
        search,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        sortBy: sort_by || 'ss.updated_at',
        sortOrder: sort_order || 'desc',
      });

      return { success: true, ...result };
    } catch (error: any) {
      server.log.error(error);
      return reply.code(500).send({ success: false, error: error.message || 'Failed to fetch stock summary', data: [], total: 0, page: 1, limit: 50, totalPages: 0 });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/stock-balance
  // Get current stock balance for a single item in a warehouse.
  //
  // Query params (required): warehouse_id + (item_id OR product_id)
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/stock-balance', { preHandler: [authenticate] }, async (request, reply) => {
    const { warehouse_id, item_id, product_id } = request.query as any;

    if (!warehouse_id) {
      return reply.code(400).send({ success: false, error: 'warehouse_id is required' });
    }
    if (!item_id && !product_id) {
      return reply.code(400).send({ success: false, error: 'Either item_id or product_id is required' });
    }

    const balance = await inventoryService.getStockBalance(
      request.user!.companyId,
      warehouse_id,
      item_id || undefined,
      product_id || undefined
    );

    if (!balance) {
      return {
        success: true,
        data: {
          available_quantity: 0,
          reserved_quantity: 0,
          on_order_quantity: 0,
          in_production_quantity: 0,
          free_quantity: 0,
          valuation_rate: null,
          total_value: null,
          uom_id: null,
          last_movement_date: null,
        },
        message: 'No stock record found. Item has zero stock in this warehouse.',
      };
    }

    return { success: true, data: balance };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/stock-balance/all-warehouses
  // Get stock balance for an item/product across ALL warehouses.
  //
  // Query params (required): item_id OR product_id
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/stock-balance/all-warehouses', { preHandler: [authenticate] }, async (request, reply) => {
    const { item_id, product_id } = request.query as any;

    if (!item_id && !product_id) {
      return reply.code(400).send({ success: false, error: 'Either item_id or product_id is required' });
    }

    const balances = await inventoryService.getStockBalanceAllWarehouses(
      request.user!.companyId,
      item_id || undefined,
      product_id || undefined
    );

    // Calculate totals across all warehouses
    let totalAvailable = 0;
    let totalReserved = 0;
    let totalValue = 0;

    for (const row of balances) {
      totalAvailable += parseFloat(row.available_quantity) || 0;
      totalReserved += parseFloat(row.reserved_quantity) || 0;
      totalValue += parseFloat(row.total_value) || 0;
    }

    return {
      success: true,
      data: balances,
      summary: {
        total_available: Math.round(totalAvailable * 1000) / 1000,
        total_reserved: Math.round(totalReserved * 1000) / 1000,
        total_free: Math.round((totalAvailable - totalReserved) * 1000) / 1000,
        total_value: Math.round(totalValue * 100) / 100,
        warehouse_count: balances.length,
      },
    };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/valuation
  // Stock valuation report — aggregated value per item/warehouse.
  //
  // Query params (optional): branch_id, warehouse_id
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/valuation', { preHandler: [authenticate] }, async (request) => {
    const { branch_id, warehouse_id } = request.query as any;

    const data = await inventoryService.getStockValuationReport(
      request.user!.companyId,
      branch_id || undefined,
      warehouse_id || undefined
    );

    // Calculate grand totals
    let grandTotal = 0;
    for (const row of data) {
      grandTotal += parseFloat(row.total_value) || 0;
    }

    return {
      success: true,
      data,
      summary: {
        total_items: data.length,
        grand_total_value: Math.round(grandTotal * 100) / 100,
      },
    };
  });

  // ──────────────────────────────────────────────────────────
  // POST /inventory/recalculate
  // Admin utility: Recalculate stock balance from ledger.
  // Replays all ledger entries to fix any inconsistencies.
  //
  // Body: { warehouse_id, item_id?, product_id? }
  // ──────────────────────────────────────────────────────────
  server.post('/inventory/recalculate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      if (!body.warehouse_id) {
        return reply.code(400).send({ success: false, error: 'warehouse_id is required' });
      }
      if (!body.item_id && !body.product_id) {
        return reply.code(400).send({ success: false, error: 'Either item_id or product_id is required' });
      }

      const result = await inventoryService.recalculateBalance(
        request.user!.companyId,
        body.warehouse_id,
        body.item_id || undefined,
        body.product_id || undefined
      );

      return {
        success: true,
        message: 'Stock balance recalculated from ledger entries',
        data: result,
      };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
}