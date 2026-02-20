// src/pages/finance/BankAccountsList.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeApi, BankAccount } from '@/api/modules/finance.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, toast } from '@/components/shared/FormElements';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';
import { BANK_ACCOUNT_TYPES, ENTITY_STATUSES } from '@/lib/constants';

function maskAccountNumber(num: string): string {
  if (!num || num.length <= 4) return num;
  return 'XXXX XXXX ' + num.slice(-4);
}

export function BankAccountsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/finance/banks/new'),
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.banks.list({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        account_type: typeFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, typeFilter, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, typeFilter, statusFilter]);

  const columns: ColumnDef<BankAccount>[] = [
    {
      key: 'account_name', header: 'Account Name', sortable: true,
      render: (row) => <span className="font-medium text-gray-900 text-sm">{row.account_name}</span>,
    },
    {
      key: 'bank_name', header: 'Bank', sortable: true, width: '150px',
      render: (row) => <span className="text-sm text-gray-600">{row.bank_name}</span>,
    },
    {
      key: 'account_number', header: 'Account Number', width: '160px',
      render: (row) => <span className="font-mono text-xs text-gray-500">{maskAccountNumber(row.account_number)}</span>,
    },
    {
      key: 'ifsc_code', header: 'IFSC', width: '120px',
      render: (row) => row.ifsc_code
        ? <span className="font-mono text-xs text-gray-500">{row.ifsc_code}</span>
        : <span className="text-gray-300 text-xs">—</span>,
    },
    {
      key: 'account_type', header: 'Type', width: '110px',
      render: (row) => <StatusBadge status={row.account_type} statusMap={BANK_ACCOUNT_TYPES} />,
    },
    {
      key: 'opening_balance', header: 'Opening', align: 'right', width: '120px',
      render: (row) => <AmountDisplay value={row.opening_balance} />,
    },
    {
      key: 'current_balance', header: 'Current Balance', align: 'right', sortable: true, width: '140px',
      render: (row) => (
        <span className="font-semibold">
          <AmountDisplay value={row.current_balance ?? row.opening_balance} />
        </span>
      ),
    },
    {
      key: 'is_default', header: '', width: '40px',
      render: (row) => row.is_default ? (
        <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : null,
    },
    {
      key: 'is_active', header: 'Status', width: '90px',
      render: (row) => <StatusBadge status={row.is_active ? 'active' : 'inactive'} statusMap={ENTITY_STATUSES} />,
    },
  ];

  const typeOptions = Object.entries(BANK_ACCOUNT_TYPES).map(([value, cfg]) => ({ value, label: cfg.label }));

  return (
    <div>
      <PageHeader
        title="Bank Accounts"
        subtitle={`${total} account${total !== 1 ? 's' : ''}`}
        actions={[
          { label: 'New Bank Account', variant: 'primary', onClick: () => navigate('/finance/banks/new'), shortcut: 'Ctrl+N' },
        ]}
      />

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, bank..." className="w-72" />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={typeOptions}
          placeholder="All Types"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={statusFilter === 'active'}
            onChange={(e) => setStatusFilter(e.target.checked ? 'active' : '')}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Active Only
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
        onRowClick={(row) => navigate(`/finance/banks/${row.id}`)}
        emptyMessage="No bank accounts found"
        emptyAction={{ label: 'Add your first bank account', onClick: () => navigate('/finance/banks/new') }}
      />
    </div>
  );
}