// src/pages/system/NotificationsPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { systemApi, Notification, NotificationListParams } from '@/api/modules/system.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { toast } from '@/components/shared/FormElements';
import { NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES } from '@/lib/constants';
import { formatRelativeDate } from '@/lib/formatters';

const FILTER_TABS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
] as const;

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'alert', label: 'Alert' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'system', label: 'System' },
];

const priorityOptions = [
  { value: '', label: 'All Priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const PRIORITY_STRIPE: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  normal: 'bg-blue-500',
  low: 'bg-gray-300',
};

const REFERENCE_ROUTES: Record<string, string> = {
  low_stock: '/inventory/stock',
  overstock: '/inventory/stock',
  payment_due: '/reports/viewer',
  approval_pending: '/approvals',
  consumption_anomaly: '/reports/insights',
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const limit = 20;

  useEffect(() => {
    loadNotifications();
  }, [filter, typeFilter, priorityFilter, page]);

  useEffect(() => {
    loadUnreadCount();
  }, []);

  async function loadUnreadCount() {
    try {
      const res = await systemApi.notifications.unreadCount();
      setUnreadCount(res.data.unread_count);
    } catch { /* ignore */ }
  }

  async function loadNotifications() {
    setLoading(true);
    try {
      const params: NotificationListParams = {
        filter: filter === 'all' ? undefined : filter,
        notification_type: typeFilter || undefined,
        priority: priorityFilter || undefined,
        page,
        limit,
      };
      const res = await systemApi.notifications.list(params);
      setNotifications(res.data || []);
      setTotal(res.total);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await systemApi.notifications.markRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDismiss(id: string) {
    try {
      await systemApi.notifications.dismiss(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification dismissed');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleMarkAllRead() {
    try {
      await systemApi.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDismissAll() {
    try {
      await systemApi.notifications.dismissAll();
      setNotifications([]);
      setTotal(0);
      setUnreadCount(0);
      toast.success('All notifications dismissed');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function navigateToReference(n: Notification) {
    const route = n.reference_type ? REFERENCE_ROUTES[n.reference_type] : null;
    if (route) navigate(route);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
        actions={[
          { label: 'Mark All Read', variant: 'secondary', onClick: handleMarkAllRead },
          { label: 'Dismiss All', variant: 'secondary', onClick: handleDismissAll },
        ]}
      />

      {/* Filter Tabs + Dropdowns */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setFilter(tab.value); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === tab.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
        >
          {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
        >
          {priorityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Notification Cards */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex gap-3">
                <div className="skeleton w-1 h-12 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-48 rounded" />
                  <div className="skeleton h-3 w-72 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-20">
          <svg className="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-400">No notifications</h3>
          <p className="text-sm text-gray-400 mt-1">All clear! Nothing to see here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const isExpanded = expandedIds.has(n.id);
            const isLong = n.message && n.message.length > 120;
            const displayMessage = isLong && !isExpanded ? n.message.slice(0, 120) + '…' : n.message;

            return (
              <div
                key={n.id}
                className={`bg-white rounded-xl border transition-all ${
                  n.is_read ? 'border-gray-200' : 'border-blue-200 bg-blue-50/30'
                }`}
              >
                <div className="flex">
                  {/* Priority stripe */}
                  <div className={`w-1 rounded-l-xl flex-shrink-0 ${PRIORITY_STRIPE[n.priority] || 'bg-gray-300'}`} />

                  <div className="flex-1 p-4">
                    <div className="flex items-start gap-3">
                      {/* Unread dot */}
                      <div className="mt-1.5 flex-shrink-0">
                        {!n.is_read && <span className="block w-2 h-2 bg-blue-500 rounded-full" />}
                        {n.is_read && <span className="block w-2 h-2" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm ${n.is_read ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                            {n.title}
                          </span>
                          <StatusBadge status={n.notification_type} statusMap={NOTIFICATION_TYPES} />
                          <StatusBadge status={n.priority} statusMap={NOTIFICATION_PRIORITIES} />
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {displayMessage}
                          {isLong && (
                            <button onClick={() => toggleExpand(n.id)} className="ml-1 text-brand-600 hover:underline text-xs">
                              {isExpanded ? 'show less' : 'show more'}
                            </button>
                          )}
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{formatRelativeDate(n.created_at)}</span>
                          {!n.is_read && (
                            <button
                              onClick={() => handleMarkRead(n.id)}
                              className="text-xs text-brand-600 hover:underline"
                            >
                              Mark Read
                            </button>
                          )}
                          {n.is_read && <span className="text-xs text-gray-300">Read</span>}
                          <button
                            onClick={() => handleDismiss(n.id)}
                            className="text-xs text-gray-400 hover:text-red-500"
                          >
                            Dismiss
                          </button>
                          {n.reference_type && REFERENCE_ROUTES[n.reference_type] && (
                            <button
                              onClick={() => navigateToReference(n)}
                              className="text-xs text-brand-600 hover:underline"
                            >
                              View Details →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
          <span>Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}