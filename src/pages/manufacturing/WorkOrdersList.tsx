// src/pages/manufacturing/WorkOrdersList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { workOrdersApi, WorkOrder } from '@/api/modules/work-orders.api';
import { productsApi, Product } from '@/api/modules/products.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { PRIORITY_CONFIG } from '@/lib/constants';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const WORK_ORDER_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  material_issued: { label: 'Material Issued', color: 'purple' },
  in_progress: { label: 'In Progress', color: 'orange' },
  completed: { label: 'Completed', color: 'green' },
  closed: { label: 'Closed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export function WorkOrdersList() {
  const navigate = useNavigate();
  const [data, setData] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  // Product search dropdown
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState('');
  const debouncedProductSearch = useDebounce(productSearch, 300);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/manufacturing/work-orders/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workOrdersApi.list({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        product_id: productFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, priorityFilter, productFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, priorityFilter, productFilter]);

  useEffect(() => {
    if (debouncedProductSearch?.length >= 2)
      productsApi.list({ search: debouncedProductSearch, limit: 10, status: 'active' })
        .then((r) => setProductResults(r.data || [])).catch(() => {});
    else setProductResults([]);
  }, [debouncedProductSearch]);

  function getProgressColor(completed: number, planned: number): string {
    if (planned === 0) return 'bg-gray-300';
    const pct = (completed / planned) * 100;
    if (pct >= 100) return 'bg-green-500';
    if (pct > 0) return 'bg-blue-500';
    return 'bg-gray-300';
  }

  const columns: ColumnDef<WorkOrder>[] = [
    {
      key: 'work_order_number', header: 'WO #', sortable: true, width: '140px',
      render: (row) => (
        <span className="font-mono text-xs font-medium text-brand-700">{row.work_order_number}</span>
      ),
    },
    {
      key: 'work_order_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.work_order_date)}</span>,
    },
    {
      key: 'product', header: 'Product',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900 text-sm">{row.product_name}</div>
          <div className="text-xs text-gray-500 font-mono">{row.product_code}</div>
        </div>
      ),
    },
    {
      key: 'planned_quantity', header: 'Planned Qty', align: 'right', width: '110px',
      render: (row) => (
        <span className="text-sm">{row.planned_quantity} {row.uom_symbol}</span>
      ),
    },
    {
      key: 'progress', header: 'Progress', width: '150px',
      render: (row) => {
        const pct = row.planned_quantity > 0 ? Math.min((row.completed_quantity / row.planned_quantity) * 100, 100) : 0;
        return (
          <div>
            <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
              <div
                className={`h-2 rounded-full transition-all ${getProgressColor(row.completed_quantity, row.planned_quantity)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">
              {row.completed_quantity} / {row.planned_quantity}
            </span>
          </div>
        );
      },
    },
    {
      key: 'priority', header: 'Priority', width: '100px',
      render: (row) => <StatusBadge status={row.priority} statusMap={PRIORITY_CONFIG} />,
    },
    {
      key: 'planned_cost', header: 'Planned Cost', align: 'right', width: '130px',
      render: (row) => <AmountDisplay value={row.planned_cost} />,
    },
    {
      key: 'actual_cost', header: 'Actual Cost', align: 'right', width: '130px',
      render: (row) => row.actual_cost != null ? <AmountDisplay value={row.actual_cost} /> : <span className="text-gray-400">—</span>,
    },
    {
      key: 'status', header: 'Status', width: '140px',
      render: (row) => <StatusBadge status={row.status} statusMap={WORK_ORDER_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Work Orders"
        subtitle={`${total} work order${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Work Order', variant: 'primary', onClick: () => navigate('/manufacturing/work-orders/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by WO number..." className="w-72" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(WORK_ORDER_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          options={Object.entries(PRIORITY_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Priorities"
        />
        {/* Product filter with search dropdown */}
        <div className="relative">
          <input
            type="text"
            value={selectedProductName || productSearch}
            onChange={(e) => {
              setProductSearch(e.target.value);
              setSelectedProductName('');
              setProductFilter('');
              setShowProductDropdown(true);
            }}
            onFocus={() => setShowProductDropdown(true)}
            placeholder="Filter by product..."
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 w-52"
          />
          {selectedProductName && (
            <button
              onClick={() => { setProductFilter(''); setSelectedProductName(''); setProductSearch(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >×</button>
          )}
          {showProductDropdown && productResults.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
              {productResults.map((p) => (
                <button key={p.id} type="button"
                  onClick={() => {
                    setProductFilter(p.id);
                    setSelectedProductName(p.name);
                    setShowProductDropdown(false);
                    setProductSearch('');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs border-b border-gray-50 last:border-0">
                  <span className="font-mono font-medium">{p.product_code}</span>
                  <span className="ml-2 text-gray-700">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/manufacturing/work-orders/${row.id}`)}
        emptyMessage="No work orders found"
        emptyAction={{ label: 'Create your first Work Order', onClick: () => navigate('/manufacturing/work-orders/new') }}
      />
    </div>
  );
}