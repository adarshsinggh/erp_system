// src/pages/settings/WarehousesList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi, Warehouse, Branch } from '@/api/modules/settings.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast } from '@/components/shared/FormElements';
import { ENTITY_STATUSES } from '@/lib/constants';
import { usePagination, useKeyboardShortcuts, useDebounce } from '@/hooks';

const warehouseTypeMap: Record<string, { label: string; color: 'blue' | 'green' | 'purple' | 'orange' }> = {
  main: { label: 'Main', color: 'blue' },
  raw_material: { label: 'Raw Material', color: 'purple' },
  finished_goods: { label: 'Finished Goods', color: 'green' },
  scrap: { label: 'Scrap', color: 'orange' },
};

export function WarehousesList() {
  const navigate = useNavigate();
  const { page, limit, search, sortBy, sortOrder, setPage, setSearch, toggleSort } = usePagination();
  const [data, setData] = useState<Warehouse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    settingsApi.listBranches().then((res) => setBranches(res.data || []));
  }, []);

  useEffect(() => {
    loadData();
  }, [page, limit, sortBy, sortOrder, debouncedSearch, branchFilter]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await settingsApi.listWarehouses(branchFilter || undefined);
      let filtered = res.data || [];
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        filtered = filtered.filter(
          (w) =>
            w.name.toLowerCase().includes(q) ||
            w.code.toLowerCase().includes(q) ||
            (w.branch_name || '').toLowerCase().includes(q)
        );
      }
      if (sortBy) {
        filtered.sort((a, b) => {
          const aVal = String((a as any)[sortBy] || '');
          const bVal = String((b as any)[sortBy] || '');
          return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
      }
      setTotal(filtered.length);
      setData(filtered.slice((page - 1) * limit, page * limit));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/settings/warehouses/new'),
  });

  const columns: ColumnDef<Warehouse>[] = [
    { key: 'name', header: 'Warehouse Name', sortable: true, render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="font-mono text-xs text-gray-600">{row.code}</span> },
    { key: 'branch_name', header: 'Branch', sortable: true },
    {
      key: 'warehouse_type', header: 'Type',
      render: (row) => {
        const t = warehouseTypeMap[row.warehouse_type];
        return t ? <StatusBadge status={row.warehouse_type} statusMap={{ [row.warehouse_type]: { label: t.label, color: t.color } }} /> : row.warehouse_type;
      },
    },
    { key: 'address', header: 'Address' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} statusMap={ENTITY_STATUSES} /> },
  ];

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <div>
      <PageHeader
        title="Warehouses"
        subtitle="Manage storage locations across branches"
        actions={[
          { label: 'New Warehouse', variant: 'primary', onClick: () => navigate('/settings/warehouses/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search warehouses..." className="w-72" />
        <Select
          value={branchFilter}
          onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
          options={branchOptions}
          placeholder="All branches"
          className="w-48"
        />
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={toggleSort}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/settings/warehouses/${row.id}`)}
        emptyMessage="No warehouses yet"
        emptyAction={{ label: 'Create your first warehouse', onClick: () => navigate('/settings/warehouses/new') }}
      />
    </div>
  );
}