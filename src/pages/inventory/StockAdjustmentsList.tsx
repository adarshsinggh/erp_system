// src/pages/inventory/StockAdjustmentsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { stockAdjustmentsApi, StockAdjustment } from '@/api/modules/stock-adjustments.api';
import { settingsApi, Warehouse } from '@/api/modules/settings.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import type { StatusConfig } from '@/lib/constants';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

const ADJUSTMENT_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  posted: { label: 'Posted', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

const REASON_OPTIONS = [
  { value: 'physical_count', label: 'Physical Count' },
  { value: 'damage', label: 'Damage' },
  { value: 'theft', label: 'Theft' },
  { value: 'correction', label: 'Correction' },
  { value: 'opening_stock', label: 'Opening Stock' },
];

const REASON_COLORS: Record<string, string> = {
  physical_count: 'bg-blue-100 text-blue-700',
  damage: 'bg-orange-100 text-orange-700',
  theft: 'bg-red-100 text-red-700',
  correction: 'bg-gray-100 text-gray-700',
  opening_stock: 'bg-green-100 text-green-700',
};

const REASON_LABELS: Record<string, string> = {
  physical_count: 'Physical Count',
  damage: 'Damage',
  theft: 'Theft',
  correction: 'Correction',
  opening_stock: 'Opening Stock',
};

export function StockAdjustmentsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/inventory/adjustments/new'),
  });

  useEffect(() => {
    settingsApi.listWarehouses().then((r) => setWarehouses(r.data || [])).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await stockAdjustmentsApi.list({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        reason: reasonFilter || undefined,
        warehouse_id: warehouseFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, reasonFilter, warehouseFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, reasonFilter, warehouseFilter]);

  const columns: ColumnDef<StockAdjustment>[] = [
    {
      key: 'adjustment_number', header: 'Adjustment #', sortable: true, width: '160px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.adjustment_number}</span>,
    },
    {
      key: 'adjustment_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.adjustment_date)}</span>,
    },
    {
      key: 'warehouse_name', header: 'Warehouse', width: '150px',
      render: (row) => <span className="text-sm text-gray-700">{row.warehouse_name || '—'}</span>,
    },
    {
      key: 'reason', header: 'Reason', width: '130px',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${REASON_COLORS[row.reason] || 'bg-gray-100 text-gray-700'}`}>
          {REASON_LABELS[row.reason] || row.reason}
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', width: '120px',
      render: (row) => <StatusBadge status={row.status} statusMap={ADJUSTMENT_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        subtitle={`${total} adjustment${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Adjustment', variant: 'primary', onClick: () => navigate('/inventory/adjustments/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by number..." className="w-72" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(ADJUSTMENT_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <Select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          options={REASON_OPTIONS}
          placeholder="All Reasons"
        />
        <Select
          value={warehouseFilter}
          onChange={(e) => setWarehouseFilter(e.target.value)}
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          placeholder="All Warehouses"
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
        onRowClick={(row) => navigate(`/inventory/adjustments/${row.id}`)}
        emptyMessage="No stock adjustments found"
        emptyAction={{ label: 'Create your first adjustment', onClick: () => navigate('/inventory/adjustments/new') }}
      />
    </div>
  );
}