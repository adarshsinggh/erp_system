// src/pages/purchase/VendorPaymentsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { vendorPaymentsApi, VendorPayment } from '@/api/modules/vendor-payments.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const VP_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  confirmed: { label: 'Confirmed', color: 'green' },
  bounced: { label: 'Bounced', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

const PAYMENT_MODE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
];

const MODE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque', upi: 'UPI', card: 'Card',
};

export function VendorPaymentsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<VendorPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [advanceOnly, setAdvanceOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/purchase/payments/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vendorPaymentsApi.list({
        page, limit, search: debouncedSearch || undefined,
        status: statusFilter || undefined, payment_mode: modeFilter || undefined,
        is_advance: advanceOnly || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, modeFilter, advanceOnly]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, modeFilter, advanceOnly]);

  const columns: ColumnDef<VendorPayment>[] = [
    {
      key: 'payment_number', header: 'Payment #', sortable: true, width: '160px',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-medium text-brand-700">{row.payment_number}</span>
          {row.is_advance && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">ADV</span>
          )}
        </div>
      ),
    },
    {
      key: 'payment_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.payment_date)}</span>,
    },
    {
      key: 'vendor', header: 'Vendor',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900 text-sm">{row.vendor?.name || '—'}</div>
          {row.vendor?.vendor_code && <div className="text-xs text-gray-500">{row.vendor.vendor_code}</div>}
        </div>
      ),
    },
    {
      key: 'amount', header: 'Amount', align: 'right', sortable: true, width: '130px',
      render: (row) => <AmountDisplay value={row.amount} />,
    },
    {
      key: 'payment_mode', header: 'Mode', width: '120px',
      render: (row) => <span className="text-xs text-gray-600">{MODE_LABELS[row.payment_mode] || row.payment_mode}</span>,
    },
    {
      key: 'vendor_bill', header: 'Linked Bill', width: '130px',
      render: (row) => row.vendor_bill?.bill_number
        ? <span className="font-mono text-xs text-purple-600">{row.vendor_bill.bill_number}</span>
        : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      key: 'status', header: 'Status', width: '110px',
      render: (row) => <StatusBadge status={row.status} statusMap={VP_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Vendor Payments"
        subtitle={`${total} payment${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Payment', variant: 'primary', onClick: () => navigate('/purchase/payments/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by payment number, vendor..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(VP_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <Select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value)}
          options={PAYMENT_MODE_OPTIONS}
          placeholder="All Modes"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={advanceOnly} onChange={(e) => setAdvanceOnly(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          Advance Only
        </label>
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/purchase/payments/${row.id}`)}
        emptyMessage="No vendor payments found"
        emptyAction={{ label: 'Record your first payment', onClick: () => navigate('/purchase/payments/new') }}
      />
    </div>
  );
}