// src/pages/sales/SalesOrdersList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { salesOrdersApi, SalesOrder } from '@/api/modules/sales-orders.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { SALES_ORDER_STATUSES } from '@/lib/constants';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

export function SalesOrdersList() {
  const navigate = useNavigate();
  const [data, setData] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/sales/orders/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await salesOrdersApi.list({
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

  const columns: ColumnDef<SalesOrder>[] = [
    {
      key: 'order_number', header: 'Order #', sortable: true, width: '150px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.order_number}</span>,
    },
    {
      key: 'order_date', header: 'Date', sortable: true, width: '120px',
      render: (row) => <span className="text-sm">{formatDate(row.order_date)}</span>,
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
      key: 'grand_total', header: 'Amount', align: 'right', sortable: true, width: '140px',
      render: (row) => <AmountDisplay value={row.grand_total} />,
    },
    {
      key: 'expected_delivery_date', header: 'Delivery Date', width: '120px',
      render: (row) => <span className="text-sm">{formatDate(row.expected_delivery_date)}</span>,
    },
    {
      key: 'status', header: 'Status', width: '120px',
      render: (row) => <StatusBadge status={row.status} statusMap={SALES_ORDER_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        subtitle={`${total} order${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Order', variant: 'primary', onClick: () => navigate('/sales/orders/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by number, customer, PO..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(SALES_ORDER_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
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
        onRowClick={(row) => navigate(`/sales/orders/${row.id}`)}
        emptyMessage="No sales orders found"
        emptyAction={{ label: 'Create your first order', onClick: () => navigate('/sales/orders/new') }}
      />
    </div>
  );
}