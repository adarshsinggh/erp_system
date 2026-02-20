// src/pages/sales/DeliveryChallansList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { deliveryChallansApi, DeliveryChallan } from '@/api/modules/delivery-challans.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const CHALLAN_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  dispatched: { label: 'Dispatched', color: 'blue' },
  in_transit: { label: 'In Transit', color: 'purple' },
  delivered: { label: 'Delivered', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export function DeliveryChallansList() {
  const navigate = useNavigate();
  const [data, setData] = useState<DeliveryChallan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/sales/challans/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await deliveryChallansApi.list({
        page, limit, search: debouncedSearch || undefined, status: statusFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const columns: ColumnDef<DeliveryChallan>[] = [
    {
      key: 'challan_number', header: 'Challan #', sortable: true, width: '150px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.challan_number}</span>,
    },
    {
      key: 'challan_date', header: 'Date', sortable: true, width: '120px',
      render: (row) => <span className="text-sm">{formatDate(row.challan_date)}</span>,
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
      key: 'sales_order', header: 'Sales Order', width: '150px',
      render: (row) => row.sales_order?.order_number
        ? <span className="font-mono text-xs text-purple-600">{row.sales_order.order_number}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      key: 'vehicle_number', header: 'Vehicle', width: '120px',
      render: (row) => row.vehicle_number
        ? <span className="font-mono text-xs">{row.vehicle_number}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      key: 'status', header: 'Status', width: '120px',
      render: (row) => <StatusBadge status={row.status} statusMap={CHALLAN_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Delivery Challans"
        subtitle={`${total} challan${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Challan', variant: 'primary', onClick: () => navigate('/sales/challans/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by number, customer, vehicle..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(CHALLAN_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
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
        onRowClick={(row) => navigate(`/sales/challans/${row.id}`)}
        emptyMessage="No delivery challans found"
        emptyAction={{ label: 'Create your first challan', onClick: () => navigate('/sales/challans/new') }}
      />
    </div>
  );
}