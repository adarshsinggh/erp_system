// src/pages/inventory/StockSummaryPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryApi, StockSummaryItem } from '@/api/modules/inventory.api';
import { settingsApi, Branch, Warehouse } from '@/api/modules/settings.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { formatIndianNumber } from '@/lib/formatters';
import { useDebounce } from '@/hooks';

interface SummaryCard {
  label: string;
  value: string | number;
  color: string;
  subtext?: string;
}

export function StockSummaryPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<StockSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [belowMinimum, setBelowMinimum] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Summary stats
  const [totalItems, setTotalItems] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [belowMinCount, setBelowMinCount] = useState(0);
  const [zeroStockCount, setZeroStockCount] = useState(0);

  useEffect(() => {
    settingsApi.listBranches().then((r) => setBranches(r.data || [])).catch(() => {});
    settingsApi.listWarehouses().then((r) => setWarehouses(r.data || [])).catch(() => {});
  }, []);

  const filteredWarehouses = branchFilter
    ? warehouses.filter((w) => w.branch_id === branchFilter)
    : warehouses;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getStockSummary({
        page, limit,
        search: debouncedSearch || undefined,
        branch_id: branchFilter || undefined,
        warehouse_id: warehouseFilter || undefined,
        below_minimum: belowMinimum || undefined,
      });
      const items = res.data || [];
      setData(items);
      setTotal(res.total || 0);

      // Compute summary stats from full dataset (first page gives approximation)
      let valSum = 0, belowCount = 0, zeroCount = 0, inStockCount = 0;
      for (const item of items) {
        valSum += item.total_value || 0;
        if (item.is_below_minimum) belowCount++;
        if ((item.available_quantity || 0) <= 0) zeroCount++;
        if ((item.available_quantity || 0) > 0) inStockCount++;
      }
      setTotalItems(res.total || 0);
      setTotalValue(valSum);
      setBelowMinCount(belowCount);
      setZeroStockCount(zeroCount);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, branchFilter, warehouseFilter, belowMinimum]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, branchFilter, warehouseFilter, belowMinimum]);

  // Reset warehouse filter when branch changes
  useEffect(() => {
    if (branchFilter && warehouseFilter) {
      const wh = warehouses.find((w) => w.id === warehouseFilter);
      if (wh && wh.branch_id !== branchFilter) setWarehouseFilter('');
    }
  }, [branchFilter]);

  const summaryCards: SummaryCard[] = [
    { label: 'Total Items', value: formatIndianNumber(totalItems, 0), color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { label: 'Total Stock Value', value: `₹${formatIndianNumber(totalValue)}`, color: 'bg-green-50 border-green-200 text-green-700' },
    { label: 'Below Minimum', value: belowMinCount, color: belowMinCount > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-500' },
    { label: 'Zero Stock', value: zeroStockCount, color: zeroStockCount > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-gray-50 border-gray-200 text-gray-500' },
  ];

  const columns: ColumnDef<StockSummaryItem>[] = [
    {
      key: 'item_code', header: 'Item Code', sortable: true, width: '120px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.item_code}</span>,
    },
    {
      key: 'item_name', header: 'Item Name', sortable: true,
      render: (row) => <span className="text-sm font-medium text-gray-900">{row.item_name}</span>,
    },
    {
      key: 'warehouse_name', header: 'Warehouse', width: '150px',
      render: (row) => <span className="text-sm text-gray-600">{row.warehouse_name}</span>,
    },
    {
      key: 'available_quantity', header: 'Available', align: 'right', sortable: true, width: '100px',
      render: (row) => <span className="text-sm font-semibold text-gray-900">{formatIndianNumber(row.available_quantity, 2)}</span>,
    },
    {
      key: 'reserved_quantity', header: 'Reserved', align: 'right', width: '90px',
      render: (row) => <span className="text-sm text-gray-400">{formatIndianNumber(row.reserved_quantity, 2)}</span>,
    },
    {
      key: 'on_order_quantity', header: 'On Order', align: 'right', width: '90px',
      render: (row) => <span className="text-sm text-blue-600">{formatIndianNumber(row.on_order_quantity, 2)}</span>,
    },
    {
      key: 'free_quantity', header: 'Free Qty', align: 'right', width: '90px',
      render: (row) => (
        <span className={`text-sm font-medium ${(row.free_quantity || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatIndianNumber(row.free_quantity, 2)}
        </span>
      ),
    },
    {
      key: 'weighted_avg_cost', header: 'Avg Cost', align: 'right', width: '110px',
      render: (row) => <AmountDisplay value={row.weighted_avg_cost} compact />,
    },
    {
      key: 'total_value', header: 'Total Value', align: 'right', sortable: true, width: '130px',
      render: (row) => <AmountDisplay value={row.total_value} />,
    },
    {
      key: 'status_indicator', header: '', width: '40px',
      render: (row) => {
        if (row.is_below_minimum) {
          return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Below minimum stock" />;
        }
        if (row.min_stock_threshold > 0 && row.available_quantity < row.min_stock_threshold * 1.5) {
          return <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-400" title="Near minimum stock" />;
        }
        return null;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Summary"
        subtitle="Real-time inventory overview across all warehouses"
        actions={[
          { label: 'Stock Ledger', variant: 'secondary', onClick: () => navigate('/inventory/stock/ledger') },
        ]}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
            <div className="text-xs font-medium opacity-70 mb-1">{card.label}</div>
            <div className="text-xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by item name or code..." className="w-72" />
        <Select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
          placeholder="All Branches"
        />
        <Select
          value={warehouseFilter}
          onChange={(e) => setWarehouseFilter(e.target.value)}
          options={filteredWarehouses.map((w) => ({ value: w.id, label: w.name }))}
          placeholder="All Warehouses"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={belowMinimum}
            onChange={(e) => setBelowMinimum(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Below Minimum Only
        </label>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/inventory/stock/ledger?item_id=${row.item_id}&warehouse_id=${row.warehouse_id}`)}
        emptyMessage="No stock data found"
      />
    </div>
  );
}