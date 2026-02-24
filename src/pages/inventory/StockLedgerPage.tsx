// src/pages/inventory/StockLedgerPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { inventoryApi, StockLedgerEntry } from '@/api/modules/inventory.api';
import { settingsApi, Warehouse } from '@/api/modules/settings.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, Input, toast } from '@/components/shared/FormElements';
import { formatDate, formatIndianNumber, truncate } from '@/lib/formatters';
import { useDebounce } from '@/hooks';

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'grn_receipt', label: 'GRN Receipt' },
  { value: 'production_in', label: 'Production In' },
  { value: 'production_out', label: 'Production Out' },
  { value: 'sales_dispatch', label: 'Sales Dispatch' },
  { value: 'transfer_in', label: 'Transfer In' },
  { value: 'transfer_out', label: 'Transfer Out' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'scrap', label: 'Scrap' },
];

const REFERENCE_TYPE_OPTIONS = [
  { value: 'grn', label: 'GRN' },
  { value: 'work_order', label: 'Work Order' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'delivery_challan', label: 'Delivery Challan' },
];

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  grn_receipt: { bg: 'bg-green-100', text: 'text-green-700' },
  production_in: { bg: 'bg-green-100', text: 'text-green-700' },
  production_out: { bg: 'bg-red-100', text: 'text-red-700' },
  sales_dispatch: { bg: 'bg-red-100', text: 'text-red-700' },
  transfer_in: { bg: 'bg-blue-100', text: 'text-blue-700' },
  transfer_out: { bg: 'bg-orange-100', text: 'text-orange-700' },
  adjustment: { bg: 'bg-purple-100', text: 'text-purple-700' },
  scrap: { bg: 'bg-gray-100', text: 'text-gray-700' },
};

const TYPE_LABELS: Record<string, string> = {
  grn_receipt: 'GRN Receipt',
  production_in: 'Production In',
  production_out: 'Production Out',
  sales_dispatch: 'Sales Dispatch',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  adjustment: 'Adjustment',
  scrap: 'Scrap',
};

export function StockLedgerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState<StockLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemSearch, setItemSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState(searchParams.get('warehouse_id') || '');
  const [typeFilter, setTypeFilter] = useState('');
  const [refTypeFilter, setRefTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedItemSearch = useDebounce(itemSearch);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Pre-fill item_id from URL params
  const urlItemId = searchParams.get('item_id') || '';

  useEffect(() => {
    settingsApi.listWarehouses().then((r) => setWarehouses(r.data || [])).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getStockLedger({
        page, limit,
        item_id: urlItemId || undefined,
        search: debouncedItemSearch || undefined,
        warehouse_id: warehouseFilter || undefined,
        transaction_type: typeFilter || undefined,
        reference_type: refTypeFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        sort_by: 'transaction_date',
        sort_order: 'desc',
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedItemSearch, urlItemId, warehouseFilter, typeFilter, refTypeFilter, fromDate, toDate]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedItemSearch, warehouseFilter, typeFilter, refTypeFilter, fromDate, toDate]);

  const columns: ColumnDef<StockLedgerEntry>[] = [
    {
      key: 'transaction_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.transaction_date)}</span>,
    },
    {
      key: 'item', header: 'Item', width: '200px',
      render: (row) => (
        <div>
          <span className="font-mono text-xs font-medium text-brand-700">{row.item_code || (row as any).product_code || '—'}</span>
          <span className="text-sm text-gray-600 ml-1.5">{row.item_name || (row as any).product_name || ''}</span>
        </div>
      ),
    },
    {
      key: 'warehouse_name', header: 'Warehouse', width: '130px',
      render: (row) => <span className="text-sm text-gray-600">{row.warehouse_name}</span>,
    },
    {
      key: 'transaction_type', header: 'Type', width: '130px',
      render: (row) => {
        const c = TYPE_COLORS[row.transaction_type] || { bg: 'bg-gray-100', text: 'text-gray-700' };
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
            {TYPE_LABELS[row.transaction_type] || row.transaction_type}
          </span>
        );
      },
    },
    {
      key: 'direction', header: 'Dir', width: '60px',
      render: (row) => (
        <span className={`text-sm font-semibold ${row.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
          {row.direction === 'in' ? '↑ IN' : '↓ OUT'}
        </span>
      ),
    },
    {
      key: 'quantity', header: 'Qty', align: 'right', width: '90px',
      render: (row) => (
        <span className={`text-sm font-bold ${row.direction === 'in' ? 'text-green-700' : 'text-red-700'}`}>
          {row.direction === 'in' ? '+' : '-'}{formatIndianNumber(row.quantity, 2)}
        </span>
      ),
    },
    {
      key: 'unit_cost', header: 'Unit Cost', align: 'right', width: '100px',
      render: (row) => <AmountDisplay value={row.unit_cost} compact />,
    },
    {
      key: 'running_balance', header: 'Balance', align: 'right', width: '100px',
      render: (row) => <span className="text-sm font-bold text-gray-900">{formatIndianNumber(row.running_balance, 2)}</span>,
    },
    {
      key: 'reference_number', header: 'Reference #', width: '130px',
      render: (row) => (
        <span className="font-mono text-xs text-brand-600 cursor-pointer hover:underline">{row.reference_number || '—'}</span>
      ),
    },
    {
      key: 'narration', header: 'Narration', width: '160px',
      render: (row) => (
        <span className="text-xs text-gray-500" title={row.narration || ''}>
          {truncate(row.narration, 35)}
        </span>
      ),
    },
    {
      key: 'batch_number', header: 'Batch', width: '100px',
      render: (row) => row.batch_number ? <span className="font-mono text-xs text-gray-500">{row.batch_number}</span> : <span className="text-gray-300">—</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Ledger"
        subtitle="Append-only transaction log for all inventory movements"
        actions={[
          { label: '← Stock Summary', variant: 'secondary', onClick: () => navigate('/inventory/stock') },
        ]}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {!urlItemId && (
          <SearchInput value={itemSearch} onChange={setItemSearch} placeholder="Search item..." className="w-56" />
        )}
        {urlItemId && (
          <div className="px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200 text-sm text-brand-700 flex items-center gap-2">
            Filtered by item
            <button onClick={() => navigate('/inventory/stock/ledger')} className="text-brand-500 hover:text-brand-700 text-xs font-medium">✕ Clear</button>
          </div>
        )}
        <Select
          value={warehouseFilter}
          onChange={(e) => setWarehouseFilter(e.target.value)}
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
          placeholder="All Warehouses"
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={TRANSACTION_TYPE_OPTIONS}
          placeholder="All Types"
        />
        <Select
          value={refTypeFilter}
          onChange={(e) => setRefTypeFilter(e.target.value)}
          options={REFERENCE_TYPE_OPTIONS}
          placeholder="All Ref Types"
        />
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="!w-36" placeholder="From" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="!w-36" placeholder="To" />
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        emptyMessage="No ledger entries found"
      />
    </div>
  );
}