// src/pages/approvals/ApprovalHistoryModal.tsx
import React, { useState, useEffect } from 'react';
import {
  approvalsApi,
  ApprovalQueueEntry,
  ApprovalStatusSummary,
} from '@/api/modules/approvals.api';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from '@/components/shared/FormElements';
import { formatDateTime } from '@/lib/formatters';
import { APPROVAL_DOC_TYPES, APPROVAL_ACTIONS } from '@/lib/constants';

interface ApprovalHistoryModalProps {
  documentType: string;
  documentId: string;
  open: boolean;
  onClose: () => void;
}

export function ApprovalHistoryModal({
  documentType,
  documentId,
  open,
  onClose,
}: ApprovalHistoryModalProps) {
  const [status, setStatus] = useState<ApprovalStatusSummary | null>(null);
  const [history, setHistory] = useState<ApprovalQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      approvalsApi.engine.status(documentType, documentId),
      approvalsApi.engine.history(documentType, documentId),
    ])
      .then(([statusRes, historyRes]) => {
        setStatus(statusRes.data);
        setHistory(historyRes.data || []);
      })
      .catch((err: any) => {
        toast.error(err.message);
      })
      .finally(() => setLoading(false));
  }, [open, documentType, documentId]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const docTypeLabel = APPROVAL_DOC_TYPES[documentType]?.label || documentType;

  const overallStatusColor: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  };

  const actionIcon: Record<string, React.ReactNode> = {
    approved: (
      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    rejected: (
      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    pending: (
      <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    modified: (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  };

  const actionBorder: Record<string, string> = {
    approved: 'border-emerald-300',
    rejected: 'border-red-300',
    pending: 'border-dashed border-gray-300',
    modified: 'border-blue-300',
  };

  // Sort history by level then action time
  const sortedHistory = [...history].sort((a, b) => {
    if (a.approval_level !== b.approval_level) return a.approval_level - b.approval_level;
    if (a.action_at && b.action_at) return new Date(a.action_at).getTime() - new Date(b.action_at).getTime();
    return 0;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Approval History</h3>
            <p className="text-sm text-gray-500 mt-0.5">{docTypeLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-4">
              <div className="skeleton h-10 w-full rounded-lg" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="skeleton h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-32 rounded" />
                    <div className="skeleton h-3 w-24 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Overall Status */}
              {status && (
                <div
                  className={`flex items-center gap-3 p-3 rounded-lg border mb-5 ${
                    overallStatusColor[status.overall_status] || 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}
                >
                  <span className="text-sm font-medium">Overall Status:</span>
                  <StatusBadge status={status.overall_status} statusMap={APPROVAL_ACTIONS} size="md" />
                </div>
              )}

              {/* Step Indicator (compact) */}
              {status?.levels && status.levels.length > 0 && (
                <div className="flex items-center gap-1 mb-5">
                  {status.levels.map((level, idx) => (
                    <React.Fragment key={level.level}>
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 ${
                          level.action === 'approved'
                            ? 'bg-emerald-100 border-emerald-400 text-emerald-700'
                            : level.action === 'rejected'
                            ? 'bg-red-100 border-red-400 text-red-700'
                            : 'bg-gray-50 border-dashed border-gray-300 text-gray-400'
                        }`}
                        title={`Level ${level.level}: ${level.action}`}
                      >
                        {level.action === 'approved' ? '✓' : level.action === 'rejected' ? '✕' : level.level}
                      </div>
                      {idx < status.levels.length - 1 && (
                        <div
                          className={`flex-1 h-0.5 ${
                            level.action === 'approved' ? 'bg-emerald-300' : 'bg-gray-200'
                          }`}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Timeline */}
              {sortedHistory.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-500">No approval history found</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />

                  <div className="space-y-4">
                    {sortedHistory.map((entry, idx) => (
                      <div key={entry.id || idx} className="relative flex gap-3 pl-2">
                        {/* Icon circle */}
                        <div
                          className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 flex-shrink-0 ${
                            actionBorder[entry.action] || 'border-gray-300'
                          }`}
                        >
                          {actionIcon[entry.action] || (
                            <div className="w-2 h-2 rounded-full bg-gray-300" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 pb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                              Level {entry.approval_level}
                            </span>
                            <StatusBadge status={entry.action} statusMap={APPROVAL_ACTIONS} />
                          </div>

                          <div className="mt-1.5">
                            {entry.action === 'pending' ? (
                              <p className="text-sm text-gray-400 italic">Awaiting approval</p>
                            ) : (
                              <>
                                <p className="text-sm text-gray-700">
                                  {entry.approver_name || 'System'}
                                </p>
                                {entry.action_at && (
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {formatDateTime(entry.action_at)}
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                          {entry.comments && (
                            <div className="mt-1.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                              <p className="text-xs text-gray-600">{entry.comments}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}