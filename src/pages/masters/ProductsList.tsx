// src/pages/masters/ProductsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { productsApi, Product } from '@/api/modules/products.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { ENTITY_STATUSES } from '@/lib/constants';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

export function ProductsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({ 'ctrl+n': () => navigate('/masters/products/new') });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await productsApi.list({ page, limit, search: debouncedSearch || undefined, status: statusFilter || undefined, product_type: typeFilter || undefined });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [page, debouncedSearch, statusFilter, typeFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, typeFilter]);

  const columns: ColumnDef<Product>[] = [
    { key: 'product_code', header: 'Code', sortable: true, width: '120px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.product_code}</span> },
    { key: 'name', header: 'Name', sortable: true,
      render: (row) => (<div><div className="font-medium text-gray-900">{row.name}</div>{row.category_name && <div className="text-xs text-gray-500">{row.category_name}</div>}</div>) },
    { key: 'product_type', header: 'Type', width: '130px',
      render: (row) => (<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.product_type === 'finished_goods' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{row.product_type === 'finished_goods' ? 'Finished Goods' : 'Semi-Finished'}</span>) },
    { key: 'selling_price', header: 'Selling Price', align: 'right', width: '130px',
      render: (row) => row.selling_price ? <AmountDisplay value={row.selling_price} /> : <span className="text-gray-300">--</span> },
    { key: 'gst_rate', header: 'GST', align: 'right', width: '70px', render: (row) => row.gst_rate != null ? `${row.gst_rate}%` : '--' },
    { key: 'status', header: 'Status', width: '100px', render: (row) => <StatusBadge status={row.status || 'active'} statusMap={ENTITY_STATUSES} /> },
  ];

  return (
    <div>
      <PageHeader title="Products" subtitle={`${total} product${total !== 1 ? 's' : ''}`}
        actions={[{ label: 'New Product', variant: 'primary', onClick: () => navigate('/masters/products/new'), shortcut: 'Ctrl+N' }]} />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code, HSN..." className="w-80" />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          options={[{ value: 'finished_goods', label: 'Finished Goods' }, { value: 'semi_finished', label: 'Semi-Finished' }]} placeholder="All Types" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} placeholder="All Statuses" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={total} page={page} limit={limit} onPageChange={setPage}
        onRowClick={(row) => navigate(`/masters/products/${row.id}`)}
        emptyMessage="No products found" emptyAction={{ label: 'Add your first product', onClick: () => navigate('/masters/products/new') }} />
    </div>
  );
}