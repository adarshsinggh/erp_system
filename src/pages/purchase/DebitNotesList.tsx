// src/pages/purchase/DebitNotesList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { debitNotesApi, DebitNote } from '@/api/modules/debit-notes.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const DN_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  applied: { label: 'Applied', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

const REASON_OPTIONS = [
  { value: 'return', label: 'Return' },
  { value: 'pricing_error', label: 'Pricing Error' },
  { value: 'quality', label: 'Quality Issue' },
  { value: 'shortage', label: 'Shortage' },
];

const REASON_LABELS: Record<string, string> = {
  return: 'Return',
  pricing_error: 'Pricing Error',
  quality: 'Quality Issue',
  shortage: 'Shortage',
};

export function DebitNotesList() {
  const navigate = useNavigate();
  const [data, setData] = useState<DebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/purchase/debit-notes/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await debitNotesApi.list({
        page, limit, search: debouncedSearch || undefined,
        status: statusFilter || undefined, reason: reasonFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, reasonFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, reasonFilter]);

  const columns: ColumnDef<DebitNote>[] = [
    {
      key: 'debit_note_number', header: 'DN #', sortable: true, width: '140px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.debit_note_number}</span>,
    },
    {
      key: 'debit_note_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.debit_note_date)}</span>,
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
      key: 'vendor_bill', header: 'Linked Bill', width: '130px',
      render: (row) => row.vendor_bill?.bill_number
        ? <span className="font-mono text-xs text-purple-600">{row.vendor_bill.bill_number}</span>
        : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      key: 'reason', header: 'Reason', width: '120px',
      render: (row) => <span className="text-xs text-gray-600">{REASON_LABELS[row.reason] || row.reason}</span>,
    },
    {
      key: 'grand_total', header: 'Amount', align: 'right', sortable: true, width: '120px',
      render: (row) => <AmountDisplay value={row.grand_total} />,
    },
    {
      key: 'status', header: 'Status', width: '110px',
      render: (row) => <StatusBadge status={row.status} statusMap={DN_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Debit Notes"
        subtitle={`${total} note${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Debit Note', variant: 'primary', onClick: () => navigate('/purchase/debit-notes/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by DN number, vendor..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(DN_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <Select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          options={REASON_OPTIONS}
          placeholder="All Reasons"
        />
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/purchase/debit-notes/${row.id}`)}
        emptyMessage="No debit notes found"
        emptyAction={{ label: 'Create your first debit note', onClick: () => navigate('/purchase/debit-notes/new') }}
      />
    </div>
  );
}