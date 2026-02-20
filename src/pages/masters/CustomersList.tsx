// src/pages/masters/CustomersList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { customersApi, Customer } from '@/api/modules/customers.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { ENTITY_STATUSES } from '@/lib/constants';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

export function CustomersList() {
  const navigate = useNavigate();
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/masters/customers/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customersApi.list({
        page, limit, search: debouncedSearch || undefined, status: statusFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const columns: ColumnDef<Customer>[] = [
    {
      key: 'customer_code', header: 'Code', sortable: true, width: '120px',
      render: (row) => <span className="font-mono text-xs font-medium text-brand-700">{row.customer_code}</span>,
    },
    {
      key: 'name', header: 'Name', sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.name}</div>
          {row.display_name && row.display_name !== row.name && (
            <div className="text-xs text-gray-500">{row.display_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'customer_type', header: 'Type', width: '100px',
      render: (row) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          row.customer_type === 'company' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
        }`}>
          {row.customer_type === 'company' ? 'Company' : 'Individual'}
        </span>
      ),
    },
    {
      key: 'gstin', header: 'GSTIN', width: '180px',
      render: (row) => row.gstin ? <span className="font-mono text-xs">{row.gstin}</span> : <span className="text-gray-300">—</span>,
    },
    {
      key: 'credit_limit', header: 'Credit Limit', align: 'right', width: '140px',
      render: (row) => row.credit_limit ? <AmountDisplay value={row.credit_limit} /> : <span className="text-gray-300">—</span>,
    },
    {
      key: 'payment_terms_days', header: 'Terms', align: 'center', width: '80px',
      render: (row) => row.payment_terms_days ? `${row.payment_terms_days}d` : '—',
    },
    {
      key: 'status', header: 'Status', width: '100px',
      render: (row) => <StatusBadge status={row.status || 'active'} statusMap={ENTITY_STATUSES} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${total} customer${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Customer', variant: 'primary', onClick: () => navigate('/masters/customers/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code, GSTIN..." className="w-80" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'blocked', label: 'Blocked' },
          ]}
          placeholder="All Statuses"
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
        onRowClick={(row) => navigate(`/masters/customers/${row.id}`)}
        emptyMessage="No customers found"
        emptyAction={{ label: 'Add your first customer', onClick: () => navigate('/masters/customers/new') }}
      />
    </div>
  );
}