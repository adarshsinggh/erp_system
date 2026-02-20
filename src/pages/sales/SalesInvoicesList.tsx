// src/pages/sales/SalesInvoicesList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { salesInvoicesApi, SalesInvoice } from '@/api/modules/sales-invoices.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { INVOICE_STATUSES } from '@/lib/constants';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

export function SalesInvoicesList() {
  const navigate = useNavigate();
  const [data, setData] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/sales/invoices/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await salesInvoicesApi.list({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        overdue_only: overdueOnly || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, overdueOnly]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, overdueOnly]);

  const columns: ColumnDef<SalesInvoice>[] = [
    {
      key: 'invoice_number', header: 'Invoice #', sortable: true, width: '150px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.invoice_number}</span>,
    },
    {
      key: 'invoice_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.invoice_date)}</span>,
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
      key: 'grand_total', header: 'Total', align: 'right', sortable: true, width: '130px',
      render: (row) => <AmountDisplay value={row.grand_total} />,
    },
    {
      key: 'amount_paid', header: 'Paid', align: 'right', width: '120px',
      render: (row) => <AmountDisplay value={row.amount_paid} />,
    },
    {
      key: 'amount_due', header: 'Due', align: 'right', width: '120px',
      render: (row) => (
        <span className={row.amount_due > 0 ? 'text-red-600 font-medium' : ''}>
          <AmountDisplay value={row.amount_due} />
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', width: '130px',
      render: (row) => <StatusBadge status={row.status} statusMap={INVOICE_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Sales Invoices"
        subtitle={`${total} invoice${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Invoice', variant: 'primary', onClick: () => navigate('/sales/invoices/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by number, customer..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(INVOICE_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Overdue Only
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
        onRowClick={(row) => navigate(`/sales/invoices/${row.id}`)}
        emptyMessage="No invoices found"
        emptyAction={{ label: 'Create your first invoice', onClick: () => navigate('/sales/invoices/new') }}
      />
    </div>
  );
}