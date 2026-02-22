// =============================================================
// File: server/services/reports.service.ts
// Module: Reporting Engine — Phase 13 (Step 46)
// Description: Comprehensive report generation across 6 categories:
//   1. Sales Reports — by customer, product, branch, period
//   2. Purchase Reports — by vendor, item, vendor comparison
//   3. Inventory Reports — stock summary, valuation, movement, slow/fast
//   4. Financial Reports — P&L, trial balance, ledger, outstanding
//   5. Manufacturing Reports — production, scrap, BOM cost, variance
//   6. Branch Reports — branch P&L, warehouse profitability
//
//   All reports return structured JSON. Export (PDF/Excel/CSV)
//   will be handled at the route/frontend layer.
// =============================================================

import { BaseService } from './base.service';

// Common report filter interface
interface ReportFilters {
  companyId: string;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

class ReportsService extends BaseService {
  constructor() {
    super('companies');
  }

  // ═══════════════════════════════════════════════════════════
  // 1. SALES REPORTS
  // ═══════════════════════════════════════════════════════════

  /** Sales by Customer */
  async salesByCustomer(filters: ReportFilters) {
    const { companyId, branch_id, date_from, date_to } = filters;

    let query = this.db('sales_invoices as si')
      .join('customers as c', 'si.customer_id', 'c.id')
      .where('si.company_id', companyId)
      .where('si.is_deleted', false)
      .whereNotIn('si.status', ['draft', 'cancelled']);

    if (branch_id) query = query.where('si.branch_id', branch_id);
    if (date_from) query = query.where('si.invoice_date', '>=', date_from);
    if (date_to) query = query.where('si.invoice_date', '<=', date_to);

    const data = await query
      .select(
        'c.id as customer_id', 'c.customer_code', 'c.name as customer_name',
        this.db.raw('COUNT(si.id) as invoice_count'),
        this.db.raw('SUM(si.subtotal) as total_subtotal'),
        this.db.raw('SUM(si.total_tax) as total_tax'),
        this.db.raw('SUM(si.grand_total) as total_amount'),
        this.db.raw('MIN(si.invoice_date) as first_invoice'),
        this.db.raw('MAX(si.invoice_date) as last_invoice')
      )
      .groupBy('c.id', 'c.customer_code', 'c.name')
      .orderBy('total_amount', 'desc');

    const totals = data.reduce((acc: any, r: any) => ({
      total_invoices: acc.total_invoices + parseInt(r.invoice_count, 10),
      total_amount: acc.total_amount + parseFloat(r.total_amount || 0),
      total_tax: acc.total_tax + parseFloat(r.total_tax || 0),
    }), { total_invoices: 0, total_amount: 0, total_tax: 0 });

    return { data, totals, filters: { date_from, date_to, branch_id } };
  }

  /** Sales by Product/Item */
  async salesByProduct(filters: ReportFilters) {
    const { companyId, branch_id, date_from, date_to } = filters;

    let query = this.db('sales_invoice_lines as sil')
      .join('sales_invoices as si', 'sil.invoice_id', 'si.id')
      .leftJoin('items as i', 'sil.item_id', 'i.id')
      .leftJoin('products as p', 'sil.product_id', 'p.id')
      .where('si.company_id', companyId)
      .where('si.is_deleted', false)
      .where('sil.is_deleted', false)
      .whereNotIn('si.status', ['draft', 'cancelled']);

    if (branch_id) query = query.where('si.branch_id', branch_id);
    if (date_from) query = query.where('si.invoice_date', '>=', date_from);
    if (date_to) query = query.where('si.invoice_date', '<=', date_to);

    return query
      .select(
        this.db.raw("COALESCE(i.item_code, p.product_code) as code"),
        this.db.raw("COALESCE(i.name, p.name) as name"),
        this.db.raw("CASE WHEN sil.item_id IS NOT NULL THEN 'item' ELSE 'product' END as type"),
        this.db.raw('SUM(sil.quantity) as total_quantity'),
        this.db.raw('SUM(sil.line_total) as total_amount'),
        this.db.raw('SUM(sil.tax_amount) as total_tax'),
        this.db.raw('COUNT(DISTINCT si.id) as invoice_count')
      )
      .groupByRaw("COALESCE(i.item_code, p.product_code), COALESCE(i.name, p.name), CASE WHEN sil.item_id IS NOT NULL THEN 'item' ELSE 'product' END")
      .orderBy('total_amount', 'desc');
  }

  /** Sales by Branch */
  async salesByBranch(filters: ReportFilters) {
    const { companyId, date_from, date_to } = filters;

    let query = this.db('sales_invoices as si')
      .join('branches as b', 'si.branch_id', 'b.id')
      .where('si.company_id', companyId)
      .where('si.is_deleted', false)
      .whereNotIn('si.status', ['draft', 'cancelled']);

    if (date_from) query = query.where('si.invoice_date', '>=', date_from);
    if (date_to) query = query.where('si.invoice_date', '<=', date_to);

    return query
      .select(
        'b.id as branch_id', 'b.code as branch_code', 'b.name as branch_name',
        this.db.raw('COUNT(si.id) as invoice_count'),
        this.db.raw('SUM(si.subtotal) as total_subtotal'),
        this.db.raw('SUM(si.total_tax) as total_tax'),
        this.db.raw('SUM(si.grand_total) as total_amount')
      )
      .groupBy('b.id', 'b.code', 'b.name')
      .orderBy('total_amount', 'desc');
  }

  /** Period-based Sales Summary (monthly) */
  async salesByPeriod(filters: ReportFilters) {
    const { companyId, branch_id, date_from, date_to } = filters;

    let query = this.db('sales_invoices as si')
      .where('si.company_id', companyId)
      .where('si.is_deleted', false)
      .whereNotIn('si.status', ['draft', 'cancelled']);

    if (branch_id) query = query.where('si.branch_id', branch_id);
    if (date_from) query = query.where('si.invoice_date', '>=', date_from);
    if (date_to) query = query.where('si.invoice_date', '<=', date_to);

    return query
      .select(
        this.db.raw("TO_CHAR(si.invoice_date, 'YYYY-MM') as period"),
        this.db.raw('COUNT(si.id) as invoice_count'),
        this.db.raw('SUM(si.grand_total) as total_amount'),
        this.db.raw('SUM(si.total_tax) as total_tax')
      )
      .groupByRaw("TO_CHAR(si.invoice_date, 'YYYY-MM')")
      .orderBy('period', 'asc');
  }

  // ═══════════════════════════════════════════════════════════
  // 2. PURCHASE REPORTS
  // ═══════════════════════════════════════════════════════════

  /** Purchase by Vendor */
  async purchaseByVendor(filters: ReportFilters) {
    const { companyId, branch_id, date_from, date_to } = filters;

    let query = this.db('vendor_bills as vb')
      .join('vendors as v', 'vb.vendor_id', 'v.id')
      .where('vb.company_id', companyId)
      .where('vb.is_deleted', false)
      .whereNotIn('vb.status', ['draft', 'cancelled']);

    if (branch_id) query = query.where('vb.branch_id', branch_id);
    if (date_from) query = query.where('vb.bill_date', '>=', date_from);
    if (date_to) query = query.where('vb.bill_date', '<=', date_to);

    return query
      .select(
        'v.id as vendor_id', 'v.vendor_code', 'v.name as vendor_name',
        this.db.raw('COUNT(vb.id) as bill_count'),
        this.db.raw('SUM(vb.subtotal) as total_subtotal'),
        this.db.raw('SUM(vb.total_tax) as total_tax'),
        this.db.raw('SUM(vb.grand_total) as total_amount')
      )
      .groupBy('v.id', 'v.vendor_code', 'v.name')
      .orderBy('total_amount', 'desc');
  }

  /** Purchase by Item */
  async purchaseByItem(filters: ReportFilters) {
    const { companyId, branch_id, date_from, date_to } = filters;

    let query = this.db('vendor_bill_lines as vbl')
      .join('vendor_bills as vb', 'vbl.bill_id', 'vb.id')
      .leftJoin('items as i', 'vbl.item_id', 'i.id')
      .where('vb.company_id', companyId)
      .where('vb.is_deleted', false)
      .where('vbl.is_deleted', false)
      .whereNotIn('vb.status', ['draft', 'cancelled']);

    if (branch_id) query = query.where('vb.branch_id', branch_id);
    if (date_from) query = query.where('vb.bill_date', '>=', date_from);
    if (date_to) query = query.where('vb.bill_date', '<=', date_to);

    return query
      .select(
        'i.id as item_id', 'i.item_code', 'i.name as item_name',
        this.db.raw('SUM(vbl.quantity) as total_quantity'),
        this.db.raw('SUM(vbl.line_total) as total_amount'),
        this.db.raw('AVG(vbl.unit_price) as avg_unit_price'),
        this.db.raw('COUNT(DISTINCT vb.id) as bill_count'),
        this.db.raw('COUNT(DISTINCT vb.vendor_id) as vendor_count')
      )
      .groupBy('i.id', 'i.item_code', 'i.name')
      .orderBy('total_amount', 'desc');
  }

  /** Vendor Comparison — same item across vendors */
  async vendorComparison(filters: ReportFilters & { item_id?: string }) {
    const { companyId, item_id } = filters;

    let query = this.db('item_vendor_mapping as ivm')
      .join('vendors as v', 'ivm.vendor_id', 'v.id')
      .join('items as i', 'ivm.item_id', 'i.id')
      .where('ivm.company_id', companyId)
      .where('ivm.is_deleted', false)
      .where('ivm.is_active', true)
      .where('v.is_deleted', false);

    if (item_id) query = query.where('ivm.item_id', item_id);

    return query
      .select(
        'i.item_code', 'i.name as item_name',
        'v.vendor_code', 'v.name as vendor_name',
        'ivm.purchase_price', 'ivm.lead_time_days',
        'ivm.min_order_qty', 'ivm.is_preferred',
        'v.reliability_score'
      )
      .orderBy(['i.item_code', 'ivm.purchase_price']);
  }

  // ═══════════════════════════════════════════════════════════
  // 3. INVENTORY REPORTS
  // ═══════════════════════════════════════════════════════════

  /** Stock Summary — all items across warehouses */
  async stockSummary(filters: ReportFilters & { warehouse_id?: string }) {
    const { companyId, branch_id, warehouse_id } = filters;

    let query = this.db('stock_summary as ss')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .leftJoin('items as i', 'ss.item_id', 'i.id')
      .leftJoin('products as p', 'ss.product_id', 'p.id')
      .leftJoin('units_of_measurement as u', 'ss.uom_id', 'u.id')
      .where('ss.company_id', companyId);

    if (branch_id) query = query.where('ss.branch_id', branch_id);
    if (warehouse_id) query = query.where('ss.warehouse_id', warehouse_id);

    return query
      .select(
        this.db.raw("COALESCE(i.item_code, p.product_code) as code"),
        this.db.raw("COALESCE(i.name, p.name) as name"),
        this.db.raw("CASE WHEN ss.item_id IS NOT NULL THEN 'item' ELSE 'product' END as type"),
        'w.name as warehouse_name', 'b.name as branch_name',
        'ss.available_quantity', 'ss.reserved_quantity',
        'ss.on_order_quantity', 'ss.in_production_quantity', 'ss.free_quantity',
        'ss.valuation_rate', 'ss.total_value',
        'ss.last_purchase_date', 'ss.last_sale_date',
        this.db.raw("COALESCE(u.code, u.name) as uom")
      )
      .orderByRaw("COALESCE(i.name, p.name)");
  }

  /** Stock Valuation — total value per warehouse */
  async stockValuation(filters: ReportFilters) {
    const { companyId, branch_id } = filters;

    let query = this.db('stock_summary as ss')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .where('ss.company_id', companyId);

    if (branch_id) query = query.where('ss.branch_id', branch_id);

    const byWarehouse = await query.clone()
      .select(
        'w.id as warehouse_id', 'w.name as warehouse_name',
        'b.name as branch_name',
        this.db.raw('SUM(ss.total_value) as total_value'),
        this.db.raw('SUM(ss.available_quantity) as total_quantity'),
        this.db.raw('COUNT(DISTINCT COALESCE(ss.item_id, ss.product_id)) as item_count')
      )
      .groupBy('w.id', 'w.name', 'b.name')
      .orderBy('total_value', 'desc');

    const grandTotal = await query.clone()
      .select(this.db.raw('SUM(ss.total_value) as grand_total'))
      .first();

    return {
      by_warehouse: byWarehouse,
      grand_total: parseFloat(grandTotal?.grand_total || '0'),
    };
  }

  /** Stock Movement History */
  async stockMovement(filters: ReportFilters & { item_id?: string; warehouse_id?: string; transaction_type?: string }) {
    const { companyId, branch_id, date_from, date_to, item_id, warehouse_id, transaction_type, page = 1, limit = 100 } = filters;
    const offset = (page - 1) * limit;

    let query = this.db('stock_ledger as sl')
      .join('warehouses as w', 'sl.warehouse_id', 'w.id')
      .leftJoin('items as i', 'sl.item_id', 'i.id')
      .leftJoin('products as p', 'sl.product_id', 'p.id')
      .where('sl.company_id', companyId);

    if (branch_id) query = query.where('sl.branch_id', branch_id);
    if (date_from) query = query.where('sl.transaction_date', '>=', date_from);
    if (date_to) query = query.where('sl.transaction_date', '<=', date_to);
    if (item_id) query = query.where('sl.item_id', item_id);
    if (warehouse_id) query = query.where('sl.warehouse_id', warehouse_id);
    if (transaction_type) query = query.where('sl.transaction_type', transaction_type);

    const countResult = await query.clone().count('sl.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .select(
        'sl.transaction_date', 'sl.transaction_type',
        'sl.reference_type', 'sl.reference_number',
        this.db.raw("COALESCE(i.item_code, p.product_code) as code"),
        this.db.raw("COALESCE(i.name, p.name) as name"),
        'w.name as warehouse_name',
        'sl.quantity_in', 'sl.quantity_out', 'sl.balance_quantity',
        'sl.unit_cost', 'sl.total_value', 'sl.balance_value',
        'sl.narration', 'sl.created_at'
      )
      .orderBy('sl.created_at', 'desc')
      .limit(limit).offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ═══════════════════════════════════════════════════════════
  // 4. FINANCIAL REPORTS
  // ═══════════════════════════════════════════════════════════

  /** Trial Balance */
  async trialBalance(filters: ReportFilters) {
    const { companyId, date_from, date_to } = filters;

    let query = this.db('ledger_entries as le')
      .join('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .where('le.company_id', companyId);

    if (date_from) query = query.where('le.voucher_date', '>=', date_from);
    if (date_to) query = query.where('le.voucher_date', '<=', date_to);

    const data = await query
      .select(
        'coa.account_code', 'coa.account_name', 'coa.account_type', 'coa.account_group',
        this.db.raw('SUM(le.debit_amount) as total_debit'),
        this.db.raw('SUM(le.credit_amount) as total_credit'),
        this.db.raw('SUM(le.debit_amount) - SUM(le.credit_amount) as balance')
      )
      .groupBy('coa.account_code', 'coa.account_name', 'coa.account_type', 'coa.account_group')
      .having(this.db.raw('SUM(le.debit_amount) <> 0 OR SUM(le.credit_amount) <> 0'))
      .orderBy('coa.account_code');

    const totals = data.reduce((acc: any, r: any) => ({
      total_debit: acc.total_debit + parseFloat(r.total_debit || 0),
      total_credit: acc.total_credit + parseFloat(r.total_credit || 0),
    }), { total_debit: 0, total_credit: 0 });

    return { data, totals, is_balanced: Math.abs(totals.total_debit - totals.total_credit) < 0.01 };
  }

  /** Profit & Loss */
  async profitAndLoss(filters: ReportFilters) {
    const { companyId, branch_id, date_from, date_to } = filters;

    let query = this.db('ledger_entries as le')
      .join('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .where('le.company_id', companyId)
      .whereIn('coa.account_type', ['revenue', 'expense']);

    if (branch_id) query = query.where('le.branch_id', branch_id);
    if (date_from) query = query.where('le.voucher_date', '>=', date_from);
    if (date_to) query = query.where('le.voucher_date', '<=', date_to);

    const data = await query
      .select(
        'coa.account_type', 'coa.account_group', 'coa.account_code', 'coa.account_name',
        this.db.raw('SUM(le.debit_amount) as total_debit'),
        this.db.raw('SUM(le.credit_amount) as total_credit'),
        this.db.raw(`CASE
          WHEN coa.account_type = 'revenue' THEN SUM(le.credit_amount) - SUM(le.debit_amount)
          WHEN coa.account_type = 'expense' THEN SUM(le.debit_amount) - SUM(le.credit_amount)
          ELSE 0 END as net_amount`)
      )
      .groupBy('coa.account_type', 'coa.account_group', 'coa.account_code', 'coa.account_name')
      .orderBy(['coa.account_type', 'coa.account_group', 'coa.account_code']);

    const revenue = data.filter((r: any) => r.account_type === 'revenue')
      .reduce((s: number, r: any) => s + parseFloat(r.net_amount || 0), 0);
    const expense = data.filter((r: any) => r.account_type === 'expense')
      .reduce((s: number, r: any) => s + parseFloat(r.net_amount || 0), 0);

    return {
      data,
      summary: {
        total_revenue: revenue,
        total_expense: expense,
        net_profit: revenue - expense,
        net_profit_margin: revenue > 0 ? ((revenue - expense) / revenue * 100).toFixed(2) : '0.00',
      },
    };
  }

  /** Balance Sheet */
  async balanceSheet(filters: ReportFilters) {
    const { companyId, date_to } = filters;

    let query = this.db('ledger_entries as le')
      .join('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .where('le.company_id', companyId)
      .whereIn('coa.account_type', ['asset', 'liability', 'equity']);

    if (date_to) query = query.where('le.voucher_date', '<=', date_to);

    const data = await query
      .select(
        'coa.account_type', 'coa.account_group', 'coa.account_code', 'coa.account_name',
        this.db.raw('SUM(le.debit_amount) - SUM(le.credit_amount) as balance')
      )
      .groupBy('coa.account_type', 'coa.account_group', 'coa.account_code', 'coa.account_name')
      .having(this.db.raw('ABS(SUM(le.debit_amount) - SUM(le.credit_amount)) > 0.01'))
      .orderBy(['coa.account_type', 'coa.account_group', 'coa.account_code']);

    const assets = data.filter((r: any) => r.account_type === 'asset')
      .reduce((s: number, r: any) => s + parseFloat(r.balance || 0), 0);
    const liabilities = data.filter((r: any) => r.account_type === 'liability')
      .reduce((s: number, r: any) => s + Math.abs(parseFloat(r.balance || 0)), 0);
    const equity = data.filter((r: any) => r.account_type === 'equity')
      .reduce((s: number, r: any) => s + Math.abs(parseFloat(r.balance || 0)), 0);

    return {
      data,
      summary: {
        total_assets: assets,
        total_liabilities: liabilities,
        total_equity: equity,
        is_balanced: Math.abs(assets - (liabilities + equity)) < 0.01,
      },
    };
  }

  /** Outstanding Receivables */
  async outstandingReceivables(filters: ReportFilters) {
    const { companyId, branch_id } = filters;

    let query = this.db('sales_invoices as si')
      .join('customers as c', 'si.customer_id', 'c.id')
      .where('si.company_id', companyId)
      .where('si.is_deleted', false)
      .whereIn('si.status', ['sent', 'overdue']);

    if (branch_id) query = query.where('si.branch_id', branch_id);

    return query
      .select(
        'c.customer_code', 'c.name as customer_name',
        'si.invoice_number', 'si.invoice_date', 'si.grand_total',
        'si.status',
        this.db.raw("(CURRENT_DATE - si.invoice_date) as days_outstanding"),
        this.db.raw(`CASE
          WHEN (CURRENT_DATE - si.invoice_date) <= 30 THEN '0-30'
          WHEN (CURRENT_DATE - si.invoice_date) <= 60 THEN '31-60'
          WHEN (CURRENT_DATE - si.invoice_date) <= 90 THEN '61-90'
          ELSE '90+' END as aging_bucket`)
      )
      .orderBy('days_outstanding', 'desc');
  }

  /** Outstanding Payables */
  async outstandingPayables(filters: ReportFilters) {
    const { companyId, branch_id } = filters;

    let query = this.db('vendor_bills as vb')
      .join('vendors as v', 'vb.vendor_id', 'v.id')
      .where('vb.company_id', companyId)
      .where('vb.is_deleted', false)
      .whereIn('vb.status', ['received', 'overdue']);

    if (branch_id) query = query.where('vb.branch_id', branch_id);

    return query
      .select(
        'v.vendor_code', 'v.name as vendor_name',
        'vb.bill_number', 'vb.bill_date', 'vb.grand_total',
        'vb.status',
        this.db.raw("(CURRENT_DATE - vb.bill_date) as days_outstanding"),
        this.db.raw(`CASE
          WHEN (CURRENT_DATE - vb.bill_date) <= 30 THEN '0-30'
          WHEN (CURRENT_DATE - vb.bill_date) <= 60 THEN '31-60'
          WHEN (CURRENT_DATE - vb.bill_date) <= 90 THEN '61-90'
          ELSE '90+' END as aging_bucket`)
      )
      .orderBy('days_outstanding', 'desc');
  }

  /** Ledger Report — entries for a specific account */
  async ledgerReport(filters: ReportFilters & { account_id?: string; party_type?: string; party_id?: string }) {
    const { companyId, branch_id, date_from, date_to, account_id, party_type, party_id, page = 1, limit = 100 } = filters;
    const offset = (page - 1) * limit;

    let query = this.db('ledger_entries as le')
      .join('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .where('le.company_id', companyId);

    if (branch_id) query = query.where('le.branch_id', branch_id);
    if (date_from) query = query.where('le.voucher_date', '>=', date_from);
    if (date_to) query = query.where('le.voucher_date', '<=', date_to);
    if (account_id) query = query.where('le.account_id', account_id);
    if (party_type) query = query.where('le.party_type', party_type);
    if (party_id) query = query.where('le.party_id', party_id);

    const countResult = await query.clone().count('le.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .select(
        'le.voucher_date', 'le.voucher_type', 'le.voucher_number',
        'coa.account_code', 'coa.account_name',
        'le.debit_amount', 'le.credit_amount',
        'le.narration', 'le.reference_type', 'le.reference_number',
        'le.party_type', 'le.party_id'
      )
      .orderBy('le.voucher_date', 'asc')
      .limit(limit).offset(offset);

    // Running balance
    let balance = 0;
    const dataWithBalance = data.map((row: any) => {
      balance += parseFloat(row.debit_amount || 0) - parseFloat(row.credit_amount || 0);
      return { ...row, running_balance: balance };
    });

    return { data: dataWithBalance, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ═══════════════════════════════════════════════════════════
  // 5. MANUFACTURING REPORTS
  // ═══════════════════════════════════════════════════════════

  /** Production Summary */
  async productionSummary(filters: ReportFilters) {
    const { companyId, branch_id, date_from, date_to } = filters;

    let query = this.db('production_entries as pe')
      .join('work_orders as wo', 'pe.work_order_id', 'wo.id')
      .leftJoin('products as p', 'wo.product_id', 'p.id')
      .where('pe.company_id', companyId)
      .where('pe.is_deleted', false);

    if (branch_id) query = query.where('wo.branch_id', branch_id);
    if (date_from) query = query.where('pe.production_date', '>=', date_from);
    if (date_to) query = query.where('pe.production_date', '<=', date_to);

    return query
      .select(
        'p.product_code', 'p.name as product_name',
        this.db.raw('COUNT(pe.id) as entry_count'),
        this.db.raw('SUM(pe.quantity_produced) as total_produced'),
        this.db.raw('SUM(pe.total_cost) as total_cost'),
        this.db.raw('AVG(pe.unit_cost) as avg_unit_cost')
      )
      .groupBy('p.product_code', 'p.name')
      .orderBy('total_produced', 'desc');
  }

  /** Scrap Analysis */
  async scrapAnalysis(filters: ReportFilters) {
    const { companyId, branch_id, date_from, date_to } = filters;

    let query = this.db('scrap_entries as se')
      .join('work_orders as wo', 'se.work_order_id', 'wo.id')
      .leftJoin('items as i', 'se.item_id', 'i.id')
      .where('se.company_id', companyId)
      .where('se.is_deleted', false);

    if (branch_id) query = query.where('wo.branch_id', branch_id);
    if (date_from) query = query.where('se.scrap_date', '>=', date_from);
    if (date_to) query = query.where('se.scrap_date', '<=', date_to);

    return query
      .select(
        'i.item_code', 'i.name as item_name',
        'se.reason',
        this.db.raw('SUM(se.quantity) as total_quantity'),
        this.db.raw('SUM(se.scrap_value) as total_scrap_value'),
        this.db.raw('SUM(se.recoverable_value) as total_recoverable'),
        this.db.raw('COUNT(se.id) as entry_count')
      )
      .groupBy('i.item_code', 'i.name', 'se.reason')
      .orderBy('total_scrap_value', 'desc');
  }

  /** Planned vs Actual Consumption Variance */
  async consumptionVariance(filters: ReportFilters & { work_order_id?: string }) {
    const { companyId, work_order_id } = filters;

    let query = this.db('work_order_materials as wom')
      .join('work_orders as wo', 'wom.work_order_id', 'wo.id')
      .leftJoin('items as i', 'wom.component_item_id', 'i.id')
      .where('wo.company_id', companyId)
      .where('wom.is_deleted', false);

    if (work_order_id) query = query.where('wom.work_order_id', work_order_id);

    return query
      .select(
        'wo.work_order_number',
        'i.item_code', 'i.name as item_name',
        'wom.planned_quantity', 'wom.issued_quantity',
        'wom.consumed_quantity', 'wom.returned_quantity', 'wom.wastage_quantity',
        this.db.raw('ROUND(wom.consumed_quantity - wom.planned_quantity, 3) as variance_qty'),
        this.db.raw(`CASE
          WHEN wom.planned_quantity > 0
          THEN ROUND((wom.consumed_quantity - wom.planned_quantity) / wom.planned_quantity * 100, 2)
          ELSE 0 END as variance_pct`)
      )
      .orderBy('variance_pct', 'desc');
  }

  // ═══════════════════════════════════════════════════════════
  // 6. BRANCH REPORTS (reuse insights service patterns)
  // ═══════════════════════════════════════════════════════════

  /** Warehouse Profitability — value of stock per warehouse vs movement volume */
  async warehouseProfitability(filters: ReportFilters) {
    const { companyId } = filters;

    return this.db('stock_summary as ss')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .where('ss.company_id', companyId)
      .select(
        'w.id as warehouse_id', 'w.name as warehouse_name', 'w.code as warehouse_code',
        'b.name as branch_name',
        this.db.raw('SUM(ss.total_value) as inventory_value'),
        this.db.raw('SUM(ss.available_quantity) as total_quantity'),
        this.db.raw('COUNT(DISTINCT COALESCE(ss.item_id, ss.product_id)) as sku_count')
      )
      .groupBy('w.id', 'w.name', 'w.code', 'b.name')
      .orderBy('inventory_value', 'desc');
  }

  /** Product-wise Profitability — selling price vs production cost */
  async productProfitability(filters: ReportFilters) {
    const { companyId } = filters;

    return this.db('products as p')
      .leftJoin(
        this.db.raw(`(
          SELECT wo.product_id, AVG(pe.unit_cost) as avg_production_cost
          FROM production_entries pe
          JOIN work_orders wo ON pe.work_order_id = wo.id
          WHERE pe.company_id = ? AND pe.is_deleted = FALSE
          GROUP BY wo.product_id
        ) as pc`, [companyId]),
        'p.id', 'pc.product_id'
      )
      .where('p.company_id', companyId)
      .where('p.is_deleted', false)
      .select(
        'p.product_code', 'p.name as product_name',
        'p.selling_price',
        this.db.raw('COALESCE(p.standard_cost, 0) as standard_cost'),
        this.db.raw('COALESCE(pc.avg_production_cost, 0) as avg_production_cost'),
        this.db.raw(`CASE
          WHEN p.selling_price > 0 AND pc.avg_production_cost IS NOT NULL
          THEN ROUND((p.selling_price - pc.avg_production_cost) / p.selling_price * 100, 2)
          WHEN p.selling_price > 0 AND COALESCE(p.standard_cost, 0) > 0
          THEN ROUND((p.selling_price - p.standard_cost) / p.selling_price * 100, 2)
          ELSE 0 END as profit_margin_pct`)
      )
      .orderByRaw('profit_margin_pct ASC NULLS LAST');
  }
}

export const reportsService = new ReportsService();