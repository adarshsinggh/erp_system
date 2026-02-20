// src/pages/system/AlertRulesList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { systemApi, AlertRule } from '@/api/modules/system.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast, ConfirmDialog } from '@/components/shared/FormElements';
import { ALERT_TYPES } from '@/lib/constants';
import { formatDateTime } from '@/lib/formatters';
import { usePagination, useKeyboardShortcuts, useDebounce } from '@/hooks';

const alertTypeOptions = Object.entries(ALERT_TYPES).map(([value, cfg]) => ({ value, label: cfg.label }));

export function AlertRulesList() {
  const navigate = useNavigate();
  const { page, limit, search, sortBy, sortOrder, setPage, setSearch, toggleSort } = usePagination();
  const [data, setData] = useState<AlertRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [alertTypeFilter, setAlertTypeFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evalBanner, setEvalBanner] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    loadData();
  }, [page, limit, sortBy, sortOrder, debouncedSearch, alertTypeFilter, activeFilter]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await systemApi.alertRules.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        alert_type: alertTypeFilter || undefined,
        sort_by: sortBy || undefined,
        sort_order: sortOrder || undefined,
      });
      let filtered = res.data || [];
      // Client-side active filter
      if (activeFilter === 'active') filtered = filtered.filter((r) => r.is_active);
      else if (activeFilter === 'inactive') filtered = filtered.filter((r) => !r.is_active);
      setTotal(activeFilter ? filtered.length : res.total);
      setData(filtered);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEvaluate() {
    setEvaluating(true);
    try {
      const res = await systemApi.alertRules.evaluate();
      const r = res.data;
      const msg = `Evaluation complete: ${r.rules_triggered} of ${r.rules_evaluated} rule(s) triggered, ${r.total_notifications} notification(s) created`;
      toast.success(msg);
      if (r.rules_triggered > 0) {
        setEvalBanner(msg);
        setTimeout(() => setEvalBanner(null), 10000);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEvaluating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await systemApi.alertRules.delete(id);
      toast.success('Alert rule deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
    setDeleteConfirm(null);
  }

  useKeyboardShortcuts({
    'ctrl+n': () => navigate('/system/alert-rules/new'),
  });

  const columns: ColumnDef<AlertRule>[] = [
    {
      key: 'name', header: 'Name', sortable: true,
      render: (row) => <span className="font-medium text-gray-900">{row.name}</span>,
    },
    {
      key: 'alert_type', header: 'Alert Type',
      render: (row) => <StatusBadge status={row.alert_type} statusMap={ALERT_TYPES} />,
    },
    {
      key: 'entity_type', header: 'Entity Scope',
      render: (row) => (
        <span className="text-sm text-gray-600">
          {row.entity_type ? row.entity_type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'All'}
        </span>
      ),
    },
    {
      key: 'notify', header: 'Notify',
      render: (row) => {
        const roles = row.notify_role_ids?.length || 0;
        const users = row.notify_user_ids?.length || 0;
        if (!roles && !users) return <span className="text-xs text-gray-400">Default (Admin)</span>;
        return (
          <div className="flex gap-1.5">
            {roles > 0 && <span className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">{roles} role{roles > 1 ? 's' : ''}</span>}
            {users > 0 && <span className="px-1.5 py-0.5 text-xs bg-purple-50 text-purple-700 rounded">{users} user{users > 1 ? 's' : ''}</span>}
          </div>
        );
      },
    },
    {
      key: 'is_active', header: 'Active',
      render: (row) => row.is_active
        ? <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        : <span className="text-gray-300">—</span>,
    },
    {
      key: 'created_at', header: 'Created', sortable: true,
      render: (row) => <span className="text-xs text-gray-500">{formatDateTime(row.created_at)}</span>,
    },
    {
      key: 'actions', header: '',
      render: (row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/system/alert-rules/${row.id}`); }}
            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-gray-100 rounded transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row.id); }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Alert Rules"
        subtitle="Configure automated monitoring and notification triggers"
        actions={[
          { label: evaluating ? 'Evaluating...' : 'Run Evaluation', variant: 'secondary', onClick: handleEvaluate, disabled: evaluating },
          { label: 'New Rule', variant: 'primary', onClick: () => navigate('/system/alert-rules/new'), shortcut: 'Ctrl+N' },
        ]}
      />

      {evalBanner && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {evalBanner}
          <button onClick={() => setEvalBanner(null)} className="ml-auto text-blue-500 hover:text-blue-700">✕</button>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search rules..." className="w-72" />
        <Select
          value={alertTypeFilter}
          onChange={(e) => { setAlertTypeFilter(e.target.value); setPage(1); }}
          options={alertTypeOptions}
          placeholder="All types"
          className="w-48"
        />
        <Select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }}
          options={[
            { value: 'active', label: 'Active Only' },
            { value: 'inactive', label: 'Inactive Only' },
          ]}
          placeholder="All statuses"
          className="w-40"
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
        onRowClick={(row) => navigate(`/system/alert-rules/${row.id}`)}
        emptyMessage="No alert rules configured"
        emptyAction={{ label: 'Create your first alert rule', onClick: () => navigate('/system/alert-rules/new') }}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Alert Rule"
        message="Are you sure you want to delete this alert rule? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}