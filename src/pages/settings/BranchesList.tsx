// src/pages/settings/BranchesList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi, Branch } from '@/api/modules/settings.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from '@/components/shared/FormElements';
import { ENTITY_STATUSES } from '@/lib/constants';
import { formatGSTIN } from '@/lib/formatters';
import { usePagination, useKeyboardShortcuts, useDebounce } from '@/hooks';

export function BranchesList() {
  const navigate = useNavigate();
  const { page, limit, search, sortBy, sortOrder, setPage, setSearch, toggleSort } = usePagination();
  const [data, setData] = useState<Branch[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    loadData();
  }, [page, limit, sortBy, sortOrder, debouncedSearch]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await settingsApi.listBranches();
      let filtered = res.data || [];
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        filtered = filtered.filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            b.code.toLowerCase().includes(q) ||
            b.city.toLowerCase().includes(q)
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
    'ctrl+n': () => navigate('/settings/branches/new'),
  });

  const columns: ColumnDef<Branch>[] = [
    { key: 'name', header: 'Branch Name', sortable: true, render: (row) => (
      <div>
        <span className="font-medium text-gray-900">{row.name}</span>
        {row.is_main && (
          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-100 text-brand-700">
            MAIN
          </span>
        )}
      </div>
    )},
    { key: 'code', header: 'Code', sortable: true, render: (row) => <span className="font-mono text-xs text-gray-600">{row.code}</span> },
    { key: 'city', header: 'City', sortable: true },
    { key: 'state', header: 'State', sortable: true },
    { key: 'gstin', header: 'GSTIN', render: (row) => <span className="font-mono text-xs">{formatGSTIN(row.gstin)}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} statusMap={ENTITY_STATUSES} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Branches"
        subtitle="Manage your company branches"
        actions={[
          { label: 'New Branch', variant: 'primary', onClick: () => navigate('/settings/branches/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search branches..." className="w-72" />
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
        onRowClick={(row) => navigate(`/settings/branches/${row.id}`)}
        emptyMessage="No branches yet"
        emptyAction={{ label: 'Create your first branch', onClick: () => navigate('/settings/branches/new') }}
      />
    </div>
  );
}