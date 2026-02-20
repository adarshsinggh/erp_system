// =============================================================
// File: server/routes/reports.ts
// Module: Reporting Engine — Phase 13 (Step 46)
// Description: All report endpoints across 6 categories.
//   Common query params: ?date_from=&date_to=&branch_id=
//
// SALES:
//   GET /api/reports/sales/by-customer
//   GET /api/reports/sales/by-product
//   GET /api/reports/sales/by-branch
//   GET /api/reports/sales/by-period
//
// PURCHASE:
//   GET /api/reports/purchase/by-vendor
//   GET /api/reports/purchase/by-item
//   GET /api/reports/purchase/vendor-comparison
//
// INVENTORY:
//   GET /api/reports/inventory/stock-summary
//   GET /api/reports/inventory/stock-valuation
//   GET /api/reports/inventory/stock-movement
//
// FINANCIAL:
//   GET /api/reports/financial/trial-balance
//   GET /api/reports/financial/profit-and-loss
//   GET /api/reports/financial/balance-sheet
//   GET /api/reports/financial/outstanding-receivables
//   GET /api/reports/financial/outstanding-payables
//   GET /api/reports/financial/ledger
//
// MANUFACTURING:
//   GET /api/reports/manufacturing/production-summary
//   GET /api/reports/manufacturing/scrap-analysis
//   GET /api/reports/manufacturing/consumption-variance
//
// BRANCH:
//   GET /api/reports/branch/warehouse-profitability
//   GET /api/reports/branch/product-profitability
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { reportsService } from '../services/reports.service';

// Helper to extract common filters from query params
function extractFilters(query: any, companyId: string) {
  return {
    companyId,
    branch_id: query.branch_id,
    date_from: query.date_from,
    date_to: query.date_to,
    page: query.page ? parseInt(query.page, 10) : 1,
    limit: query.limit ? parseInt(query.limit, 10) : 100,
  };
}

export async function reportRoutes(server: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════
  // SALES REPORTS
  // ═══════════════════════════════════════════════════════════

  server.get('/reports/sales/by-customer', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.salesByCustomer(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'sales_by_customer', data };
  });

  server.get('/reports/sales/by-product', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.salesByProduct(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'sales_by_product', data };
  });

  server.get('/reports/sales/by-branch', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.salesByBranch(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'sales_by_branch', data };
  });

  server.get('/reports/sales/by-period', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.salesByPeriod(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'sales_by_period', data };
  });

  // ═══════════════════════════════════════════════════════════
  // PURCHASE REPORTS
  // ═══════════════════════════════════════════════════════════

  server.get('/reports/purchase/by-vendor', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.purchaseByVendor(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'purchase_by_vendor', data };
  });

  server.get('/reports/purchase/by-item', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.purchaseByItem(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'purchase_by_item', data };
  });

  /** Query: ?item_id= (optional — if omitted, shows all items with vendors) */
  server.get('/reports/purchase/vendor-comparison', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as any;
    const data = await reportsService.vendorComparison({
      ...extractFilters(query, request.user!.companyId),
      item_id: query.item_id,
    });
    return { success: true, report: 'vendor_comparison', data };
  });

  // ═══════════════════════════════════════════════════════════
  // INVENTORY REPORTS
  // ═══════════════════════════════════════════════════════════

  /** Query: ?branch_id=&warehouse_id= */
  server.get('/reports/inventory/stock-summary', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as any;
    const data = await reportsService.stockSummary({
      ...extractFilters(query, request.user!.companyId),
      warehouse_id: query.warehouse_id,
    });
    return { success: true, report: 'stock_summary', data };
  });

  server.get('/reports/inventory/stock-valuation', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.stockValuation(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'stock_valuation', data };
  });

  /** Query: ?item_id=&warehouse_id=&transaction_type=&date_from=&date_to=&page=&limit= */
  server.get('/reports/inventory/stock-movement', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as any;
    const data = await reportsService.stockMovement({
      ...extractFilters(query, request.user!.companyId),
      item_id: query.item_id,
      warehouse_id: query.warehouse_id,
      transaction_type: query.transaction_type,
    });
    return { success: true, report: 'stock_movement', data };
  });

  // ═══════════════════════════════════════════════════════════
  // FINANCIAL REPORTS
  // ═══════════════════════════════════════════════════════════

  server.get('/reports/financial/trial-balance', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.trialBalance(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'trial_balance', data };
  });

  server.get('/reports/financial/profit-and-loss', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.profitAndLoss(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'profit_and_loss', data };
  });

  server.get('/reports/financial/balance-sheet', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.balanceSheet(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'balance_sheet', data };
  });

  server.get('/reports/financial/outstanding-receivables', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.outstandingReceivables(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'outstanding_receivables', data };
  });

  server.get('/reports/financial/outstanding-payables', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.outstandingPayables(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'outstanding_payables', data };
  });

  /** Query: ?account_id=&party_type=&party_id=&date_from=&date_to=&page=&limit= */
  server.get('/reports/financial/ledger', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as any;
    const data = await reportsService.ledgerReport({
      ...extractFilters(query, request.user!.companyId),
      account_id: query.account_id,
      party_type: query.party_type,
      party_id: query.party_id,
    });
    return { success: true, report: 'ledger', data };
  });

  // ═══════════════════════════════════════════════════════════
  // MANUFACTURING REPORTS
  // ═══════════════════════════════════════════════════════════

  server.get('/reports/manufacturing/production-summary', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.productionSummary(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'production_summary', data };
  });

  server.get('/reports/manufacturing/scrap-analysis', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.scrapAnalysis(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'scrap_analysis', data };
  });

  /** Query: ?work_order_id= (optional) */
  server.get('/reports/manufacturing/consumption-variance', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as any;
    const data = await reportsService.consumptionVariance({
      ...extractFilters(query, request.user!.companyId),
      work_order_id: query.work_order_id,
    });
    return { success: true, report: 'consumption_variance', data };
  });

  // ═══════════════════════════════════════════════════════════
  // BRANCH REPORTS
  // ═══════════════════════════════════════════════════════════

  server.get('/reports/branch/warehouse-profitability', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.warehouseProfitability(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'warehouse_profitability', data };
  });

  server.get('/reports/branch/product-profitability', { preHandler: [authenticate] }, async (request) => {
    const data = await reportsService.productProfitability(extractFilters(request.query, request.user!.companyId));
    return { success: true, report: 'product_profitability', data };
  });
}