// src/pages/reports/GSTReportsPage.tsx
// GST Compliance Reporting — GSTR-1 B2B/B2C, Credit Notes, HSN, GSTR-3B, E-Invoice, E-Way Bill

import React, { useState, useCallback } from 'react';
import { PageHeader } from '../../components/shared/PageHeader';
import { DataTable, ColumnDef } from '../../components/shared/DataTable';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { toast } from '../../components/shared/FormElements';
import { gstApi, GSTR3BSummary } from '../../api/modules/reports.api';
import { formatDate, formatIndianNumber } from '../../lib/formatters';
import { INDIAN_STATES } from '../../lib/constants';

// ─── Tab Configuration ──────────────────────────────────────────

const GST_TABS = [
  { key: 'b2b', label: 'GSTR-1 B2B' },
  { key: 'b2c', label: 'GSTR-1 B2C' },
  { key: 'cdnr', label: 'Credit/Debit Notes' },
  { key: 'hsn', label: 'HSN Summary' },
  { key: 'gstr3b', label: 'GSTR-3B' },
  { key: 'einvoice', label: 'E-Invoice' },
  { key: 'eway', label: 'E-Way Bill' },
] as const;

type GSTTabKey = typeof GST_TABS[number]['key'];

// ─── Column Definitions ─────────────────────────────────────────

const B2B_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: 'receiver_gstin', header: 'GSTIN', width: '160px', render: (r) => <span className="font-mono text-xs">{r.receiver_gstin as string}</span> },
  { key: 'receiver_name', header: 'Customer', sortable: true },
  { key: 'invoice_number', header: 'Invoice #' },
  { key: 'invoice_date', header: 'Date', render: (r) => formatDate(r.invoice_date as string) },
  { key: 'hsn_code', header: 'HSN', width: '80px' },
  { key: 'taxable_amount', header: 'Taxable', align: 'right', render: (r) => <AmountDisplay value={r.taxable_amount as string} /> },
  { key: 'cgst_amount', header: 'CGST', align: 'right', render: (r) => <AmountDisplay value={r.cgst_amount as string} /> },
  { key: 'sgst_amount', header: 'SGST', align: 'right', render: (r) => <AmountDisplay value={r.sgst_amount as string} /> },
  { key: 'igst_amount', header: 'IGST', align: 'right', render: (r) => <AmountDisplay value={r.igst_amount as string} /> },
  { key: 'line_total', header: 'Total', align: 'right', render: (r) => <AmountDisplay value={r.line_total as string} className="font-semibold" /> },
];

const B2C_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: 'place_of_supply', header: 'Place of Supply', render: (r) => {
    const code = r.place_of_supply as string;
    return `${code} - ${INDIAN_STATES[code] || code}`;
  }},
  { key: 'invoice_count', header: 'Invoices', align: 'right' },
  { key: 'total_taxable', header: 'Taxable', align: 'right', render: (r) => <AmountDisplay value={r.total_taxable as string} /> },
  { key: 'total_cgst', header: 'CGST', align: 'right', render: (r) => <AmountDisplay value={r.total_cgst as string} /> },
  { key: 'total_sgst', header: 'SGST', align: 'right', render: (r) => <AmountDisplay value={r.total_sgst as string} /> },
  { key: 'total_igst', header: 'IGST', align: 'right', render: (r) => <AmountDisplay value={r.total_igst as string} /> },
  { key: 'total_value', header: 'Total', align: 'right', render: (r) => <AmountDisplay value={r.total_value as string} className="font-semibold" /> },
];

const CDNR_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: 'receiver_gstin', header: 'GSTIN', width: '160px', render: (r) => <span className="font-mono text-xs">{r.receiver_gstin as string || '—'}</span> },
  { key: 'receiver_name', header: 'Customer', sortable: true },
  { key: 'credit_note_number', header: 'CN/DN #' },
  { key: 'credit_note_date', header: 'Date', render: (r) => formatDate(r.credit_note_date as string) },
  { key: 'reason', header: 'Reason', render: (r) => <span className="capitalize">{r.reason as string}</span> },
  { key: 'original_invoice', header: 'Orig. Invoice' },
  { key: 'subtotal', header: 'Taxable', align: 'right', render: (r) => <AmountDisplay value={r.subtotal as string} /> },
  { key: 'cgst_amount', header: 'CGST', align: 'right', render: (r) => <AmountDisplay value={r.cgst_amount as string} /> },
  { key: 'sgst_amount', header: 'SGST', align: 'right', render: (r) => <AmountDisplay value={r.sgst_amount as string} /> },
  { key: 'igst_amount', header: 'IGST', align: 'right', render: (r) => <AmountDisplay value={r.igst_amount as string} /> },
  { key: 'grand_total', header: 'Total', align: 'right', render: (r) => <AmountDisplay value={r.grand_total as string} className="font-semibold" /> },
];

const HSN_COLUMNS: ColumnDef<Record<string, unknown>>[] = [
  { key: 'hsn_code', header: 'HSN Code', width: '120px', render: (r) => <span className="font-mono">{r.hsn_code as string}</span> },
  { key: 'total_quantity', header: 'Quantity', align: 'right', render: (r) => formatIndianNumber(r.total_quantity as string, 0) },
  { key: 'total_taxable', header: 'Taxable Value', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_taxable as string} /> },
  { key: 'total_cgst', header: 'CGST', align: 'right', render: (r) => <AmountDisplay value={r.total_cgst as string} /> },
  { key: 'total_sgst', header: 'SGST', align: 'right', render: (r) => <AmountDisplay value={r.total_sgst as string} /> },
  { key: 'total_igst', header: 'IGST', align: 'right', render: (r) => <AmountDisplay value={r.total_igst as string} /> },
  { key: 'total_value', header: 'Total', align: 'right', sortable: true, render: (r) => <AmountDisplay value={r.total_value as string} className="font-semibold" /> },
];

// ─── Component ──────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function GSTReportsPage() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState<GSTTabKey>('b2b');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [gstr3bData, setGstr3bData] = useState<GSTR3BSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const handleTabChange = useCallback((tab: GSTTabKey) => {
    setActiveTab(tab);
    setGenerated(false);
    setData([]);
    setGstr3bData(null);
  }, []);

  const generateReport = useCallback(async () => {
    setLoading(true);
    setGenerated(true);
    try {
      const params = { month, year };

      switch (activeTab) {
        case 'b2b': {
          const res: any = await gstApi.gstr1B2B(params);
          setData(res?.data || []);
          break;
        }
        case 'b2c': {
          const res: any = await gstApi.gstr1B2C(params);
          setData(res?.data || []);
          break;
        }
        case 'cdnr': {
          const res: any = await gstApi.gstr1CDNR(params);
          setData(res?.data || []);
          break;
        }
        case 'hsn': {
          const res: any = await gstApi.gstr1HSN(params);
          setData(res?.data || []);
          break;
        }
        case 'gstr3b': {
          const res: any = await gstApi.gstr3BSummary(params);
          setGstr3bData(res?.data || null);
          break;
        }
        case 'einvoice':
        case 'eway':
          // These require specific IDs; show placeholder for list-based view
          toast.error('E-Invoice and E-Way Bill reports require specific document IDs. Use the Sales Invoice or Delivery Challan screens.');
          break;
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate GST report');
      setData([]);
      setGstr3bData(null);
    } finally {
      setLoading(false);
    }
  }, [activeTab, month, year]);

  const getColumns = (): ColumnDef<Record<string, unknown>>[] => {
    switch (activeTab) {
      case 'b2b': return B2B_COLUMNS;
      case 'b2c': return B2C_COLUMNS;
      case 'cdnr': return CDNR_COLUMNS;
      case 'hsn': return HSN_COLUMNS;
      default: return [];
    }
  };

  return (
    <div>
      <PageHeader title="GST Returns" subtitle="Prepare GST compliance data for filing" />

      {/* Period Selection */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 min-w-[140px]">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={generateReport}
          className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shadow-sm">
          Generate
        </button>
        <div className="ml-auto text-sm text-gray-500">
          Period: {MONTHS[month - 1]} {year}
        </div>
      </div>

      {/* GST Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {GST_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              tab.key === activeTab
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {!generated ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <svg className="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
          <p className="text-gray-500 text-sm">Select a period and click Generate to view GST data</p>
        </div>
      ) : activeTab === 'gstr3b' ? (
        <GSTR3BRenderer data={gstr3bData} loading={loading} />
      ) : activeTab === 'einvoice' || activeTab === 'eway' ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-600 font-medium mb-1">{activeTab === 'einvoice' ? 'E-Invoice Readiness' : 'E-Way Bill Data'}</p>
          <p className="text-gray-500 text-sm">
            {activeTab === 'einvoice'
              ? 'E-Invoice readiness checks are available per invoice. Check individual invoices from the Sales Invoice screen.'
              : 'E-Way Bill data is available per delivery challan. Generate from the Delivery Challan screen.'}
          </p>
        </div>
      ) : (
        <>
          {/* Summary for table-based tabs */}
          {data.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <SummaryCard label="Records" value={data.length} format="number" />
              {activeTab === 'b2b' && (
                <>
                  <SummaryCard label="Total Taxable" value={sumField(data, 'taxable_amount')} format="amount" />
                  <SummaryCard label="Total Tax" value={sumField(data, 'cgst_amount') + sumField(data, 'sgst_amount') + sumField(data, 'igst_amount')} format="amount" />
                  <SummaryCard label="Total Value" value={sumField(data, 'line_total')} format="amount" />
                </>
              )}
              {activeTab === 'b2c' && (
                <>
                  <SummaryCard label="Total Taxable" value={sumField(data, 'total_taxable')} format="amount" />
                  <SummaryCard label="Total Invoices" value={data.reduce((s, r) => s + Number(r.invoice_count || 0), 0)} format="number" />
                  <SummaryCard label="Total Value" value={sumField(data, 'total_value')} format="amount" />
                </>
              )}
              {activeTab === 'hsn' && (
                <>
                  <SummaryCard label="Total Taxable" value={sumField(data, 'total_taxable')} format="amount" />
                  <SummaryCard label="Total Tax" value={sumField(data, 'total_cgst') + sumField(data, 'total_sgst') + sumField(data, 'total_igst')} format="amount" />
                  <SummaryCard label="Total Value" value={sumField(data, 'total_value')} format="amount" />
                </>
              )}
            </div>
          )}
          <DataTable
            columns={getColumns()}
            data={data}
            loading={loading}
            total={data.length}
            emptyMessage="No data for this period"
          />
        </>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function sumField(data: Record<string, unknown>[], field: string): number {
  return data.reduce((s, r) => s + parseFloat(String(r[field] || 0)), 0);
}

function SummaryCard({ label, value, format }: { label: string; value: number; format: 'amount' | 'number' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-gray-900">
        {format === 'amount' ? <AmountDisplay value={value} /> : formatIndianNumber(value, 0)}
      </p>
    </div>
  );
}

// ─── GSTR-3B Renderer ───────────────────────────────────────────

function GSTR3BRenderer({ data, loading }: { data: GSTR3BSummary | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse">
            <div className="skeleton h-5 w-48 rounded mb-4" />
            <div className="skeleton h-4 w-full rounded mb-2" />
            <div className="skeleton h-4 w-3/4 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-500 text-sm">
        No GSTR-3B data available for this period
      </div>
    );
  }

  const s3 = data.section_3_1;
  const s4 = data.section_4;
  const s6 = data.section_6;

  return (
    <div className="space-y-4">
      {/* Section 3.1: Outward Supplies */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">3.1 — Outward Supplies (Taxable)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <Row label="Taxable Value" value={s3.outward_taxable} />
          <Row label="Invoice Count" value={s3.invoice_count} isNumber />
          <Row label="Output CGST" value={s3.output_cgst} />
          <Row label="Output SGST" value={s3.output_sgst} />
          <Row label="Output IGST" value={s3.output_igst} />
          <Row label="Cess" value={s3.output_cess} />
          <Row label="Credit Note Adjustment" value={s3.credit_note_adjustment} />
        </div>
      </div>

      {/* Section 4: Input Tax Credit */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">4 — Eligible Input Tax Credit</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <Row label="Inward Taxable Value" value={s4.inward_taxable} />
          <Row label="Bill Count" value={s4.bill_count} isNumber />
          <Row label="Input CGST" value={s4.input_cgst} />
          <Row label="Input SGST" value={s4.input_sgst} />
          <Row label="Input IGST" value={s4.input_igst} />
          <Row label="Debit Note Adjustment" value={s4.debit_note_adjustment} />
        </div>
      </div>

      {/* Section 6: Tax Payment */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">6 — Payment of Tax</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <Row label="CGST Payable" value={s6.payable_cgst} />
          <Row label="SGST Payable" value={s6.payable_sgst} />
          <Row label="IGST Payable" value={s6.payable_igst} />
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-900">Total Tax Payable</span>
          <span className="text-lg font-bold text-red-600"><AmountDisplay value={s6.total_payable} /></span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, isNumber }: { label: string; value: number; isNumber?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-medium text-gray-900 font-tabular">
        {isNumber ? formatIndianNumber(value, 0) : <AmountDisplay value={value} />}
      </span>
    </div>
  );
}