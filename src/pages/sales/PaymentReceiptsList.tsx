// src/pages/sales/PaymentReceiptsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentReceiptsApi, PaymentReceipt } from '@/api/modules/payment-receipts.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const RECEIPT_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  confirmed: { label: 'Confirmed', color: 'green' },
  bounced: { label: 'Bounced', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

const PAYMENT_MODES: Record<string, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  upi: 'UPI',
  card: 'Card',
};

export function PaymentReceiptsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PaymentReceipt[]>([]);
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
    'ctrl+n': () => navigate('/sales/payments/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentReceiptsApi.list({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        payment_mode: modeFilter || undefined,
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

  const columns: ColumnDef<PaymentReceipt>[] = [
    {
      key: 'receipt_number', header: 'Receipt #', sortable: true, width: '150px',
      render: (row) => (
        <div>
          <span className="font-mono text-xs font-medium text-brand-700">{row.receipt_number}</span>
          {row.is_advance && (
            <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">ADV</span>
          )}
        </div>
      ),
    },
    {
      key: 'receipt_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.receipt_date)}</span>,
    },
    {
      key: 'customer', header: 'Customer',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900 text-sm">{row.customer?.name || '—'}</div>
          {row.customer?.customer_code && (
            <div className="text-xs text-gray-500">{row.customer.customer_code}</div>
          )}
        </div>
      ),
    },
    {
      key: 'amount', header: 'Amount', align: 'right', sortable: true, width: '130px',
      render: (row) => <AmountDisplay value={row.amount} />,
    },
    {
      key: 'payment_mode', header: 'Mode', width: '120px',
      render: (row) => (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
          {PAYMENT_MODES[row.payment_mode] || row.payment_mode}
        </span>
      ),
    },
    {
      key: 'invoice', header: 'Invoice', width: '140px',
      render: (row) => row.invoice?.invoice_number
        ? <span className="font-mono text-xs text-purple-600">{row.invoice.invoice_number}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      key: 'status', header: 'Status', width: '110px',
      render: (row) => <StatusBadge status={row.status} statusMap={RECEIPT_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payment Receipts"
        subtitle={`${total} receipt${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Receipt', variant: 'primary', onClick: () => navigate('/sales/payments/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by number, customer..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(RECEIPT_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <Select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value)}
          options={Object.entries(PAYMENT_MODES).map(([value, label]) => ({ value, label }))}
          placeholder="All Modes"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={advanceOnly}
            onChange={(e) => setAdvanceOnly(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
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
        onRowClick={(row) => navigate(`/sales/payments/${row.id}`)}
        emptyMessage="No payment receipts found"
        emptyAction={{ label: 'Record your first payment', onClick: () => navigate('/sales/payments/new') }}
      />
    </div>
  );
}