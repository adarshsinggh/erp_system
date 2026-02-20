// src/pages/purchase/PurchaseOrdersList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { purchaseOrdersApi, PurchaseOrder } from '@/api/modules/purchase-orders.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { PURCHASE_ORDER_STATUSES } from '@/lib/constants';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

export function PurchaseOrdersList() {
  const navigate = useNavigate();
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/purchase/orders/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await purchaseOrdersApi.list({
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

  const columns: ColumnDef<PurchaseOrder>[] = [
    {
      key: 'po_number', header: 'PO #', sortable: true, width: '140px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.po_number}</span>,
    },
    {
      key: 'po_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.po_date)}</span>,
    },
    {
      key: 'vendor', header: 'Vendor',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900 text-sm">{row.vendor?.name || '—'}</div>
          {row.vendor?.vendor_code && (
            <div className="text-xs text-gray-500">{row.vendor.vendor_code}</div>
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
      render: (row) => <span className="text-sm">{row.expected_delivery_date ? formatDate(row.expected_delivery_date) : '—'}</span>,
    },
    {
      key: 'status', header: 'Status', width: '140px',
      render: (row) => <StatusBadge status={row.status} statusMap={PURCHASE_ORDER_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle={`${total} order${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New PO', variant: 'primary', onClick: () => navigate('/purchase/orders/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by PO number, vendor..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(PURCHASE_ORDER_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
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
        onRowClick={(row) => navigate(`/purchase/orders/${row.id}`)}
        emptyMessage="No purchase orders found"
        emptyAction={{ label: 'Create your first PO', onClick: () => navigate('/purchase/orders/new') }}
      />
    </div>
  );
}