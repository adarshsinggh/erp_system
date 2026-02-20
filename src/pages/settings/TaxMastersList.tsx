// src/pages/settings/TaxMastersList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mastersApi, TaxMaster } from '@/api/modules/masters.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast } from '@/components/shared/FormElements';
import { ENTITY_STATUSES } from '@/lib/constants';
import { usePagination, useKeyboardShortcuts, useDebounce } from '@/hooks';

const taxTypeStatusMap: Record<string, { label: string; color: 'blue' | 'purple' | 'orange' }> = {
  GST: { label: 'GST', color: 'blue' },
  TDS: { label: 'TDS', color: 'purple' },
  TCS: { label: 'TCS', color: 'orange' },
};

const taxTypeOptions = [
  { value: '', label: 'All Types' },
  { value: 'GST', label: 'GST' },
  { value: 'TDS', label: 'TDS' },
  { value: 'TCS', label: 'TCS' },
];

export function TaxMastersList() {
  const navigate = useNavigate();
  const { page, limit, search, sortBy, sortOrder, setPage, setSearch, toggleSort } = usePagination();
  const [data, setData] = useState<TaxMaster[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    loadData();
  }, [page, limit, sortBy, sortOrder, debouncedSearch, typeFilter]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await mastersApi.listTaxes(typeFilter || undefined);
      let filtered = res.data || [];
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        filtered = filtered.filter(
          (t) => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)
        );
      }
      if (sortBy) {
        filtered.sort((a, b) => {
          const aVal = sortBy === 'rate' ? a.rate : String((a as any)[sortBy] || '');
          const bVal = sortBy === 'rate' ? b.rate : String((b as any)[sortBy] || '');
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
          }
          return sortOrder === 'asc'
            ? String(aVal).localeCompare(String(bVal))
            : String(bVal).localeCompare(String(aVal));
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
    'ctrl+n': () => navigate('/settings/taxes/new'),
  });

  const columns: ColumnDef<TaxMaster>[] = [
    { key: 'name', header: 'Tax Name', sortable: true, render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
    {
      key: 'tax_type', header: 'Type', sortable: true,
      render: (row) => {
        const config = taxTypeStatusMap[row.tax_type];
        return config ? <StatusBadge status={row.tax_type} statusMap={{ [row.tax_type]: config }} /> : row.tax_type;
      },
    },
    { key: 'rate', header: 'Rate', sortable: true, align: 'right', render: (row) => <span className="font-mono">{row.rate}%</span> },
    { key: 'description', header: 'Description' },
    {
      key: 'is_compound', header: 'Compound',
      render: (row) => row.is_compound ? (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">Yes</span>
      ) : (
        <span className="text-gray-400">No</span>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} statusMap={ENTITY_STATUSES} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Tax Masters"
        subtitle="Manage GST, TDS, and TCS tax configurations"
        actions={[
          { label: 'New Tax', variant: 'primary', onClick: () => navigate('/settings/taxes/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search taxes..." className="w-72" />
        <Select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          options={taxTypeOptions}
          className="w-36"
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
        onRowClick={(row) => navigate(`/settings/taxes/${row.id}`)}
        emptyMessage="No taxes configured"
        emptyAction={{ label: 'Create first tax', onClick: () => navigate('/settings/taxes/new') }}
      />
    </div>
  );
}