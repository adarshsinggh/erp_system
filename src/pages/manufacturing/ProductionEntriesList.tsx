// src/pages/manufacturing/ProductionEntriesList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { productionEntriesApi, ProductionEntry } from '@/api/modules/production-entries.api';
import { workOrdersApi, WorkOrder } from '@/api/modules/work-orders.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Input, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

export function ProductionEntriesList() {
  const navigate = useNavigate();
  const [data, setData] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [woFilter, setWoFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  // WO search dropdown
  const [woSearch, setWoSearch] = useState('');
  const [woResults, setWoResults] = useState<WorkOrder[]>([]);
  const [showWoDropdown, setShowWoDropdown] = useState(false);
  const [selectedWoNumber, setSelectedWoNumber] = useState('');
  const debouncedWoSearch = useDebounce(woSearch, 300);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/manufacturing/production/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productionEntriesApi.list({
        page, limit,
        search: debouncedSearch || undefined,
        work_order_id: woFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, woFilter, fromDate, toDate]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, woFilter, fromDate, toDate]);

  useEffect(() => {
    if (debouncedWoSearch?.length >= 2)
      workOrdersApi.list({ search: debouncedWoSearch, limit: 10 })
        .then((r) => setWoResults(r.data || [])).catch(() => {});
    else setWoResults([]);
  }, [debouncedWoSearch]);

  const columns: ColumnDef<ProductionEntry>[] = [
    {
      key: 'entry_number', header: 'Entry #', sortable: true, width: '140px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.entry_number}</span>,
    },
    {
      key: 'entry_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.entry_date)}</span>,
    },
    {
      key: 'work_order_number', header: 'Work Order', width: '140px',
      render: (row) => (
        <Link
          to={`/manufacturing/work-orders/${row.work_order_id}`}
          className="font-mono text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.work_order_number}
        </Link>
      ),
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
      key: 'quantity_produced', header: 'Produced', align: 'right', sortable: true, width: '110px',
      render: (row) => (
        <span className="text-sm font-semibold">{row.quantity_produced} {row.uom_symbol}</span>
      ),
    },
    {
      key: 'scrap_quantity', header: 'Scrap', align: 'right', width: '90px',
      render: (row) => row.scrap_quantity > 0
        ? <span className="text-sm text-red-600 font-medium">{row.scrap_quantity}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      key: 'warehouse_name', header: 'Warehouse', width: '140px',
      render: (row) => <span className="text-sm text-gray-700">{row.warehouse_name || '—'}</span>,
    },
    {
      key: 'unit_cost', header: 'Unit Cost', align: 'right', width: '110px',
      render: (row) => <AmountDisplay value={row.unit_cost} />,
    },
    {
      key: 'total_cost', header: 'Total Cost', align: 'right', width: '120px',
      render: (row) => <AmountDisplay value={row.total_cost} />,
    },
    {
      key: 'batch_number', header: 'Batch', width: '110px',
      render: (row) => row.batch_number
        ? <span className="font-mono text-xs">{row.batch_number}</span>
        : <span className="text-gray-400">—</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Production Entries"
        subtitle={`${total} entr${total !== 1 ? 'ies' : 'y'}`}
        actions={[
          { label: 'New Production Entry', variant: 'primary', onClick: () => navigate('/manufacturing/production/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by entry number..." className="w-64" />
        {/* WO filter */}
        <div className="relative">
          <input
            type="text"
            value={selectedWoNumber || woSearch}
            onChange={(e) => { setWoSearch(e.target.value); setSelectedWoNumber(''); setWoFilter(''); setShowWoDropdown(true); }}
            onFocus={() => setShowWoDropdown(true)}
            placeholder="Filter by Work Order..."
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 w-52"
          />
          {selectedWoNumber && (
            <button onClick={() => { setWoFilter(''); setSelectedWoNumber(''); setWoSearch(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
          )}
          {showWoDropdown && woResults.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
              {woResults.map((wo) => (
                <button key={wo.id} type="button"
                  onClick={() => { setWoFilter(wo.id); setSelectedWoNumber(wo.work_order_number); setShowWoDropdown(false); setWoSearch(''); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs border-b border-gray-50 last:border-0">
                  <span className="font-mono font-medium">{wo.work_order_number}</span>
                  <span className="ml-2 text-gray-500">{wo.product_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="!w-36 !h-9 !text-sm" placeholder="From date" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="!w-36 !h-9 !text-sm" placeholder="To date" />
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/manufacturing/production/${row.id}`)}
        emptyMessage="No production entries found"
        emptyAction={{ label: 'Record your first production', onClick: () => navigate('/manufacturing/production/new') }}
      />
    </div>
  );
}