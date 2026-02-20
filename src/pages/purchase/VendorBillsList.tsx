// src/pages/purchase/VendorBillsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { vendorBillsApi, VendorBill } from '@/api/modules/vendor-bills.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { formatDate } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const BILL_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  partially_paid: { label: 'Partially Paid', color: 'orange' },
  paid: { label: 'Paid', color: 'green' },
  overdue: { label: 'Overdue', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

const MATCH_STATUSES: Record<string, StatusConfig> = {
  matched: { label: 'Matched', color: 'green' },
  unmatched: { label: 'Unmatched', color: 'red' },
  partial: { label: 'Partial', color: 'orange' },
};

export function VendorBillsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/purchase/bills/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vendorBillsApi.list({
        page, limit, search: debouncedSearch || undefined,
        status: statusFilter || undefined, overdue_only: overdueOnly || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, overdueOnly]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, overdueOnly]);

  const columns: ColumnDef<VendorBill>[] = [
    {
      key: 'bill_number', header: 'Bill #', sortable: true, width: '130px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.bill_number}</span>,
    },
    {
      key: 'vendor_bill_number', header: 'Vendor Inv #', width: '120px',
      render: (row) => <span className="text-xs text-gray-600">{row.vendor_bill_number || '—'}</span>,
    },
    {
      key: 'vendor_bill_date', header: 'Bill Date', sortable: true, width: '100px',
      render: (row) => <span className="text-sm">{formatDate(row.vendor_bill_date)}</span>,
    },
    {
      key: 'vendor', header: 'Vendor',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900 text-sm">{row.vendor?.name || '—'}</div>
          {row.vendor?.vendor_code && <div className="text-xs text-gray-500">{row.vendor.vendor_code}</div>}
        </div>
      ),
    },
    {
      key: 'grand_total', header: 'Total', align: 'right', sortable: true, width: '120px',
      render: (row) => <AmountDisplay value={row.grand_total} />,
    },
    {
      key: 'amount_paid', header: 'Paid', align: 'right', width: '110px',
      render: (row) => <span className="text-green-600"><AmountDisplay value={row.amount_paid} /></span>,
    },
    {
      key: 'amount_due', header: 'Due', align: 'right', width: '110px',
      render: (row) => (
        <span className={row.amount_due > 0 ? 'text-red-600 font-medium' : ''}>
          <AmountDisplay value={row.amount_due} />
        </span>
      ),
    },
    {
      key: 'three_way_match_status', header: 'Match', width: '100px',
      render: (row) => row.three_way_match_status
        ? <StatusBadge status={row.three_way_match_status} statusMap={MATCH_STATUSES} />
        : <span className="text-gray-400 text-xs">—</span>,
    },
    {
      key: 'status', header: 'Status', width: '120px',
      render: (row) => <StatusBadge status={row.status} statusMap={BILL_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Vendor Bills"
        subtitle={`${total} bill${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Bill', variant: 'primary', onClick: () => navigate('/purchase/bills/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by bill number, vendor..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={Object.entries(BILL_STATUSES).map(([value, cfg]) => ({ value, label: cfg.label }))}
          placeholder="All Statuses"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          Overdue Only
        </label>
      </div>
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onRowClick={(row) => navigate(`/purchase/bills/${row.id}`)}
        emptyMessage="No vendor bills found"
        emptyAction={{ label: 'Record your first bill', onClick: () => navigate('/purchase/bills/new') }}
      />
    </div>
  );
}