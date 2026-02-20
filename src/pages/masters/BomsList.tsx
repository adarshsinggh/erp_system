// src/pages/masters/BomsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { bomsApi, Bom } from '@/api/modules/boms.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import { formatDate } from '@/lib/formatters';
import { StatusConfig } from '@/lib/constants';

const BOM_STATUS_MAP: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  active: { label: 'Active', color: 'green' },
  obsolete: { label: 'Obsolete', color: 'red' },
};

export function BomsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({ 'ctrl+n': () => navigate('/masters/boms/new') });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bomsApi.list({ page, limit, search: debouncedSearch || undefined, status: statusFilter || undefined });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const columns: ColumnDef<Bom>[] = [
    { key: 'bom_code', header: 'BOM Code', sortable: true, width: '140px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.bom_code}</span> },
    { key: 'product', header: 'Product',
      render: (row) => row.product ? (
        <div><div className="font-medium text-gray-900">{row.product.name}</div><div className="text-xs text-gray-500">{row.product.product_code}</div></div>
      ) : <span className="text-gray-400">--</span> },
    { key: 'bom_version', header: 'Version', align: 'center', width: '80px',
      render: (row) => <span className="font-mono">v{row.bom_version}</span> },
    { key: 'status', header: 'Status', width: '100px',
      render: (row) => <StatusBadge status={row.status || 'draft'} statusMap={BOM_STATUS_MAP} /> },
    { key: 'effective_from', header: 'Effective From', width: '120px',
      render: (row) => row.effective_from ? <span className="text-xs">{formatDate(row.effective_from)}</span> : <span className="text-gray-300">--</span> },
    { key: 'output_quantity', header: 'Output Qty', align: 'right', width: '100px',
      render: (row) => row.output_quantity || 1 },
  ];

  return (
    <div>
      <PageHeader title="Bill of Materials" subtitle={`${total} BOM${total !== 1 ? 's' : ''}`}
        actions={[{ label: 'New BOM', variant: 'primary', onClick: () => navigate('/masters/boms/new'), shortcut: 'Ctrl+N' }]} />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by code, product..." className="w-80" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          options={[{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }, { value: 'obsolete', label: 'Obsolete' }]} placeholder="All Statuses" />
      </div>
      <DataTable columns={columns} data={data} loading={loading} total={total} page={page} limit={limit} onPageChange={setPage}
        onRowClick={(row) => navigate(`/masters/boms/${row.id}`)}
        emptyMessage="No BOMs found" emptyAction={{ label: 'Create your first BOM', onClick: () => navigate('/masters/boms/new') }} />
    </div>
  );
}