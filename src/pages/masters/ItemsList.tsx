// src/pages/masters/ItemsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { itemsApi, Item } from '@/api/modules/items.api';
import { mastersApi } from '@/api/modules/masters.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { ENTITY_STATUSES, StatusConfig } from '@/lib/constants';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

const ITEM_TYPE_MAP: Record<string, StatusConfig> = {
  raw_material: { label: 'Raw Material', color: 'blue' },
  component: { label: 'Component', color: 'purple' },
  consumable: { label: 'Consumable', color: 'orange' },
  packing: { label: 'Packing', color: 'yellow' },
};

export function ItemsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [catFilter, setCatFilter] = useState('');
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/masters/items/new'),
  });

  useEffect(() => {
    mastersApi.listCategories().then((res) => {
      setCategories((res.data || []).map((c: any) => ({ value: c.id, label: c.name })));
    }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await itemsApi.list({
        page, limit, search: debouncedSearch || undefined,
        status: statusFilter || undefined, item_type: typeFilter || undefined,
        category_id: catFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [page, debouncedSearch, statusFilter, typeFilter, catFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, typeFilter, catFilter]);

  const columns: ColumnDef<Item>[] = [
    { key: 'item_code', header: 'Code', sortable: true, width: '120px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.item_code}</span> },
    { key: 'name', header: 'Name', sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.name}</div>
          {row.category_name && <div className="text-xs text-gray-500">{row.category_name}</div>}
        </div>
      ) },
    { key: 'item_type', header: 'Type', width: '120px',
      render: (row) => {
        const t = ITEM_TYPE_MAP[row.item_type];
        return t ? <StatusBadge status={row.item_type} statusMap={{ [row.item_type]: t }} /> : String(row.item_type);
      } },
    { key: 'uom_code', header: 'UOM', width: '70px',
      render: (row) => <span className="font-mono text-xs">{row.uom_code || '—'}</span> },
    { key: 'hsn_code', header: 'HSN', width: '80px',
      render: (row) => row.hsn_code ? <span className="font-mono text-xs">{row.hsn_code}</span> : <span className="text-gray-300">—</span> },
    { key: 'purchase_price', header: 'Purchase ₹', align: 'right', width: '120px',
      render: (row) => row.purchase_price ? <AmountDisplay value={row.purchase_price} /> : <span className="text-gray-300">—</span> },
    { key: 'gst_rate', header: 'GST%', align: 'right', width: '70px',
      render: (row) => row.gst_rate != null ? `${row.gst_rate}%` : '—' },
    { key: 'status', header: 'Status', width: '100px',
      render: (row) => <StatusBadge status={row.status || 'active'} statusMap={ENTITY_STATUSES} /> },
  ];

  return (
    <div>
      <PageHeader title="Items" subtitle={`${total} item${total !== 1 ? 's' : ''}`}
        actions={[{ label: 'New Item', variant: 'primary', onClick: () => navigate('/masters/items/new'), shortcut: 'Ctrl+N' }]} />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code, HSN..." className="w-80" />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          options={Object.entries(ITEM_TYPE_MAP).map(([k, v]) => ({ value: k, label: v.label }))} placeholder="All Types" />
        {categories.length > 0 && (
          <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} options={categories} placeholder="All Categories" />
        )}
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} placeholder="All Statuses" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={total} page={page} limit={limit} onPageChange={setPage}
        onRowClick={(row) => navigate(`/masters/items/${row.id}`)}
        emptyMessage="No items found" emptyAction={{ label: 'Add your first item', onClick: () => navigate('/masters/items/new') }} />
    </div>
  );
}