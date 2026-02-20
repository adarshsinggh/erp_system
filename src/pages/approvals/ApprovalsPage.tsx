// src/pages/approvals/ApprovalsPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { approvalsApi, ApprovalQueueEntry, ApprovalDashboardStats } from '@/api/modules/approvals.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, Textarea, toast } from '@/components/shared/FormElements';
import { formatDateTime } from '@/lib/formatters';
import { APPROVAL_DOC_TYPES, APPROVAL_ACTIONS } from '@/lib/constants';
import { useDebounce } from '@/hooks';

const DOC_TYPE_OPTIONS = Object.entries(APPROVAL_DOC_TYPES).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));

export function ApprovalsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<ApprovalDashboardStats | null>(null);
  const [data, setData] = useState<ApprovalQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;
  const debouncedSearch = useDebounce(search, 300);

  // Action modal state
  const [actionModal, setActionModal] = useState<{
    type: 'approve' | 'reject';
    entry: ApprovalQueueEntry;
  } | null>(null);
  const [actionComments, setActionComments] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await approvalsApi.engine.dashboard();
      setStats(res.data);
    } catch {
      // stats are supplementary, don't block
    }
  }, []);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await approvalsApi.engine.pending({
        page,
        limit,
        document_type: docTypeFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, docTypeFilter]);

  useEffect(() => {
    loadDashboard();
    loadQueue();
  }, [loadDashboard, loadQueue]);

  useEffect(() => {
    setPage(1);
  }, [docTypeFilter, debouncedSearch]);

  // Filter data client-side by search (document_number)
  const filteredData = debouncedSearch
    ? data.filter(
        (d) =>
          d.document_number?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          d.requested_by_name?.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : data;

  async function handleAction() {
    if (!actionModal) return;
    setActionLoading(true);
    try {
      if (actionModal.type === 'approve') {
        const res = await approvalsApi.engine.approve(actionModal.entry.id, {
          comments: actionComments || undefined,
        });
        toast.success(res.data.message || 'Approved successfully');
      } else {
        const res = await approvalsApi.engine.reject(actionModal.entry.id, {
          comments: actionComments || undefined,
        });
        toast.success(res.data.message || 'Rejected successfully');
      }
      setActionModal(null);
      setActionComments('');
      loadDashboard();
      loadQueue();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const columns: ColumnDef<ApprovalQueueEntry>[] = [
    {
      key: 'document_number',
      header: 'Document #',
      width: '140px',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs font-medium text-brand-700">
          {row.document_number || '—'}
        </span>
      ),
    },
    {
      key: 'document_type',
      header: 'Type',
      width: '160px',
      render: (row) => (
        <StatusBadge status={row.document_type} statusMap={APPROVAL_DOC_TYPES} />
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right' as const,
      width: '130px',
      sortable: true,
      render: (row) => <AmountDisplay value={row.amount} />,
    },
    {
      key: 'requested_by_name',
      header: 'Requested By',
      width: '150px',
      render: (row) => (
        <span className="text-sm text-gray-700">{row.requested_by_name || row.requested_by}</span>
      ),
    },
    {
      key: 'requested_at',
      header: 'Requested At',
      width: '160px',
      render: (row) => (
        <span className="text-sm text-gray-500">{formatDateTime(row.requested_at)}</span>
      ),
    },
    {
      key: 'approval_level',
      header: 'Level',
      width: '80px',
      align: 'center' as const,
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
          Level {row.approval_level}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '160px',
      align: 'right' as const,
      render: (row) => (
        <div className="flex items-center gap-1.5 justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActionModal({ type: 'approve', entry: row });
              setActionComments('');
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Approve
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActionModal({ type: 'reject', entry: row });
              setActionComments('');
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Reject
          </button>
        </div>
      ),
    },
  ];

  const kpiCards = [
    {
      label: 'Pending Approvals',
      value: stats?.pending_count ?? '—',
      color: 'bg-amber-50 border-amber-200 text-amber-700',
    },
    {
      label: 'Approved Today',
      value: stats?.approved_today ?? '—',
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    },
    {
      label: 'Rejected Today',
      value: stats?.rejected_today ?? '—',
      color: 'bg-red-50 border-red-200 text-red-700',
    },
  ];

  const pendingByType = stats?.by_document_type?.filter((d) => d.count > 0) || [];

  // Loading skeleton
  if (loading && !data.length) {
    return (
      <div>
        <PageHeader title="Approvals" />
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border p-4 bg-gray-50 border-gray-200">
              <div className="skeleton h-3 w-24 rounded mb-2" />
              <div className="skeleton h-7 w-12 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-4 w-24 rounded" />
              <div className="skeleton h-4 flex-1 rounded" />
              <div className="skeleton h-4 w-20 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="Review and action pending approval requests"
        actions={[
          {
            label: 'Approval Matrix',
            variant: 'secondary',
            onClick: () => navigate('/approvals/matrix'),
          },
        ]}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {kpiCards.map((card) => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
            <div className="text-xs font-medium opacity-70 mb-1">{card.label}</div>
            <div className="text-2xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Pending by document type chips */}
      {pendingByType.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs font-medium text-gray-500">Pending by type:</span>
          {pendingByType.map((item) => {
            const cfg = APPROVAL_DOC_TYPES[item.document_type];
            const isActive = docTypeFilter === item.document_type;
            return (
              <button
                key={item.document_type}
                onClick={() =>
                  setDocTypeFilter(isActive ? '' : item.document_type)
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {cfg?.label || item.document_type}
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by document # or requester..."
          className="w-72"
        />
        <Select
          value={docTypeFilter}
          onChange={(e) => setDocTypeFilter(e.target.value)}
          options={DOC_TYPE_OPTIONS}
          placeholder="All Document Types"
        />
      </div>

      {/* Queue Table */}
      {filteredData.length === 0 && !loading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <svg
            className="w-16 h-16 text-emerald-200 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-600">No pending approvals</p>
          <p className="text-xs text-gray-400 mt-1">You're all caught up!</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredData}
          loading={loading}
          total={total}
          page={page}
          limit={limit}
          onPageChange={setPage}
          emptyMessage="No pending approvals"
        />
      )}

      {/* Approve/Reject Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !actionLoading && setActionModal(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-gray-900">
              {actionModal.type === 'approve' ? 'Approve' : 'Reject'}{' '}
              {APPROVAL_DOC_TYPES[actionModal.entry.document_type]?.label || actionModal.entry.document_type}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {actionModal.entry.document_number || actionModal.entry.document_id}
            </p>

            {actionModal.type === 'reject' && (
              <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-100">
                <p className="text-xs text-red-700">
                  ⚠ Rejecting will cascade rejection to all remaining approval levels for this document.
                </p>
              </div>
            )}

            {actionModal.entry.approval_level > 1 && (
              <p className="mt-2 text-xs text-gray-400">
                Previous levels have been approved. This is Level {actionModal.entry.approval_level}.
              </p>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comments <span className="text-gray-400">(optional)</span>
              </label>
              <Textarea
                value={actionComments}
                onChange={(e) => setActionComments(e.target.value)}
                placeholder="Add any comments..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setActionModal(null)}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={actionLoading}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${
                  actionModal.type === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionLoading
                  ? 'Processing...'
                  : actionModal.type === 'approve'
                  ? 'Approve'
                  : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}