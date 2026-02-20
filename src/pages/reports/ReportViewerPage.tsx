// src/pages/reports/ReportViewerPage.tsx
// Unified Report Viewer — 20 reports across 6 categories (Sales, Purchase, Inventory, Financial, Manufacturing, Branch)

import React, { useState, useCallback } from 'react';
import { PageHeader } from '../../components/shared/PageHeader';
import { DataTable, ColumnDef } from '../../components/shared/DataTable';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { toast } from '../../components/shared/FormElements';
import { settingsApi } from '../../api/modules/settings.api';
import { reportsApi, ReportParams } from '../../api/modules/reports.api';
import { formatDate, formatPercent, formatIndianNumber } from '../../lib/formatters';

// ─── Report Configuration ───────────────────────────────────────

interface SubReport {
  label: string;
  key: string;
  apiCall: (params: ReportParams) => Promise<unknown>;
  columns: ColumnDef<Record<string, unknown>>[];
  summaryFields?: { label: string; key: string; format: 'amount' | 'number' | 'percent' }[];
  specialRenderer?: string; // 'pnl' | 'balance-sheet'
}

interface ReportCategory {
  label: string;
  key: string;
  color: string;
  reports: SubReport[];
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    label: 'Sales', key: 'sales', color: 'blue',
    reports: [
      {
        label: 'By Customer', key: 'by-customer',
        apiCall: (p) => reportsApi.sales.byCustomer(p),
        columns: [
          { key: 'customer_code', header: 'Code', width: '100px' },
          { key: 'customer_name', header: 'Customer', sortable: true },
          { key: 'invoice_count', header: 'Invoices', align: 'right', sortable: true },
          { key: 'total_subtotal', header: 'Subtotal', align: 'right', render: (r) => <AmountDisplay value={r.total_subtotal as string} /> },
          { key: 'total_tax', header: 'Tax', align: 'right', render: (r) => <AmountDisplay value={r.total_tax as string} /> },
          { key: 'total_amount', header: 'Total', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_amount as string} className="font-semibold" /> },
          { key: 'first_invoice', header: 'First Invoice', render: (r) => formatDate(r.first_invoice as string) },
          { key: 'last_invoice', header: 'Last Invoice', render: (r) => formatDate(r.last_invoice as string) },
        ],
        summaryFields: [
          { label: 'Total Revenue', key: 'total_amount', format: 'amount' },
          { label: 'Total Tax', key: 'total_tax', format: 'amount' },
          { label: 'Invoices', key: 'total_invoices', format: 'number' },
        ],
      },
      {
        label: 'By Product', key: 'by-product',
        apiCall: (p) => reportsApi.sales.byProduct(p),
        columns: [
          { key: 'code', header: 'Code', width: '100px' },
          { key: 'name', header: 'Product/Item', sortable: true },
          { key: 'type', header: 'Type', render: (r) => <span className="capitalize text-xs bg-gray-100 px-2 py-0.5 rounded">{r.type as string}</span> },
          { key: 'total_quantity', header: 'Qty Sold', align: 'right', sortable: true, render: (r) => formatIndianNumber(r.total_quantity as string, 0) },
          { key: 'invoice_count', header: 'Invoices', align: 'right' },
          { key: 'total_tax', header: 'Tax', align: 'right', render: (r) => <AmountDisplay value={r.total_tax as string} /> },
          { key: 'total_amount', header: 'Revenue', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_amount as string} className="font-semibold" /> },
        ],
      },
      {
        label: 'By Branch', key: 'by-branch',
        apiCall: (p) => reportsApi.sales.byBranch(p),
        columns: [
          { key: 'branch_code', header: 'Code', width: '80px' },
          { key: 'branch_name', header: 'Branch', sortable: true },
          { key: 'invoice_count', header: 'Invoices', align: 'right', sortable: true },
          { key: 'total_subtotal', header: 'Subtotal', align: 'right', render: (r) => <AmountDisplay value={r.total_subtotal as string} /> },
          { key: 'total_tax', header: 'Tax', align: 'right', render: (r) => <AmountDisplay value={r.total_tax as string} /> },
          { key: 'total_amount', header: 'Total', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_amount as string} className="font-semibold" /> },
        ],
      },
      {
        label: 'By Period', key: 'by-period',
        apiCall: (p) => reportsApi.sales.byPeriod(p),
        columns: [
          { key: 'period', header: 'Period', sortable: true },
          { key: 'invoice_count', header: 'Invoices', align: 'right', sortable: true },
          { key: 'total_tax', header: 'Tax', align: 'right', render: (r) => <AmountDisplay value={r.total_tax as string} /> },
          { key: 'total_amount', header: 'Revenue', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_amount as string} className="font-semibold" /> },
        ],
      },
    ],
  },
  {
    label: 'Purchase', key: 'purchase', color: 'purple',
    reports: [
      {
        label: 'By Vendor', key: 'by-vendor',
        apiCall: (p) => reportsApi.purchase.byVendor(p),
        columns: [
          { key: 'vendor_code', header: 'Code', width: '100px' },
          { key: 'vendor_name', header: 'Vendor', sortable: true },
          { key: 'bill_count', header: 'Bills', align: 'right', sortable: true },
          { key: 'total_subtotal', header: 'Subtotal', align: 'right', render: (r) => <AmountDisplay value={r.total_subtotal as string} /> },
          { key: 'total_tax', header: 'Tax', align: 'right', render: (r) => <AmountDisplay value={r.total_tax as string} /> },
          { key: 'total_amount', header: 'Total', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_amount as string} className="font-semibold" /> },
        ],
      },
      {
        label: 'By Item', key: 'by-item',
        apiCall: (p) => reportsApi.purchase.byItem(p),
        columns: [
          { key: 'item_code', header: 'Code', width: '100px' },
          { key: 'item_name', header: 'Item', sortable: true },
          { key: 'total_quantity', header: 'Qty', align: 'right', render: (r) => formatIndianNumber(r.total_quantity as string, 0) },
          { key: 'avg_unit_price', header: 'Avg Price', align: 'right', render: (r) => <AmountDisplay value={r.avg_unit_price as string} /> },
          { key: 'bill_count', header: 'Bills', align: 'right' },
          { key: 'vendor_count', header: 'Vendors', align: 'right' },
          { key: 'total_amount', header: 'Total', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_amount as string} className="font-semibold" /> },
        ],
      },
      {
        label: 'Vendor Comparison', key: 'vendor-comparison',
        apiCall: (p) => reportsApi.purchase.vendorComparison(p),
        columns: [
          { key: 'item_code', header: 'Item Code', width: '100px' },
          { key: 'item_name', header: 'Item' },
          { key: 'vendor_code', header: 'Vendor Code', width: '100px' },
          { key: 'vendor_name', header: 'Vendor' },
          { key: 'purchase_price', header: 'Price', align: 'right', render: (r) => <AmountDisplay value={r.purchase_price as string} /> },
          { key: 'lead_time_days', header: 'Lead Days', align: 'right' },
          { key: 'reliability_score', header: 'Score', align: 'right', render: (r) => <span className="font-medium">{String(r.reliability_score ?? '—')}</span> },
          { key: 'is_preferred', header: 'Preferred', align: 'center', render: (r) => r.is_preferred ? <span className="text-green-600">✓</span> : '—' },
        ],
      },
    ],
  },
  {
    label: 'Inventory', key: 'inventory', color: 'green',
    reports: [
      {
        label: 'Stock Summary', key: 'stock-summary',
        apiCall: (p) => reportsApi.inventory.stockSummary(p),
        columns: [
          { key: 'code', header: 'Code', width: '100px' },
          { key: 'name', header: 'Name', sortable: true },
          { key: 'warehouse_name', header: 'Warehouse' },
          { key: 'available_quantity', header: 'Available', align: 'right', render: (r) => `${formatIndianNumber(r.available_quantity as string, 0)} ${r.uom || ''}` },
          { key: 'reserved_quantity', header: 'Reserved', align: 'right', render: (r) => formatIndianNumber(r.reserved_quantity as string, 0) },
          { key: 'valuation_rate', header: 'Rate', align: 'right', render: (r) => <AmountDisplay value={r.valuation_rate as string} /> },
          { key: 'total_value', header: 'Value', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_value as string} className="font-semibold" /> },
        ],
      },
      {
        label: 'Stock Valuation', key: 'stock-valuation',
        apiCall: (p) => reportsApi.inventory.stockValuation(p),
        columns: [
          { key: 'warehouse_name', header: 'Warehouse', sortable: true },
          { key: 'branch_name', header: 'Branch' },
          { key: 'item_count', header: 'SKUs', align: 'right' },
          { key: 'total_quantity', header: 'Qty', align: 'right', render: (r) => formatIndianNumber(r.total_quantity as string, 0) },
          { key: 'total_value', header: 'Value', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_value as string} className="font-semibold" /> },
        ],
      },
      {
        label: 'Stock Movement', key: 'stock-movement',
        apiCall: (p) => reportsApi.inventory.stockMovement(p),
        columns: [
          { key: 'transaction_date', header: 'Date', render: (r) => formatDate(r.transaction_date as string) },
          { key: 'transaction_type', header: 'Type', render: (r) => <span className="capitalize text-xs bg-gray-100 px-2 py-0.5 rounded">{(r.transaction_type as string || '').replace(/_/g, ' ')}</span> },
          { key: 'code', header: 'Code', width: '100px' },
          { key: 'name', header: 'Name' },
          { key: 'warehouse_name', header: 'Warehouse' },
          { key: 'quantity_in', header: 'In', align: 'right', render: (r) => parseFloat(r.quantity_in as string || '0') > 0 ? <span className="text-green-600">+{formatIndianNumber(r.quantity_in as string, 0)}</span> : '—' },
          { key: 'quantity_out', header: 'Out', align: 'right', render: (r) => parseFloat(r.quantity_out as string || '0') > 0 ? <span className="text-red-600">-{formatIndianNumber(r.quantity_out as string, 0)}</span> : '—' },
          { key: 'balance_quantity', header: 'Balance', align: 'right', render: (r) => formatIndianNumber(r.balance_quantity as string, 0) },
        ],
      },
    ],
  },
  {
    label: 'Financial', key: 'financial', color: 'indigo',
    reports: [
      {
        label: 'Trial Balance', key: 'trial-balance',
        apiCall: (p) => reportsApi.financial.trialBalance(p),
        columns: [
          { key: 'account_code', header: 'Code', width: '100px' },
          { key: 'account_name', header: 'Account', sortable: true },
          { key: 'account_type', header: 'Type', render: (r) => <span className="capitalize text-xs bg-gray-100 px-2 py-0.5 rounded">{r.account_type as string}</span> },
          { key: 'total_debit', header: 'Debit', align: 'right', render: (r) => <AmountDisplay value={r.total_debit as string} /> },
          { key: 'total_credit', header: 'Credit', align: 'right', render: (r) => <AmountDisplay value={r.total_credit as string} /> },
          { key: 'balance', header: 'Balance', align: 'right', render: (r) => <AmountDisplay value={r.balance as string} colorCode /> },
        ],
      },
      {
        label: 'Profit & Loss', key: 'pnl',
        apiCall: (p) => reportsApi.financial.profitAndLoss(p),
        columns: [],
        specialRenderer: 'pnl',
        summaryFields: [
          { label: 'Total Income', key: 'total_revenue', format: 'amount' },
          { label: 'Total Expenses', key: 'total_expense', format: 'amount' },
          { label: 'Net Profit/Loss', key: 'net_profit', format: 'amount' },
          { label: 'Margin', key: 'net_profit_margin', format: 'percent' },
        ],
      },
      {
        label: 'Balance Sheet', key: 'balance-sheet',
        apiCall: (p) => reportsApi.financial.balanceSheet(p),
        columns: [],
        specialRenderer: 'balance-sheet',
        summaryFields: [
          { label: 'Total Assets', key: 'total_assets', format: 'amount' },
          { label: 'Total Liabilities', key: 'total_liabilities', format: 'amount' },
          { label: 'Total Equity', key: 'total_equity', format: 'amount' },
        ],
      },
      {
        label: 'Receivables', key: 'receivables',
        apiCall: (p) => reportsApi.financial.outstandingReceivables(p),
        columns: [
          { key: 'customer_code', header: 'Code', width: '100px' },
          { key: 'customer_name', header: 'Customer', sortable: true },
          { key: 'invoice_number', header: 'Invoice' },
          { key: 'invoice_date', header: 'Date', render: (r) => formatDate(r.invoice_date as string) },
          { key: 'grand_total', header: 'Amount', align: 'right', render: (r) => <AmountDisplay value={r.grand_total as string} /> },
          { key: 'days_outstanding', header: 'Days', align: 'right', sortable: true, render: (r) => <span className={Number(r.days_outstanding) > 60 ? 'text-red-600 font-medium' : ''}>{r.days_outstanding as number}</span> },
          { key: 'aging_bucket', header: 'Aging', render: (r) => {
            const bucket = r.aging_bucket as string;
            const color = bucket === '90+' ? 'red' : bucket === '61-90' ? 'orange' : bucket === '31-60' ? 'yellow' : 'green';
            return <span className={`text-xs px-2 py-0.5 rounded bg-${color}-100 text-${color}-700`}>{bucket} days</span>;
          }},
        ],
      },
      {
        label: 'Payables', key: 'payables',
        apiCall: (p) => reportsApi.financial.outstandingPayables(p),
        columns: [
          { key: 'vendor_code', header: 'Code', width: '100px' },
          { key: 'vendor_name', header: 'Vendor', sortable: true },
          { key: 'bill_number', header: 'Bill' },
          { key: 'bill_date', header: 'Date', render: (r) => formatDate(r.bill_date as string) },
          { key: 'grand_total', header: 'Amount', align: 'right', render: (r) => <AmountDisplay value={r.grand_total as string} /> },
          { key: 'days_outstanding', header: 'Days', align: 'right', sortable: true, render: (r) => <span className={Number(r.days_outstanding) > 60 ? 'text-red-600 font-medium' : ''}>{r.days_outstanding as number}</span> },
          { key: 'aging_bucket', header: 'Aging', render: (r) => {
            const bucket = r.aging_bucket as string;
            const color = bucket === '90+' ? 'red' : bucket === '61-90' ? 'orange' : bucket === '31-60' ? 'yellow' : 'green';
            return <span className={`text-xs px-2 py-0.5 rounded bg-${color}-100 text-${color}-700`}>{bucket} days</span>;
          }},
        ],
      },
      {
        label: 'Ledger', key: 'ledger',
        apiCall: (p) => reportsApi.financial.ledger(p),
        columns: [
          { key: 'voucher_date', header: 'Date', render: (r) => formatDate(r.voucher_date as string) },
          { key: 'voucher_type', header: 'Type', render: (r) => <span className="capitalize text-xs bg-gray-100 px-2 py-0.5 rounded">{r.voucher_type as string}</span> },
          { key: 'voucher_number', header: 'Voucher #' },
          { key: 'account_name', header: 'Account' },
          { key: 'debit_amount', header: 'Debit', align: 'right', render: (r) => parseFloat(r.debit_amount as string || '0') > 0 ? <AmountDisplay value={r.debit_amount as string} /> : '—' },
          { key: 'credit_amount', header: 'Credit', align: 'right', render: (r) => parseFloat(r.credit_amount as string || '0') > 0 ? <AmountDisplay value={r.credit_amount as string} /> : '—' },
          { key: 'running_balance', header: 'Balance', align: 'right', render: (r) => <AmountDisplay value={r.running_balance as number} colorCode /> },
          { key: 'narration', header: 'Narration', width: '200px' },
        ],
      },
    ],
  },
  {
    label: 'Manufacturing', key: 'manufacturing', color: 'orange',
    reports: [
      {
        label: 'Production Summary', key: 'production-summary',
        apiCall: (p) => reportsApi.manufacturing.productionSummary(p),
        columns: [
          { key: 'product_code', header: 'Code', width: '100px' },
          { key: 'product_name', header: 'Product', sortable: true },
          { key: 'entry_count', header: 'Entries', align: 'right' },
          { key: 'total_produced', header: 'Produced', align: 'right', sortable: true, render: (r) => formatIndianNumber(r.total_produced as string, 0) },
          { key: 'total_cost', header: 'Total Cost', align: 'right', render: (r) => <AmountDisplay value={r.total_cost as string} /> },
          { key: 'avg_unit_cost', header: 'Avg Unit Cost', align: 'right', render: (r) => <AmountDisplay value={r.avg_unit_cost as string} /> },
        ],
      },
      {
        label: 'Scrap Analysis', key: 'scrap-analysis',
        apiCall: (p) => reportsApi.manufacturing.scrapAnalysis(p),
        columns: [
          { key: 'item_code', header: 'Code', width: '100px' },
          { key: 'item_name', header: 'Item', sortable: true },
          { key: 'reason', header: 'Reason', render: (r) => <span className="capitalize">{r.reason as string}</span> },
          { key: 'entry_count', header: 'Entries', align: 'right' },
          { key: 'total_quantity', header: 'Qty', align: 'right', render: (r) => formatIndianNumber(r.total_quantity as string, 0) },
          { key: 'total_scrap_value', header: 'Scrap Value', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_scrap_value as string} /> },
          { key: 'total_recoverable', header: 'Recoverable', align: 'right', render: (r) => <AmountDisplay value={r.total_recoverable as string} /> },
        ],
      },
      {
        label: 'Consumption Variance', key: 'consumption-variance',
        apiCall: (p) => reportsApi.manufacturing.consumptionVariance(p),
        columns: [
          { key: 'work_order_number', header: 'WO #' },
          { key: 'item_code', header: 'Item Code', width: '100px' },
          { key: 'item_name', header: 'Item' },
          { key: 'planned_quantity', header: 'Planned', align: 'right' },
          { key: 'consumed_quantity', header: 'Consumed', align: 'right' },
          { key: 'variance_qty', header: 'Variance', align: 'right', render: (r) => {
            const v = parseFloat(r.variance_qty as string || '0');
            return <span className={v > 0 ? 'text-red-600' : v < 0 ? 'text-green-600' : ''}>{v > 0 ? '+' : ''}{formatIndianNumber(v, 2)}</span>;
          }},
          { key: 'variance_pct', header: 'Var %', align: 'right', render: (r) => {
            const v = parseFloat(r.variance_pct as string || '0');
            return <span className={v > 5 ? 'text-red-600 font-medium' : v < -5 ? 'text-green-600' : ''}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</span>;
          }},
        ],
      },
    ],
  },
  {
    label: 'Branch', key: 'branch', color: 'teal',
    reports: [
      {
        label: 'Warehouse Profitability', key: 'warehouse-profitability',
        apiCall: (p) => reportsApi.branch.warehouseProfitability(p),
        columns: [
          { key: 'warehouse_code', header: 'Code', width: '80px' },
          { key: 'warehouse_name', header: 'Warehouse', sortable: true },
          { key: 'branch_name', header: 'Branch' },
          { key: 'sku_count', header: 'SKUs', align: 'right' },
          { key: 'total_quantity', header: 'Qty', align: 'right', render: (r) => formatIndianNumber(r.total_quantity as string, 0) },
          { key: 'inventory_value', header: 'Inventory Value', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.inventory_value as string} className="font-semibold" /> },
        ],
      },
      {
        label: 'Product Profitability', key: 'product-profitability',
        apiCall: (p) => reportsApi.branch.productProfitability(p),
        columns: [
          { key: 'product_code', header: 'Code', width: '100px' },
          { key: 'product_name', header: 'Product', sortable: true },
          { key: 'selling_price', header: 'Selling Price', align: 'right', render: (r) => <AmountDisplay value={r.selling_price as string} /> },
          { key: 'standard_cost', header: 'Std Cost', align: 'right', render: (r) => <AmountDisplay value={r.standard_cost as string} /> },
          { key: 'avg_production_cost', header: 'Avg Prod Cost', align: 'right', render: (r) => <AmountDisplay value={r.avg_production_cost as string} /> },
          { key: 'profit_margin_pct', header: 'Margin %', align: 'right', sortable: true, render: (r) => {
            const v = parseFloat(r.profit_margin_pct as string || '0');
            return r.profit_margin_pct ? <span className={v >= 20 ? 'text-green-600 font-medium' : v < 10 ? 'text-red-600' : ''}>{v.toFixed(1)}%</span> : '—';
          }},
        ],
      },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────

export function ReportViewerPage() {
  const [activeCategory, setActiveCategory] = useState(0);
  const [activeReport, setActiveReport] = useState(0);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchesLoaded, setBranchesLoaded] = useState(false);

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Load branches once
  React.useEffect(() => {
    if (!branchesLoaded) {
      settingsApi.listBranches().then((res: any) => {
        setBranches((res?.data || []).map((b: any) => ({ id: b.id, name: b.name })));
        setBranchesLoaded(true);
      }).catch(() => setBranchesLoaded(true));
    }
  }, [branchesLoaded]);

  const category = REPORT_CATEGORIES[activeCategory];
  const report = category.reports[activeReport];

  const handleCategoryChange = useCallback((idx: number) => {
    setActiveCategory(idx);
    setActiveReport(0);
    setGenerated(false);
    setData([]);
    setSummary(null);
    setRawResponse(null);
  }, []);

  const handleReportChange = useCallback((idx: number) => {
    setActiveReport(idx);
    setGenerated(false);
    setData([]);
    setSummary(null);
    setRawResponse(null);
  }, []);

  const generateReport = useCallback(async (reportPage = 1) => {
    setLoading(true);
    setGenerated(true);
    setPage(reportPage);
    try {
      const params: ReportParams = { date_from: dateFrom, date_to: dateTo, page: reportPage, limit };
      if (branchId) params.branch_id = branchId;

      const result: any = await report.apiCall(params);
      const resData = result?.data;

      if (Array.isArray(resData)) {
        setData(resData);
        setTotal(resData.length);
        setSummary(null);
        setRawResponse(resData);
      } else if (resData?.data && Array.isArray(resData.data)) {
        setData(resData.data);
        setTotal(resData.total || resData.data.length);
        setSummary(resData.totals || resData.summary || null);
        setRawResponse(resData);
      } else if (resData?.by_warehouse) {
        setData(resData.by_warehouse);
        setTotal(resData.by_warehouse.length);
        setSummary({ grand_total: resData.grand_total });
        setRawResponse(resData);
      } else {
        setData([]);
        setTotal(0);
        setSummary(resData?.summary || resData?.totals || null);
        setRawResponse(resData);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate report');
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branchId, report, limit]);

  return (
    <div>
      <PageHeader title="Reports" subtitle="Generate and view business reports across all modules" />

      {/* Category Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {REPORT_CATEGORIES.map((cat, idx) => (
          <button
            key={cat.key}
            onClick={() => handleCategoryChange(idx)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              idx === activeCategory
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Sub-report Pills */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {category.reports.map((rep, idx) => (
          <button
            key={rep.key}
            onClick={() => handleReportChange(idx)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              idx === activeReport
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {rep.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 min-w-[160px]">
            <option value="">All Branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <button onClick={() => generateReport(1)}
          className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shadow-sm">
          Generate Report
        </button>
      </div>

      {/* Summary Cards */}
      {generated && summary && report.summaryFields && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {report.summaryFields.map((sf) => {
            const val = summary[sf.key] as number;
            return (
              <div key={sf.key} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{sf.label}</p>
                <p className="text-lg font-semibold text-gray-900">
                  {sf.format === 'amount' ? <AmountDisplay value={val} /> :
                   sf.format === 'percent' ? formatPercent(val) :
                   formatIndianNumber(val, 0)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Report Content */}
      {!generated ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <svg className="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-500 text-sm">Select a report category and click Generate Report to view data</p>
        </div>
      ) : report.specialRenderer === 'pnl' ? (
        <PnLRenderer data={rawResponse as any} loading={loading} />
      ) : report.specialRenderer === 'balance-sheet' ? (
        <BalanceSheetRenderer data={rawResponse as any} loading={loading} />
      ) : (
        <DataTable
          columns={report.columns}
          data={data}
          loading={loading}
          total={total}
          page={page}
          limit={limit}
          onPageChange={(p) => generateReport(p)}
          emptyMessage="No data found for the selected filters"
        />
      )}
    </div>
  );
}

// ─── P&L Renderer ───────────────────────────────────────────────

function PnLRenderer({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <div className="bg-white border border-gray-200 rounded-xl p-8 animate-pulse"><div className="skeleton h-6 w-48 rounded mb-4" /><div className="skeleton h-4 w-full rounded mb-2" /><div className="skeleton h-4 w-full rounded mb-2" /><div className="skeleton h-4 w-3/4 rounded" /></div>;
  if (!data?.data) return <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">No P&L data available</div>;

  const rows: any[] = data.data || [];
  const summary = data.summary || {};
  const revenue = rows.filter((r: any) => r.account_type === 'revenue');
  const expenses = rows.filter((r: any) => r.account_type === 'expense');

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Account</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase w-40">Amount</th>
          </tr>
        </thead>
        <tbody>
          {/* Income Section */}
          <tr className="bg-green-50 border-b border-green-200">
            <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-green-800">Income</td>
          </tr>
          {revenue.map((r: any, i: number) => (
            <tr key={`rev-${i}`} className="border-b border-gray-100">
              <td className="px-4 py-2 pl-8 text-gray-700">{r.account_name} <span className="text-gray-400 text-xs ml-1">{r.account_code}</span></td>
              <td className="px-4 py-2 text-right"><AmountDisplay value={r.net_amount} /></td>
            </tr>
          ))}
          <tr className="bg-green-50 border-b border-gray-200">
            <td className="px-4 py-2 font-semibold text-green-800">Total Income</td>
            <td className="px-4 py-2 text-right font-semibold"><AmountDisplay value={summary.total_revenue} /></td>
          </tr>

          {/* Expense Section */}
          <tr className="bg-red-50 border-b border-red-200 mt-2">
            <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-red-800">Expenses</td>
          </tr>
          {expenses.map((r: any, i: number) => (
            <tr key={`exp-${i}`} className="border-b border-gray-100">
              <td className="px-4 py-2 pl-8 text-gray-700">{r.account_name} <span className="text-gray-400 text-xs ml-1">{r.account_code}</span></td>
              <td className="px-4 py-2 text-right"><AmountDisplay value={r.net_amount} /></td>
            </tr>
          ))}
          <tr className="bg-red-50 border-b border-gray-200">
            <td className="px-4 py-2 font-semibold text-red-800">Total Expenses</td>
            <td className="px-4 py-2 text-right font-semibold"><AmountDisplay value={summary.total_expense} /></td>
          </tr>

          {/* Net */}
          <tr className={summary.net_profit >= 0 ? 'bg-green-100' : 'bg-red-100'}>
            <td className="px-4 py-3 font-bold text-gray-900">Net Profit / Loss</td>
            <td className="px-4 py-3 text-right font-bold"><AmountDisplay value={summary.net_profit} colorCode /></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Balance Sheet Renderer ─────────────────────────────────────

function BalanceSheetRenderer({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return <div className="bg-white border border-gray-200 rounded-xl p-8 animate-pulse"><div className="skeleton h-6 w-48 rounded mb-4" /><div className="skeleton h-4 w-full rounded mb-2" /><div className="skeleton h-4 w-full rounded mb-2" /><div className="skeleton h-4 w-3/4 rounded" /></div>;
  if (!data?.data) return <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">No Balance Sheet data available</div>;

  const rows: any[] = data.data || [];
  const summary = data.summary || {};

  const sections = [
    { type: 'asset', label: 'Assets', bgClass: 'bg-blue-50', textClass: 'text-blue-800', borderClass: 'border-blue-200', totalKey: 'total_assets' },
    { type: 'liability', label: 'Liabilities', bgClass: 'bg-orange-50', textClass: 'text-orange-800', borderClass: 'border-orange-200', totalKey: 'total_liabilities' },
    { type: 'equity', label: 'Equity', bgClass: 'bg-purple-50', textClass: 'text-purple-800', borderClass: 'border-purple-200', totalKey: 'total_equity' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Account</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase w-40">Balance</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => {
            const sectionRows = rows.filter((r: any) => r.account_type === section.type);
            return (
              <React.Fragment key={section.type}>
                <tr className={`${section.bgClass} border-b ${section.borderClass}`}>
                  <td colSpan={2} className={`px-4 py-2 text-sm font-semibold ${section.textClass}`}>{section.label}</td>
                </tr>
                {sectionRows.map((r: any, i: number) => (
                  <tr key={`${section.type}-${i}`} className="border-b border-gray-100">
                    <td className="px-4 py-2 pl-8 text-gray-700">{r.account_name} <span className="text-gray-400 text-xs ml-1">{r.account_code}</span></td>
                    <td className="px-4 py-2 text-right"><AmountDisplay value={Math.abs(parseFloat(r.balance || 0))} /></td>
                  </tr>
                ))}
                <tr className={`${section.bgClass} border-b border-gray-200`}>
                  <td className={`px-4 py-2 font-semibold ${section.textClass}`}>Total {section.label}</td>
                  <td className="px-4 py-2 text-right font-semibold"><AmountDisplay value={summary[section.totalKey]} /></td>
                </tr>
              </React.Fragment>
            );
          })}
          <tr className={summary.is_balanced ? 'bg-green-100' : 'bg-yellow-100'}>
            <td className="px-4 py-3 font-bold text-gray-900">
              {summary.is_balanced ? '✓ Balance Sheet is balanced' : '⚠ Balance Sheet is not balanced'}
            </td>
            <td className="px-4 py-3 text-right font-bold">
              <AmountDisplay value={summary.total_assets} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}