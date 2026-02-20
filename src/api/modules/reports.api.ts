// src/api/modules/reports.api.ts
// API module for Reports, GST Compliance, and Business Insights

import apiClient, { ApiResponse } from '../client';

// ─── Common Parameter Interfaces ────────────────────────────────

export interface ReportParams {
  date_from?: string;
  date_to?: string;
  branch_id?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface GSTParams {
  month: number;
  year: number;
  [key: string]: unknown;
}

export interface InsightParams {
  days?: number;
  branch_id?: string;
  category?: string;
  limit?: number;
  [key: string]: unknown;
}

// ─── Report Result Types ────────────────────────────────────────

export interface SalesByCustomerRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  invoice_count: number;
  total_subtotal: string;
  total_tax: string;
  total_amount: string;
  first_invoice: string;
  last_invoice: string;
  [key: string]: unknown;
}

export interface SalesByProductRow {
  code: string;
  name: string;
  type: string;
  total_quantity: string;
  total_amount: string;
  total_tax: string;
  invoice_count: number;
  [key: string]: unknown;
}

export interface SalesByBranchRow {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  invoice_count: number;
  total_subtotal: string;
  total_tax: string;
  total_amount: string;
  [key: string]: unknown;
}

export interface SalesByPeriodRow {
  period: string;
  invoice_count: number;
  total_amount: string;
  total_tax: string;
  [key: string]: unknown;
}

export interface PurchaseByVendorRow {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  bill_count: number;
  total_subtotal: string;
  total_tax: string;
  total_amount: string;
  [key: string]: unknown;
}

export interface PurchaseByItemRow {
  item_id: string;
  item_code: string;
  item_name: string;
  total_quantity: string;
  total_amount: string;
  avg_unit_price: string;
  bill_count: number;
  vendor_count: number;
  [key: string]: unknown;
}

export interface VendorComparisonRow {
  item_code: string;
  item_name: string;
  vendor_code: string;
  vendor_name: string;
  purchase_price: string;
  lead_time_days: number;
  min_order_qty: string;
  is_preferred: boolean;
  reliability_score: number;
  [key: string]: unknown;
}

export interface StockSummaryReportRow {
  code: string;
  name: string;
  type: string;
  warehouse_name: string;
  branch_name: string;
  available_quantity: string;
  reserved_quantity: string;
  on_order_quantity: string;
  free_quantity: string;
  valuation_rate: string;
  total_value: string;
  uom: string;
  [key: string]: unknown;
}

export interface StockValuationRow {
  warehouse_id: string;
  warehouse_name: string;
  branch_name: string;
  total_value: string;
  total_quantity: string;
  item_count: number;
  [key: string]: unknown;
}

export interface StockMovementRow {
  transaction_date: string;
  transaction_type: string;
  reference_type: string;
  reference_number: string;
  code: string;
  name: string;
  warehouse_name: string;
  quantity_in: string;
  quantity_out: string;
  balance_quantity: string;
  unit_cost: string;
  total_value: string;
  narration: string;
  [key: string]: unknown;
}

export interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type: string;
  account_group: string;
  total_debit: string;
  total_credit: string;
  balance: string;
  [key: string]: unknown;
}

export interface ProfitAndLossRow {
  account_type: string;
  account_group: string;
  account_code: string;
  account_name: string;
  total_debit: string;
  total_credit: string;
  net_amount: string;
  [key: string]: unknown;
}

export interface BalanceSheetRow {
  account_type: string;
  account_group: string;
  account_code: string;
  account_name: string;
  balance: string;
  [key: string]: unknown;
}

export interface OutstandingRow {
  customer_code?: string;
  vendor_code?: string;
  customer_name?: string;
  vendor_name?: string;
  invoice_number?: string;
  bill_number?: string;
  invoice_date?: string;
  bill_date?: string;
  grand_total: string;
  status: string;
  days_outstanding: number;
  aging_bucket: string;
  [key: string]: unknown;
}

export interface LedgerRow {
  voucher_date: string;
  voucher_type: string;
  voucher_number: string;
  account_code: string;
  account_name: string;
  debit_amount: string;
  credit_amount: string;
  narration: string;
  running_balance: number;
  [key: string]: unknown;
}

export interface ProductionSummaryRow {
  product_code: string;
  product_name: string;
  entry_count: number;
  total_produced: string;
  total_cost: string;
  avg_unit_cost: string;
  [key: string]: unknown;
}

export interface ScrapAnalysisRow {
  item_code: string;
  item_name: string;
  reason: string;
  total_quantity: string;
  total_scrap_value: string;
  total_recoverable: string;
  entry_count: number;
  [key: string]: unknown;
}

export interface ConsumptionVarianceRow {
  work_order_number: string;
  item_code: string;
  item_name: string;
  planned_quantity: string;
  issued_quantity: string;
  consumed_quantity: string;
  returned_quantity: string;
  wastage_quantity: string;
  variance_qty: string;
  variance_pct: string;
  [key: string]: unknown;
}

export interface WarehouseProfitabilityRow {
  warehouse_id: string;
  warehouse_name: string;
  warehouse_code: string;
  branch_name: string;
  inventory_value: string;
  total_quantity: string;
  sku_count: number;
  [key: string]: unknown;
}

export interface ProductProfitabilityRow {
  product_code: string;
  product_name: string;
  selling_price: string;
  standard_cost: string;
  avg_production_cost: string;
  profit_margin_pct: string;
  [key: string]: unknown;
}

// ─── GST Types ──────────────────────────────────────────────────

export interface GSTR1B2BRow {
  receiver_gstin: string;
  receiver_name: string;
  invoice_number: string;
  invoice_date: string;
  invoice_value: string;
  place_of_supply: string;
  hsn_code: string;
  taxable_amount: string;
  cgst_rate: string;
  cgst_amount: string;
  sgst_rate: string;
  sgst_amount: string;
  igst_rate: string;
  igst_amount: string;
  line_total: string;
  [key: string]: unknown;
}

export interface GSTR1B2CRow {
  place_of_supply: string;
  total_taxable: string;
  total_cgst: string;
  total_sgst: string;
  total_igst: string;
  total_value: string;
  invoice_count: number;
  [key: string]: unknown;
}

export interface GSTR1CDNRRow {
  receiver_gstin: string;
  receiver_name: string;
  credit_note_number: string;
  credit_note_date: string;
  reason: string;
  original_invoice: string;
  subtotal: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  grand_total: string;
  [key: string]: unknown;
}

export interface HSNSummaryRow {
  hsn_code: string;
  total_quantity: string;
  total_taxable: string;
  total_cgst: string;
  total_sgst: string;
  total_igst: string;
  total_value: string;
  [key: string]: unknown;
}

export interface GSTR3BSummary {
  period: { month: number; year: number };
  section_3_1: {
    outward_taxable: number;
    output_cgst: number;
    output_sgst: number;
    output_igst: number;
    output_cess: number;
    invoice_count: number;
    credit_note_adjustment: number;
  };
  section_4: {
    inward_taxable: number;
    input_cgst: number;
    input_sgst: number;
    input_igst: number;
    bill_count: number;
    debit_note_adjustment: number;
  };
  section_6: {
    payable_cgst: number;
    payable_sgst: number;
    payable_igst: number;
    total_payable: number;
  };
  [key: string]: unknown;
}

export interface EInvoiceReadiness {
  invoice_number: string;
  is_ready: boolean;
  issues: string[];
  irn: string | null;
  irn_generated: boolean;
  [key: string]: unknown;
}

export interface EWayBillData {
  document_type: string;
  document_number: string;
  document_date: string;
  consignor: { gstin: string; name: string };
  consignee: { gstin: string; name: string };
  transporter: string | null;
  vehicle_number: string | null;
  invoice_number: string;
  invoice_value: number;
  items: { hsn_code: string; name: string; quantity: number; value: number }[];
  [key: string]: unknown;
}

// ─── Insight Types ──────────────────────────────────────────────

export interface ItemMovementRow {
  item_id: string;
  item_code: string;
  item_name: string;
  item_type: string;
  total_consumed: string;
  movement_days: number;
  last_movement: string;
  current_stock: string;
  movement_category: string;
  avg_daily_consumption: string;
  [key: string]: unknown;
}

export interface StockoutPredictionRow {
  item_id: string;
  item_code: string;
  item_name: string;
  warehouse_name: string;
  current_stock: string;
  avg_daily_consumption: string;
  days_until_stockout: number | null;
  min_stock_threshold: string;
  reorder_quantity: string;
  uom_symbol: string;
  [key: string]: unknown;
}

export interface MarginAnalysisRow {
  item_code: string;
  item_name: string;
  purchase_price: string;
  selling_price: string;
  margin_amount: string;
  margin_percentage: string;
  effective_margin_pct: string;
  [key: string]: unknown;
}

export interface VendorReliabilityRow {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  reliability_score: number;
  average_lead_days: number;
  is_preferred: boolean;
  payment_terms_days: number;
  total_pos: number;
  total_grns: number;
  avg_delivery_variance_days: number;
  [key: string]: unknown;
}

export interface CustomerPaymentRiskRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  credit_limit: string;
  payment_terms_days: number;
  total_invoices: number;
  total_invoiced: string;
  outstanding_amount: string;
  credit_utilization_pct: string;
  overdue_count: number;
  payment_risk: string;
  [key: string]: unknown;
}

export interface BranchProfitabilityRow {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  total_revenue: string;
  total_cost: string;
  gross_profit: string;
  gross_margin_pct: string;
  invoice_count: number;
  bill_count: number;
  [key: string]: unknown;
}

// ─── Reports API ────────────────────────────────────────────────

export const reportsApi = {
  sales: {
    byCustomer: (params?: ReportParams) =>
      apiClient.get<ApiResponse<{ data: SalesByCustomerRow[]; totals: Record<string, number> }>>('/reports/sales/by-customer', params),
    byProduct: (params?: ReportParams) =>
      apiClient.get<ApiResponse<SalesByProductRow[]>>('/reports/sales/by-product', params),
    byBranch: (params?: ReportParams) =>
      apiClient.get<ApiResponse<SalesByBranchRow[]>>('/reports/sales/by-branch', params),
    byPeriod: (params?: ReportParams) =>
      apiClient.get<ApiResponse<SalesByPeriodRow[]>>('/reports/sales/by-period', params),
  },
  purchase: {
    byVendor: (params?: ReportParams) =>
      apiClient.get<ApiResponse<PurchaseByVendorRow[]>>('/reports/purchase/by-vendor', params),
    byItem: (params?: ReportParams) =>
      apiClient.get<ApiResponse<PurchaseByItemRow[]>>('/reports/purchase/by-item', params),
    vendorComparison: (params?: ReportParams) =>
      apiClient.get<ApiResponse<VendorComparisonRow[]>>('/reports/purchase/vendor-comparison', params),
  },
  inventory: {
    stockSummary: (params?: ReportParams) =>
      apiClient.get<ApiResponse<StockSummaryReportRow[]>>('/reports/inventory/stock-summary', params),
    stockValuation: (params?: ReportParams) =>
      apiClient.get<ApiResponse<{ by_warehouse: StockValuationRow[]; grand_total: number }>>('/reports/inventory/stock-valuation', params),
    stockMovement: (params?: ReportParams) =>
      apiClient.get<ApiResponse<{ data: StockMovementRow[]; total: number; page: number; limit: number }>>('/reports/inventory/stock-movement', params),
  },
  financial: {
    trialBalance: (params?: ReportParams) =>
      apiClient.get<ApiResponse<{ data: TrialBalanceRow[]; totals: Record<string, number>; is_balanced: boolean }>>('/reports/financial/trial-balance', params),
    profitAndLoss: (params?: ReportParams) =>
      apiClient.get<ApiResponse<{ data: ProfitAndLossRow[]; summary: Record<string, unknown> }>>('/reports/financial/profit-and-loss', params),
    balanceSheet: (params?: ReportParams) =>
      apiClient.get<ApiResponse<{ data: BalanceSheetRow[]; summary: Record<string, unknown> }>>('/reports/financial/balance-sheet', params),
    outstandingReceivables: (params?: ReportParams) =>
      apiClient.get<ApiResponse<OutstandingRow[]>>('/reports/financial/outstanding-receivables', params),
    outstandingPayables: (params?: ReportParams) =>
      apiClient.get<ApiResponse<OutstandingRow[]>>('/reports/financial/outstanding-payables', params),
    ledger: (params?: ReportParams) =>
      apiClient.get<ApiResponse<{ data: LedgerRow[]; total: number; page: number; limit: number }>>('/reports/financial/ledger', params),
  },
  manufacturing: {
    productionSummary: (params?: ReportParams) =>
      apiClient.get<ApiResponse<ProductionSummaryRow[]>>('/reports/manufacturing/production-summary', params),
    scrapAnalysis: (params?: ReportParams) =>
      apiClient.get<ApiResponse<ScrapAnalysisRow[]>>('/reports/manufacturing/scrap-analysis', params),
    consumptionVariance: (params?: ReportParams) =>
      apiClient.get<ApiResponse<ConsumptionVarianceRow[]>>('/reports/manufacturing/consumption-variance', params),
  },
  branch: {
    warehouseProfitability: (params?: ReportParams) =>
      apiClient.get<ApiResponse<WarehouseProfitabilityRow[]>>('/reports/branch/warehouse-profitability', params),
    productProfitability: (params?: ReportParams) =>
      apiClient.get<ApiResponse<ProductProfitabilityRow[]>>('/reports/branch/product-profitability', params),
  },
};

// ─── GST API ────────────────────────────────────────────────────

export const gstApi = {
  gstr1B2B: (params: GSTParams) =>
    apiClient.get<ApiResponse<GSTR1B2BRow[]>>('/gst/gstr-1/b2b', params),
  gstr1B2C: (params: GSTParams) =>
    apiClient.get<ApiResponse<GSTR1B2CRow[]>>('/gst/gstr-1/b2c', params),
  gstr1CDNR: (params: GSTParams) =>
    apiClient.get<ApiResponse<GSTR1CDNRRow[]>>('/gst/gstr-1/credit-notes', params),
  gstr1HSN: (params: GSTParams) =>
    apiClient.get<ApiResponse<HSNSummaryRow[]>>('/gst/hsn-summary', params),
  gstr3BSummary: (params: GSTParams) =>
    apiClient.get<ApiResponse<GSTR3BSummary>>('/gst/gstr-3b', params),
  einvoiceReadiness: (invoiceId: string) =>
    apiClient.get<ApiResponse<EInvoiceReadiness>>(`/gst/e-invoice-check/${invoiceId}`),
  ewayBillData: (challanId: string) =>
    apiClient.get<ApiResponse<EWayBillData>>(`/gst/e-way-bill/${challanId}`),
};

// ─── Insights API ───────────────────────────────────────────────

export const insightsApi = {
  itemMovement: (params?: InsightParams) =>
    apiClient.get<ApiResponse<{ data: ItemMovementRow[]; summary: Record<string, number>; period_days: number }>>('/insights/item-movement', params),
  lowStockPrediction: (params?: InsightParams) =>
    apiClient.get<ApiResponse<{ data: StockoutPredictionRow[]; lookback_days: number }>>('/insights/stockout-predictions', params),
  overstock: (params?: InsightParams) =>
    apiClient.get<ApiResponse<{ data: ItemMovementRow[] }>>('/insights/item-movement', { ...params, category: 'dead' }),
  marginAnalysis: (params?: InsightParams) =>
    apiClient.get<ApiResponse<{ data: MarginAnalysisRow[]; period_days: number }>>('/insights/margin-analysis', params),
  vendorReliability: (params?: InsightParams) =>
    apiClient.get<ApiResponse<{ data: VendorReliabilityRow[] }>>('/insights/vendor-reliability', params),
  customerPaymentRisk: (params?: InsightParams) =>
    apiClient.get<ApiResponse<{ data: CustomerPaymentRiskRow[] }>>('/insights/customer-risk', params),
  profitability: (params?: InsightParams) =>
    apiClient.get<ApiResponse<{ data: BranchProfitabilityRow[]; period_days: number }>>('/insights/branch-profitability', params),
  dashboard: () =>
    apiClient.get<ApiResponse<Record<string, number>>>('/insights/dashboard'),
};