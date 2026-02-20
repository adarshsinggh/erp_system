// src/pages/purchase/GoodsReceiptNotesList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { goodsReceiptNotesApi, GoodsReceiptNote } from '@/api/modules/goods-receipt-notes.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const GRN_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  confirmed: { label: 'Confirmed', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

const INSPECTION_STATUSES: Record<string, StatusConfig> = {
  pending: { label: 'Pending', color: 'yellow' },
  passed: { label: 'Passed', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
  partial: { label: 'Partial', color: 'orange' },
};

export function GoodsReceiptNotesList() {
  const navigate = useNavigate();
  const [data, setData] = useState<GoodsReceiptNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [inspectionFilter, setInspectionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/purchase/grn/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await goodsReceiptNotesApi.list({
        page, limit, search: debouncedSearch || undefined,
        status: statusFilter || undefined, inspection_status: inspectionFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, inspectionFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, inspectionFilter]);

  const columns: ColumnDef<GoodsReceiptNote>[] = [
    {
      key: 'grn_number', header: 'GRN #', sortable: true, width: '140px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.grn_number}</span>,
    },
    {
      key: 'grn_date', header: 'Date', sortable: true, width: '110px',
      render: (row) => <span className="text-sm">{formatDate(row.grn_date)}</span>,
    },
    {
      key: 'vendor', header: 'Vendor',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900 text-sm">{row.vendor?.name || '—'}</div>
          {row.vendor?.vendor_code && (
            <div className="text-xs text-gray-500">{row.vendor.vendor_code}</div>
          )}
        </div>
      ),
    },
    {
      key: 'purchase_order', header: 'PO #', width: '130px',
      render: (row) => {
        const po = row.purchase_order as { po_number?: string } | undefined;
        return po?.po_number
          ? <span className="font-mono text-xs text-purple-600">{po.po_number}</span>
          : <span className="text-gray-400 text-xs">—</span>;
      },
    },
    {
      key: 'inspection_status', header: 'Inspection', width: '110px',
      render: (row) => <StatusBadge status={row.inspection_status} statusMap={INSPECTION_STATUSES} />,
    },
    {
      key: 'status', header: 'Status', width: '110px',
      render: (row) => <StatusBadge status={row.status} statusMap={GRN_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Goods Receipt Notes"
        subtitle={`${total} GRN${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New GRN', variant: 'primary', onClick: () => navigate('/purchase/grn/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by GRN number, vendor..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(GRN_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <Select
          value={inspectionFilter}
          onChange={(e) => setInspectionFilter(e.target.value)}
          options={Object.entries(INSPECTION_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Inspections"
        />
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/purchase/grn/${row.id}`)}
        emptyMessage="No goods receipt notes found"
        emptyAction={{ label: 'Create your first GRN', onClick: () => navigate('/purchase/grn/new') }}
      />
    </div>
  );
}