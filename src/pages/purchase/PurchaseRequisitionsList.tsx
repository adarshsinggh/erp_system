// src/pages/purchase/PurchaseRequisitionsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseRequisitionsApi, PurchaseRequisition } from '@/api/modules/purchase-requisitions.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast } from '@/components/shared/FormElements';
import { PRIORITY_CONFIG } from '@/lib/constants';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const PR_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  submitted: { label: 'Submitted', color: 'blue' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  converted: { label: 'Converted', color: 'purple' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-gray-100 text-gray-700',
  auto_reorder: 'bg-purple-100 text-purple-700',
  work_order: 'bg-blue-100 text-blue-700',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  auto_reorder: 'Auto Reorder',
  work_order: 'Work Order',
};

export function PurchaseRequisitionsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/purchase/requisitions/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await purchaseRequisitionsApi.list({
        page, limit, search: debouncedSearch || undefined,
        status: statusFilter || undefined, priority: priorityFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, priorityFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, priorityFilter]);

  const columns: ColumnDef<PurchaseRequisition>[] = [
    {
      key: 'requisition_number', header: 'Requisition #', sortable: true, width: '160px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.requisition_number}</span>,
    },
    {
      key: 'requisition_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.requisition_date)}</span>,
    },
    {
      key: 'required_by_date', header: 'Required By', width: '110px',
      render: (row) => <span className="text-sm">{row.required_by_date ? formatDate(row.required_by_date) : '—'}</span>,
    },
    {
      key: 'priority', header: 'Priority', width: '100px',
      render: (row) => <StatusBadge status={row.priority} statusMap={PRIORITY_CONFIG} />,
    },
    {
      key: 'source', header: 'Source', width: '120px',
      render: (row) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${SOURCE_COLORS[row.source] || 'bg-gray-100 text-gray-700'}`}>
          {SOURCE_LABELS[row.source] || row.source}
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', width: '120px',
      render: (row) => <StatusBadge status={row.status} statusMap={PR_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Requisitions"
        subtitle={`${total} requisition${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Requisition', variant: 'primary', onClick: () => navigate('/purchase/requisitions/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by number, purpose..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(PR_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          options={Object.entries(PRIORITY_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Priorities"
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
        onRowClick={(row) => navigate(`/purchase/requisitions/${row.id}`)}
        emptyMessage="No purchase requisitions found"
        emptyAction={{ label: 'Create your first requisition', onClick: () => navigate('/purchase/requisitions/new') }}
      />
    </div>
  );
}