// src/pages/reports/InsightsPage.tsx
// Business Insights Dashboard — Stock Movement, Predictions, Margins, Vendor, Customer Risk, Profitability

import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../../components/shared/PageHeader';
import { DataTable, ColumnDef } from '../../components/shared/DataTable';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { toast } from '../../components/shared/FormElements';
import { insightsApi } from '../../api/modules/reports.api';
import { formatIndianNumber, formatDate } from '../../lib/formatters';

// ─── Tab Configuration ──────────────────────────────────────────

const INSIGHT_TABS = [
  { key: 'movement', label: 'Stock Movement' },
  { key: 'predictions', label: 'Stock Predictions' },
  { key: 'margins', label: 'Margin Analysis' },
  { key: 'vendor', label: 'Vendor Score' },
  { key: 'customer', label: 'Customer Risk' },
  { key: 'profitability', label: 'Profitability' },
] as const;

type InsightTabKey = typeof INSIGHT_TABS[number]['key'];

// ─── Shared Helpers ─────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: 'green' | 'yellow' | 'red' | 'blue' | 'gray' | 'orange' | 'purple' }) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700', yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700', blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-700', orange: 'bg-orange-100 text-orange-700',
    purple: 'bg-purple-100 text-purple-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[color]}`}>{label}</span>;
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[100px]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-700 w-8 text-right">{value}</span>
    </div>
  );
}

function KpiCard({ label, value, format = 'number', color }: {
  label: string; value: number | string; format?: 'amount' | 'number' | 'percent'; color?: string;
}) {
  const borderColors: Record<string, string> = {
    red: 'border-l-red-500', green: 'border-l-green-500', blue: 'border-l-blue-500', orange: 'border-l-orange-500',
  };
  const bc = borderColors[color || ''] || 'border-l-brand-500';
  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-4 border-l-4 ${bc}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-gray-900">
        {format === 'amount' ? <AmountDisplay value={value} /> :
         format === 'percent' ? `${typeof value === 'number' ? value.toFixed(1) : value}%` :
         typeof value === 'number' ? formatIndianNumber(value, 0) : value}
      </p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export function InsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightTabKey>('movement');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [movementDays, setMovementDays] = useState(90);

  const fetchData = useCallback(async (tab: InsightTabKey) => {
    setLoading(true);
    setData([]);
    setSummary({});
    try {
      switch (tab) {
        case 'movement': {
          const res: any = await insightsApi.itemMovement({ days: movementDays, limit: 100 });
          setData(res?.data?.data || []);
          setSummary(res?.data?.summary || {});
          break;
        }
        case 'predictions': {
          const res: any = await insightsApi.lowStockPrediction({ limit: 100 });
          setData(res?.data?.data || []);
          break;
        }
        case 'margins': {
          const res: any = await insightsApi.marginAnalysis({ days: 90, limit: 100 });
          setData(res?.data?.data || []);
          break;
        }
        case 'vendor': {
          const res: any = await insightsApi.vendorReliability({ limit: 100 });
          setData(res?.data?.data || []);
          break;
        }
        case 'customer': {
          const res: any = await insightsApi.customerPaymentRisk({ limit: 100 });
          setData(res?.data?.data || []);
          break;
        }
        case 'profitability': {
          const res: any = await insightsApi.profitability({ days: 90 });
          setData(res?.data?.data || []);
          break;
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [movementDays]);

  useEffect(() => { fetchData(activeTab); }, [activeTab, fetchData]);

  return (
    <div>
      <PageHeader title="Business Insights" subtitle="AI-powered business intelligence and actionable recommendations"
        actions={[{ label: 'Refresh', onClick: () => fetchData(activeTab), variant: 'secondary' }]} />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {INSIGHT_TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              tab.key === activeTab ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'movement' && <MovementTab data={data} summary={summary} loading={loading} days={movementDays} onDaysChange={setMovementDays} />}
      {activeTab === 'predictions' && <PredictionsTab data={data} loading={loading} />}
      {activeTab === 'margins' && <MarginsTab data={data} loading={loading} />}
      {activeTab === 'vendor' && <VendorTab data={data} loading={loading} />}
      {activeTab === 'customer' && <CustomerTab data={data} loading={loading} />}
      {activeTab === 'profitability' && <ProfitabilityTab data={data} loading={loading} />}
    </div>
  );
}

// ─── Stock Movement Tab ─────────────────────────────────────────

function MovementTab({ data, summary, loading, days, onDaysChange }: {
  data: Record<string, unknown>[]; summary: Record<string, unknown>; loading: boolean;
  days: number; onDaysChange: (d: number) => void;
}) {
  const columns: ColumnDef<Record<string, unknown>>[] = [
    { key: 'item_code', header: 'Code', width: '100px' },
    { key: 'item_name', header: 'Item', sortable: true },
    { key: 'movement_category', header: 'Category', render: (r) => {
      const cat = r.movement_category as string;
      const color = cat === 'fast' ? 'green' : cat === 'slow' ? 'yellow' : cat === 'dead' ? 'red' : 'blue';
      return <Badge label={cat.charAt(0).toUpperCase() + cat.slice(1)} color={color} />;
    }},
    { key: 'total_consumed', header: 'Total Out', align: 'right', sortable: true, render: (r) => formatIndianNumber(r.total_consumed as string, 0) },
    { key: 'movement_days', header: 'Move Days', align: 'right' },
    { key: 'avg_daily_consumption', header: 'Avg/Day', align: 'right', render: (r) => parseFloat(r.avg_daily_consumption as string || '0').toFixed(2) },
    { key: 'current_stock', header: 'Stock', align: 'right', render: (r) => formatIndianNumber(r.current_stock as string, 0) },
    { key: 'last_movement', header: 'Last Move', render: (r) => formatDate(r.last_movement as string) },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs text-gray-500">Analysis Period:</label>
        <select value={days} onChange={(e) => onDaysChange(parseInt(e.target.value, 10))}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Fast Moving" value={Number(summary.fast || 0)} color="green" />
        <KpiCard label="Normal" value={Number(summary.normal || 0)} color="blue" />
        <KpiCard label="Slow Moving" value={Number(summary.slow || 0)} color="orange" />
        <KpiCard label="Dead Stock" value={Number(summary.dead || 0)} color="red" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={data.length} emptyMessage="No movement data available" />
    </div>
  );
}

// ─── Stock Predictions Tab ──────────────────────────────────────

function PredictionsTab({ data, loading }: { data: Record<string, unknown>[]; loading: boolean }) {
  const columns: ColumnDef<Record<string, unknown>>[] = [
    { key: 'item_code', header: 'Code', width: '100px' },
    { key: 'item_name', header: 'Item', sortable: true },
    { key: 'warehouse_name', header: 'Warehouse' },
    { key: 'current_stock', header: 'Stock', align: 'right', render: (r) => `${formatIndianNumber(r.current_stock as string, 0)} ${r.uom_symbol || ''}` },
    { key: 'avg_daily_consumption', header: 'Avg/Day', align: 'right', render: (r) => parseFloat(r.avg_daily_consumption as string || '0').toFixed(2) },
    { key: 'days_until_stockout', header: 'Days Left', align: 'right', sortable: true, render: (r) => {
      const d = r.days_until_stockout as number | null;
      if (d === null || d === undefined) return '—';
      const color = d < 7 ? 'red' : d < 14 ? 'orange' : 'green';
      return <Badge label={`${Math.round(d)} days`} color={color} />;
    }},
    { key: 'min_stock_threshold', header: 'Min Level', align: 'right', render: (r) => formatIndianNumber(r.min_stock_threshold as string, 0) },
    { key: 'reorder_quantity', header: 'Reorder Qty', align: 'right', render: (r) => formatIndianNumber(r.reorder_quantity as string, 0) },
  ];

  const critical = data.filter((r) => r.days_until_stockout !== null && Number(r.days_until_stockout) < 7).length;
  const warning = data.filter((r) => r.days_until_stockout !== null && Number(r.days_until_stockout) >= 7 && Number(r.days_until_stockout) < 14).length;
  const healthy = data.filter((r) => r.days_until_stockout !== null && Number(r.days_until_stockout) >= 14).length;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <KpiCard label="Critical (< 7 days)" value={critical} color="red" />
        <KpiCard label="Warning (7-14 days)" value={warning} color="orange" />
        <KpiCard label="Healthy (> 14 days)" value={healthy} color="green" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={data.length} emptyMessage="No stockout predictions" />
    </div>
  );
}

// ─── Margin Analysis Tab ────────────────────────────────────────

function MarginsTab({ data, loading }: { data: Record<string, unknown>[]; loading: boolean }) {
  const columns: ColumnDef<Record<string, unknown>>[] = [
    { key: 'item_code', header: 'Code', width: '100px' },
    { key: 'item_name', header: 'Item', sortable: true },
    { key: 'purchase_price', header: 'Purchase', align: 'right', render: (r) => <AmountDisplay value={r.purchase_price as string} /> },
    { key: 'selling_price', header: 'Selling', align: 'right', render: (r) => <AmountDisplay value={r.selling_price as string} /> },
    { key: 'margin_amount', header: 'Margin', align: 'right', render: (r) => <AmountDisplay value={r.margin_amount as string} colorCode /> },
    { key: 'margin_percentage', header: 'Margin %', align: 'right', sortable: true, render: (r) => {
      const v = parseFloat(r.margin_percentage as string || '0');
      return <span className={v >= 20 ? 'text-green-600 font-medium' : v < 10 ? 'text-red-600 font-medium' : ''}>{v.toFixed(1)}%</span>;
    }},
    { key: 'effective_margin_pct', header: 'Effective %', align: 'right', render: (r) => {
      const v = r.effective_margin_pct as string;
      return v ? `${parseFloat(v).toFixed(1)}%` : '—';
    }},
  ];

  const margins = data.map((r) => parseFloat(r.margin_percentage as string || '0')).filter((v) => !isNaN(v));
  const avgMargin = margins.length > 0 ? margins.reduce((s, v) => s + v, 0) / margins.length : 0;
  const highest = margins.length > 0 ? Math.max(...margins) : 0;
  const lowest = margins.length > 0 ? Math.min(...margins) : 0;
  const dropAlerts = margins.filter((v) => v < 10).length;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Avg Margin" value={avgMargin} format="percent" color="blue" />
        <KpiCard label="Highest" value={highest} format="percent" color="green" />
        <KpiCard label="Lowest" value={lowest} format="percent" color="red" />
        <KpiCard label="Low Margin Alerts" value={dropAlerts} color="orange" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={data.length} emptyMessage="No margin data available" />
    </div>
  );
}

// ─── Vendor Reliability Tab ─────────────────────────────────────

function VendorTab({ data, loading }: { data: Record<string, unknown>[]; loading: boolean }) {
  const columns: ColumnDef<Record<string, unknown>>[] = [
    { key: 'vendor_code', header: 'Code', width: '100px' },
    { key: 'vendor_name', header: 'Vendor', sortable: true },
    { key: 'reliability_score', header: 'Score', align: 'center', sortable: true, render: (r) => <ScoreBar value={Number(r.reliability_score || 0)} /> },
    { key: 'average_lead_days', header: 'Avg Lead', align: 'right', render: (r) => r.average_lead_days != null ? `${r.average_lead_days} days` : '—' },
    { key: 'avg_delivery_variance_days', header: 'Delivery Var.', align: 'right', render: (r) => {
      const v = r.avg_delivery_variance_days;
      if (v === null || v === undefined) return '—';
      const num = Number(v);
      return <span className={num > 2 ? 'text-red-600' : num < -2 ? 'text-green-600' : ''}>{num > 0 ? '+' : ''}{num.toFixed(1)} days</span>;
    }},
    { key: 'total_pos', header: 'POs', align: 'right' },
    { key: 'total_grns', header: 'GRNs', align: 'right' },
    { key: 'is_preferred', header: 'Preferred', align: 'center', render: (r) => r.is_preferred ? <Badge label="Preferred" color="green" /> : '—' },
  ];

  const reliable = data.filter((r) => Number(r.reliability_score || 0) >= 80).length;
  const atRisk = data.filter((r) => { const s = Number(r.reliability_score || 0); return s >= 50 && s < 80; }).length;
  const unreliable = data.filter((r) => Number(r.reliability_score || 0) < 50).length;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <KpiCard label="Reliable (80+)" value={reliable} color="green" />
        <KpiCard label="At Risk (50-80)" value={atRisk} color="orange" />
        <KpiCard label="Unreliable (<50)" value={unreliable} color="red" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={data.length} emptyMessage="No vendor data available" />
    </div>
  );
}

// ─── Customer Payment Risk Tab ──────────────────────────────────

function CustomerTab({ data, loading }: { data: Record<string, unknown>[]; loading: boolean }) {
  const columns: ColumnDef<Record<string, unknown>>[] = [
    { key: 'customer_code', header: 'Code', width: '100px' },
    { key: 'customer_name', header: 'Customer', sortable: true },
    { key: 'total_invoices', header: 'Invoices', align: 'right' },
    { key: 'total_invoiced', header: 'Total Invoiced', align: 'right', render: (r) => <AmountDisplay value={r.total_invoiced as string} /> },
    { key: 'outstanding_amount', header: 'Outstanding', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.outstanding_amount as string} className="font-semibold" /> },
    { key: 'overdue_count', header: 'Overdue', align: 'right', render: (r) => {
      const count = Number(r.overdue_count || 0);
      return count > 0 ? <span className="text-red-600 font-medium">{count}</span> : '0';
    }},
    { key: 'credit_utilization_pct', header: 'Credit Used', align: 'right', render: (r) => {
      const v = r.credit_utilization_pct as string;
      if (!v) return '—';
      const num = parseFloat(v);
      return <span className={num > 90 ? 'text-red-600 font-medium' : num > 70 ? 'text-orange-600' : ''}>{num.toFixed(0)}%</span>;
    }},
    { key: 'payment_risk', header: 'Risk Level', render: (r) => {
      const risk = r.payment_risk as string;
      const color = risk === 'high' ? 'red' : risk === 'medium' ? 'yellow' : 'green';
      return <Badge label={risk.charAt(0).toUpperCase() + risk.slice(1)} color={color as any} />;
    }},
  ];

  const high = data.filter((r) => r.payment_risk === 'high').length;
  const totalAtRisk = data.filter((r) => r.payment_risk === 'high' || r.payment_risk === 'medium')
    .reduce((s, r) => s + parseFloat(r.outstanding_amount as string || '0'), 0);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <KpiCard label="High Risk Customers" value={high} color="red" />
        <KpiCard label="At-Risk Amount" value={totalAtRisk} format="amount" color="orange" />
        <KpiCard label="Total Customers" value={data.length} color="blue" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={data.length} emptyMessage="No customer payment data available" />
    </div>
  );
}

// ─── Profitability Tab ──────────────────────────────────────────

function ProfitabilityTab({ data, loading }: { data: Record<string, unknown>[]; loading: boolean }) {
  const columns: ColumnDef<Record<string, unknown>>[] = [
    { key: 'branch_code', header: 'Code', width: '80px' },
    { key: 'branch_name', header: 'Branch', sortable: true },
    { key: 'total_revenue', header: 'Revenue', align: 'right', render: (r) => <AmountDisplay value={r.total_revenue as string} /> },
    { key: 'total_cost', header: 'Cost', align: 'right', render: (r) => <AmountDisplay value={r.total_cost as string} /> },
    { key: 'gross_profit', header: 'Gross Profit', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.gross_profit as string} colorCode className="font-semibold" /> },
    { key: 'gross_margin_pct', header: 'Margin %', align: 'right', render: (r) => {
      const v = parseFloat(r.gross_margin_pct as string || '0');
      return <span className={v >= 20 ? 'text-green-600 font-medium' : v < 10 ? 'text-red-600 font-medium' : ''}>{v.toFixed(1)}%</span>;
    }},
    { key: 'invoice_count', header: 'Invoices', align: 'right' },
    { key: 'bill_count', header: 'Bills', align: 'right' },
  ];

  const profits = data.map((r) => parseFloat(r.gross_profit as string || '0')).filter((v) => !isNaN(v));
  const best = profits.length > 0 ? Math.max(...profits) : 0;
  const worst = profits.length > 0 ? Math.min(...profits) : 0;
  const margins = data.map((r) => parseFloat(r.gross_margin_pct as string || '0')).filter((v) => !isNaN(v));
  const avgMargin = margins.length > 0 ? margins.reduce((s, v) => s + v, 0) / margins.length : 0;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <KpiCard label="Best Profit" value={best} format="amount" color="green" />
        <KpiCard label="Worst Profit" value={worst} format="amount" color="red" />
        <KpiCard label="Avg Margin" value={avgMargin} format="percent" color="blue" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={data.length} emptyMessage="No profitability data available" />
    </div>
  );
}