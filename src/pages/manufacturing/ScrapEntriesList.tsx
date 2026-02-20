// src/pages/manufacturing/ScrapEntriesList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { scrapEntriesApi, ScrapEntry } from '@/api/modules/scrap-entries.api';
import { workOrdersApi, WorkOrder } from '@/api/modules/work-orders.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const SCRAP_REASONS: Record<string, StatusConfig> = {
  defective: { label: 'Defective', color: 'red' },
  damaged: { label: 'Damaged', color: 'orange' },
  expired: { label: 'Expired', color: 'yellow' },
  process_waste: { label: 'Process Waste', color: 'gray' },
};

const DISPOSAL_METHODS: Record<string, StatusConfig> = {
  sell: { label: 'Sell', color: 'green' },
  recycle: { label: 'Recycle', color: 'blue' },
  discard: { label: 'Discard', color: 'gray' },
};

const SCRAP_STATUSES: Record<string, StatusConfig> = {
  recorded: { label: 'Recorded', color: 'blue' },
  disposed: { label: 'Disposed', color: 'green' },
};

export function ScrapEntriesList() {
  const navigate = useNavigate();
  const [data, setData] = useState<ScrapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [disposalFilter, setDisposalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [woFilter, setWoFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  // WO search
  const [woSearch, setWoSearch] = useState('');
  const [woResults, setWoResults] = useState<WorkOrder[]>([]);
  const [showWoDropdown, setShowWoDropdown] = useState(false);
  const [selectedWoNumber, setSelectedWoNumber] = useState('');
  const debouncedWoSearch = useDebounce(woSearch, 300);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/manufacturing/scrap/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await scrapEntriesApi.list({
        page, limit,
        search: debouncedSearch || undefined,
        scrap_reason: reasonFilter || undefined,
        disposal_method: disposalFilter || undefined,
        status: statusFilter || undefined,
        work_order_id: woFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, reasonFilter, disposalFilter, statusFilter, woFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, reasonFilter, disposalFilter, statusFilter, woFilter]);

  useEffect(() => {
    if (debouncedWoSearch?.length >= 2)
      workOrdersApi.list({ search: debouncedWoSearch, limit: 10 })
        .then((r) => setWoResults(r.data || [])).catch(() => {});
    else setWoResults([]);
  }, [debouncedWoSearch]);

  const columns: ColumnDef<ScrapEntry>[] = [
    {
      key: 'scrap_number', header: 'Scrap #', sortable: true, width: '140px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.scrap_number}</span>,
    },
    {
      key: 'scrap_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.scrap_date)}</span>,
    },
    {
      key: 'component', header: 'Item / Product',
      render: (row) => {
        const code = row.item_id ? row.item_code : row.product_code;
        const name = row.item_id ? row.item_name : row.product_name;
        return (
          <div>
            <div className="font-medium text-gray-900 text-sm">{name || '—'}</div>
            {code && <div className="text-xs text-gray-500 font-mono">{code}</div>}
          </div>
        );
      },
    },
    {
      key: 'work_order_number', header: 'Work Order', width: '130px',
      render: (row) => row.work_order_number
        ? <span className="font-mono text-xs text-gray-600">{row.work_order_number}</span>
        : <span className="text-gray-400">—</span>,
    },
    {
      key: 'quantity', header: 'Quantity', align: 'right', width: '100px',
      render: (row) => <span className="text-sm">{row.quantity} {row.uom_symbol}</span>,
    },
    {
      key: 'scrap_reason', header: 'Reason', width: '120px',
      render: (row) => <StatusBadge status={row.scrap_reason} statusMap={SCRAP_REASONS} />,
    },
    {
      key: 'scrap_value', header: 'Value', align: 'right', width: '110px',
      render: (row) => <AmountDisplay value={row.scrap_value} />,
    },
    {
      key: 'disposal_method', header: 'Disposal', width: '100px',
      render: (row) => row.disposal_method
        ? <StatusBadge status={row.disposal_method} statusMap={DISPOSAL_METHODS} />
        : <span className="text-xs text-yellow-600 font-medium">Pending</span>,
    },
    {
      key: 'status', header: 'Status', width: '100px',
      render: (row) => <StatusBadge status={row.status} statusMap={SCRAP_STATUSES} />,
    },
    {
      key: 'warehouse_name', header: 'Warehouse', width: '130px',
      render: (row) => <span className="text-sm text-gray-700">{row.warehouse_name || '—'}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Scrap Entries"
        subtitle={`${total} entr${total !== 1 ? 'ies' : 'y'}`}
        actions={[
          { label: 'New Scrap Entry', variant: 'primary', onClick: () => navigate('/manufacturing/scrap/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by scrap number..." className="w-64" />
        <Select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}
          options={Object.entries(SCRAP_REASONS).map(([v, c]) => ({ value: v, label: c.label }))}
          placeholder="All Reasons" />
        <Select value={disposalFilter} onChange={(e) => setDisposalFilter(e.target.value)}
          options={Object.entries(DISPOSAL_METHODS).map(([v, c]) => ({ value: v, label: c.label }))}
          placeholder="All Disposal" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(SCRAP_STATUSES).map(([v, c]) => ({ value: v, label: c.label }))}
          placeholder="All Statuses" />
        {/* WO filter */}
        <div className="relative">
          <input type="text"
            value={selectedWoNumber || woSearch}
            onChange={(e) => { setWoSearch(e.target.value); setSelectedWoNumber(''); setWoFilter(''); setShowWoDropdown(true); }}
            onFocus={() => setShowWoDropdown(true)}
            placeholder="Filter by WO..."
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 w-44"
          />
          {selectedWoNumber && (
            <button onClick={() => { setWoFilter(''); setSelectedWoNumber(''); setWoSearch(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
          )}
          {showWoDropdown && woResults.length > 0 && (
            <div className="absolute z-20 top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto w-64">
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
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/manufacturing/scrap/${row.id}`)}
        emptyMessage="No scrap entries found"
        emptyAction={{ label: 'Record scrap entry', onClick: () => navigate('/manufacturing/scrap/new') }}
      />
    </div>
  );
}