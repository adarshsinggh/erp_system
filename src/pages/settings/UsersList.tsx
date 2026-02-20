// src/pages/settings/UsersList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi, User } from '@/api/modules/settings.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from '@/components/shared/FormElements';
import { ENTITY_STATUSES } from '@/lib/constants';
import { formatRelativeDate } from '@/lib/formatters';
import { usePagination, useKeyboardShortcuts, useDebounce } from '@/hooks';

export function UsersList() {
  const navigate = useNavigate();
  const { page, limit, search, sortBy, sortOrder, setPage, setSearch, toggleSort } = usePagination();
  const [data, setData] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    loadData();
  }, [page, limit, sortBy, sortOrder, debouncedSearch]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await settingsApi.listUsers();
      let filtered = res.data || [];
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        filtered = filtered.filter(
          (u) =>
            u.full_name.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.role_name || '').toLowerCase().includes(q)
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
    'ctrl+n': () => navigate('/settings/users/new'),
  });

  const columns: ColumnDef<User>[] = [
    {
      key: 'full_name', header: 'Name', sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.full_name}</div>
          <div className="text-xs text-gray-500">@{row.username}</div>
        </div>
      ),
    },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'role_name', header: 'Role', sortable: true, render: (row) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
        {row.role_name || '—'}
      </span>
    )},
    { key: 'branch_name', header: 'Branch', sortable: true },
    { key: 'last_login', header: 'Last Login', render: (row) => (
      <span className="text-xs text-gray-500">{formatRelativeDate(row.last_login)}</span>
    )},
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} statusMap={ENTITY_STATUSES} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage system users and access"
        actions={[
          { label: 'New User', variant: 'primary', onClick: () => navigate('/settings/users/new'), shortcut: 'Ctrl+N' },
        ]}
      />
      <div className="flex gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search users..." className="w-72" />
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
        onRowClick={(row) => navigate(`/settings/users/${row.id}`)}
        emptyMessage="No users yet"
        emptyAction={{ label: 'Create your first user', onClick: () => navigate('/settings/users/new') }}
      />
    </div>
  );
}