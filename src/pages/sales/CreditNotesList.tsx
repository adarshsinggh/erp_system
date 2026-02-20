// src/pages/sales/CreditNotesList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { creditNotesApi, CreditNote } from '@/api/modules/credit-notes.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const CN_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  applied: { label: 'Applied', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

const CN_REASONS: Record<string, string> = {
  return: 'Return',
  pricing_error: 'Pricing Error',
  quality: 'Quality Issue',
  goodwill: 'Goodwill',
};

export function CreditNotesList() {
  const navigate = useNavigate();
  const [data, setData] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/sales/credit-notes/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await creditNotesApi.list({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        reason: reasonFilter || undefined,
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

  const columns: ColumnDef<CreditNote>[] = [
    {
      key: 'credit_note_number', header: 'CN #', sortable: true, width: '150px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.credit_note_number}</span>,
    },
    {
      key: 'credit_note_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.credit_note_date)}</span>,
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
      key: 'invoice', header: 'Invoice', width: '150px',
      render: (row) => row.invoice?.invoice_number
        ? <span className="font-mono text-xs text-purple-600">{row.invoice.invoice_number}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      key: 'reason', header: 'Reason', width: '120px',
      render: (row) => (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
          {CN_REASONS[row.reason] || row.reason}
        </span>
      ),
    },
    {
      key: 'total_amount', header: 'Amount', align: 'right', sortable: true, width: '130px',
      render: (row) => <AmountDisplay value={row.total_amount} />,
    },
    {
      key: 'status', header: 'Status', width: '110px',
      render: (row) => <StatusBadge status={row.status} statusMap={CN_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Credit Notes"
        subtitle={`${total} credit note${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Credit Note', variant: 'primary', onClick: () => navigate('/sales/credit-notes/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by number, customer..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(CN_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <Select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          options={Object.entries(CN_REASONS).map(([value, label]) => ({ value, label }))}
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
        onRowClick={(row) => navigate(`/sales/credit-notes/${row.id}`)}
        emptyMessage="No credit notes found"
        emptyAction={{ label: 'Create your first credit note', onClick: () => navigate('/sales/credit-notes/new') }}
      />
    </div>
  );
}