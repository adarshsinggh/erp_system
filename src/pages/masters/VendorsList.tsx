// src/pages/masters/VendorsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { vendorsApi, Vendor } from '@/api/modules/vendors.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast } from '@/components/shared/FormElements';
import { ENTITY_STATUSES } from '@/lib/constants';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

export function VendorsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/masters/vendors/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vendorsApi.list({ page, limit, search: debouncedSearch || undefined, status: statusFilter || undefined });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const columns: ColumnDef<Vendor>[] = [
    { key: 'vendor_code', header: 'Code', sortable: true, width: '120px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.vendor_code}</span> },
    { key: 'name', header: 'Name', sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.name}</div>
          {row.display_name && row.display_name !== row.name && <div className="text-xs text-gray-500">{row.display_name}</div>}
        </div>
      ) },
    { key: 'vendor_type', header: 'Type', width: '100px',
      render: (row) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.vendor_type === 'company' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
          {row.vendor_type === 'company' ? 'Company' : 'Individual'}
        </span>
      ) },
    { key: 'gstin', header: 'GSTIN', width: '180px',
      render: (row) => row.gstin ? <span className="font-mono text-xs">{row.gstin}</span> : <span className="text-gray-300">—</span> },
    { key: 'payment_terms_days', header: 'Terms', align: 'center', width: '80px',
      render: (row) => row.payment_terms_days ? `${row.payment_terms_days}d` : '—' },
    { key: 'is_preferred', header: '', width: '40px',
      render: (row) => row.is_preferred ? <span className="text-amber-500 text-lg" title="Preferred Vendor">★</span> : null },
    { key: 'status', header: 'Status', width: '100px',
      render: (row) => <StatusBadge status={row.status || 'active'} statusMap={ENTITY_STATUSES} /> },
  ];

  return (
    <div>
      <PageHeader title="Vendors" subtitle={`${total} vendor${total !== 1 ? 's' : ''}`}
        actions={[{ label: 'New Vendor', variant: 'primary', onClick: () => navigate('/masters/vendors/new'), shortcut: 'Ctrl+N' }]} />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code, GSTIN..." className="w-80" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'blocked', label: 'Blocked' }]}
          placeholder="All Statuses" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={total} page={page} limit={limit} onPageChange={setPage}
        onRowClick={(row) => navigate(`/masters/vendors/${row.id}`)}
        emptyMessage="No vendors found" emptyAction={{ label: 'Add your first vendor', onClick: () => navigate('/masters/vendors/new') }} />
    </div>
  );
}