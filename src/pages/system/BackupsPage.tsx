// src/pages/system/BackupsPage.tsx
import React, { useState, useEffect, useRef } from 'react';
import { systemApi, BackupRecord, BackupType } from '@/api/modules/system.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, toast, ConfirmDialog } from '@/components/shared/FormElements';
import { BACKUP_STATUSES, BACKUP_TYPES } from '@/lib/constants';
import { formatDateTime } from '@/lib/formatters';
import { usePagination } from '@/hooks';

export function BackupsPage() {
  const { page, limit, setPage } = usePagination();
  const [data, setData] = useState<BackupRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Run Backup dialog
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [runType, setRunType] = useState<BackupType>('full');
  const [runEncrypt, setRunEncrypt] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);

  // Restore dialog
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');

  // Delete dialog
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Polling ref for running backups
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadData();
  }, [page, limit, statusFilter, typeFilter]);

  useEffect(() => {
    // Poll if any backup is running
    const hasRunning = data.some((b) => b.status === 'running');
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(loadData, 5000);
    } else if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [data]);

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await systemApi.backups.list({
        status: statusFilter || undefined,
        backup_type: typeFilter || undefined,
        page,
        limit,
      });
      setData(res.data || []);
      setTotal(res.total);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load backups');
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunBackup() {
    setRunningBackup(true);
    try {
      await systemApi.backups.run({ backup_type: runType, encrypt: runEncrypt });
      toast.success('Backup completed successfully');
      setShowRunDialog(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRunningBackup(false);
    }
  }

  async function handleVerify(id: string) {
    try {
      const res = await systemApi.backups.verify(id);
      const v = res.data;
      if (v.is_valid) {
        toast.success('Backup valid ✓');
      } else {
        toast.error('Backup corrupted ✗ — file may be damaged or incomplete');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleRestore() {
    if (restoreConfirmText !== 'RESTORE' || !restoreId) return;
    try {
      await systemApi.backups.restore(restoreId);
      toast.success('Database restored successfully. Please restart the application.');
    } catch (err: any) {
      toast.error(err.message);
    }
    setRestoreId(null);
    setRestoreConfirmText('');
  }

  async function handleDelete(id: string) {
    try {
      await systemApi.backups.delete(id);
      toast.success('Backup deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
    setDeleteConfirm(null);
  }

  const columns: ColumnDef<BackupRecord>[] = [
    {
      key: 'status', header: 'Status',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={row.status} statusMap={BACKUP_STATUSES} />
          {row.status === 'running' && (
            <svg className="w-3.5 h-3.5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
      ),
    },
    {
      key: 'backup_type', header: 'Type',
      render: (row) => <StatusBadge status={row.backup_type} statusMap={BACKUP_TYPES} />,
    },
    {
      key: 'started_at', header: 'Started', sortable: true,
      render: (row) => <span className="text-xs text-gray-600">{formatDateTime(row.started_at)}</span>,
    },
    {
      key: 'completed_at', header: 'Completed',
      render: (row) => <span className="text-xs text-gray-500">{row.completed_at ? formatDateTime(row.completed_at) : '—'}</span>,
    },
    {
      key: 'file_size_mb', header: 'Size',
      render: (row) => <span className="text-xs text-gray-600">{row.file_size_mb ? `${row.file_size_mb} MB` : '—'}</span>,
    },
    {
      key: 'is_encrypted', header: 'Encrypted',
      render: (row) => row.is_encrypted
        ? <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        : <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>,
    },
    {
      key: 'file_exists', header: 'File',
      render: (row) => row.file_exists
        ? <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
    },
    {
      key: 'created_by_name', header: 'Created By',
      render: (row) => <span className="text-xs text-gray-500">{row.created_by_name || '—'}</span>,
    },
    {
      key: 'actions', header: '',
      render: (row) => {
        const canAction = row.status === 'completed' && row.file_exists;
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); if (canAction) handleVerify(row.id); }}
              disabled={!canAction}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Verify Integrity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); if (canAction) { setRestoreId(row.id); setRestoreConfirmText(''); } }}
              disabled={!canAction}
              className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Restore"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(row.id); }}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Backups"
        subtitle="Database backup and restore management"
        actions={[
          { label: 'Run Backup', variant: 'primary', onClick: () => setShowRunDialog(true) },
        ]}
      />

      <div className="flex gap-3 mb-4">
        <Select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          options={[
            { value: 'completed', label: 'Completed' },
            { value: 'running', label: 'Running' },
            { value: 'failed', label: 'Failed' },
          ]}
          placeholder="All statuses"
          className="w-40"
        />
        <Select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          options={[
            { value: 'full', label: 'Full' },
            { value: 'incremental', label: 'Incremental' },
          ]}
          placeholder="All types"
          className="w-40"
        />
      </div>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <svg className="w-10 h-10 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-sm font-medium text-red-800 mb-1">Failed to load backups</p>
          <p className="text-xs text-red-600 mb-4">{loadError}</p>
          <button onClick={loadData} className="text-sm text-red-700 underline hover:text-red-900">Retry</button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          loading={loading}
          total={total}
          page={page}
          limit={limit}
          onPageChange={setPage}
          emptyMessage="No backups yet"
          emptyAction={{ label: 'Run your first backup', onClick: () => setShowRunDialog(true) }}
        />
      )}

      {/* Run Backup Dialog */}
      {showRunDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md animate-fade-in">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Run Backup</h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Backup Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={runType === 'full'} onChange={() => setRunType('full')} className="text-brand-600" />
                    <span className="text-sm">Full</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={runType === 'incremental'} onChange={() => setRunType('incremental')} className="text-brand-600" />
                    <span className="text-sm">Incremental</span>
                  </label>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={runEncrypt}
                  onChange={(e) => setRunEncrypt(e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm text-gray-700">Encrypt backup file</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowRunDialog(false)}
                disabled={runningBackup}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRunBackup}
                disabled={runningBackup}
                className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {runningBackup ? 'Running backup...' : 'Start Backup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Dialog (typed confirmation) */}
      {restoreId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Restore Database</h3>
                <p className="text-sm text-gray-500">This action is irreversible</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-700">
                This will overwrite the current database with the selected backup. All data created after this backup will be permanently lost. This action cannot be undone.
              </p>
            </div>

            <p className="text-sm text-gray-700 mb-2">
              Type <span className="font-mono font-bold text-red-600">RESTORE</span> to confirm:
            </p>
            <input
              type="text"
              value={restoreConfirmText}
              onChange={(e) => setRestoreConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Type RESTORE"
              autoFocus
            />

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setRestoreId(null); setRestoreConfirmText(''); }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                disabled={restoreConfirmText !== 'RESTORE'}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Restore Database
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Backup"
        message="Are you sure you want to delete this backup? The backup file will also be removed. This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}