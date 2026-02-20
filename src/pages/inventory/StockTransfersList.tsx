// src/pages/inventory/StockTransfersList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { stockTransfersApi, StockTransfer } from '@/api/modules/stock-transfers.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { TRANSFER_STATUSES } from '@/lib/constants';
import type { StatusConfig } from '@/lib/constants';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

const EXTENDED_TRANSFER_STATUSES: Record<string, StatusConfig> = {
  ...TRANSFER_STATUSES,
  partially_received: { label: 'Partially Received', color: 'orange' },
};

const TRANSFER_TYPE_OPTIONS = [
  { value: 'inter_warehouse', label: 'Inter-Warehouse' },
  { value: 'inter_branch', label: 'Inter-Branch' },
];

const TRANSFER_TYPE_COLORS: Record<string, string> = {
  inter_warehouse: 'bg-blue-100 text-blue-700',
  inter_branch: 'bg-purple-100 text-purple-700',
};

export function StockTransfersList() {
  const navigate = useNavigate();
  const [data, setData] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/inventory/transfers/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await stockTransfersApi.list({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        transfer_type: typeFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, typeFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, typeFilter]);

  const columns: ColumnDef<StockTransfer>[] = [
    {
      key: 'transfer_number', header: 'Transfer #', sortable: true, width: '150px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.transfer_number}</span>,
    },
    {
      key: 'transfer_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.transfer_date)}</span>,
    },
    {
      key: 'transfer_type', header: 'Type', width: '130px',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TRANSFER_TYPE_COLORS[row.transfer_type] || 'bg-gray-100 text-gray-700'}`}>
          {row.transfer_type === 'inter_warehouse' ? 'Inter-Warehouse' : 'Inter-Branch'}
        </span>
      ),
    },
    {
      key: 'route', header: 'From → To',
      render: (row) => (
        <div className="text-sm">
          <span className="text-gray-700">{row.from_warehouse_name || '—'}</span>
          <span className="mx-1.5 text-gray-400">→</span>
          <span className="text-gray-700">{row.to_warehouse_name || '—'}</span>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status', width: '140px',
      render: (row) => <StatusBadge status={row.status} statusMap={EXTENDED_TRANSFER_STATUSES} />,
    },
    {
      key: 'dispatched_at', header: 'Dispatched', width: '110px',
      render: (row) => <span className="text-sm text-gray-500">{formatDate(row.dispatched_at)}</span>,
    },
    {
      key: 'received_at', header: 'Received', width: '110px',
      render: (row) => <span className="text-sm text-gray-500">{formatDate(row.received_at)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Transfers"
        subtitle={`${total} transfer${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Transfer', variant: 'primary', onClick: () => navigate('/inventory/transfers/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by transfer number..." className="w-72" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(EXTENDED_TRANSFER_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={TRANSFER_TYPE_OPTIONS}
          placeholder="All Types"
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
        onRowClick={(row) => navigate(`/inventory/transfers/${row.id}`)}
        emptyMessage="No stock transfers found"
        emptyAction={{ label: 'Create your first transfer', onClick: () => navigate('/inventory/transfers/new') }}
      />
    </div>
  );
}