import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { dashboardApi, DashboardData } from '../../api/modules/dashboard.api';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { StatusBadge } from '../../components/shared/StatusBadge';
import { formatRelativeDate } from '../../lib/formatters';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const res = await dashboardApi.getDashboard();
      setData(res.data);
    } catch {
      // Dashboard might fail if no data yet
    } finally {
      setLoading(false);
    }
  }

  // Quick action config based on role
  const quickActions = [
    { label: 'New Quotation', path: '/sales/quotations/new', color: 'bg-blue-500' },
    { label: 'New Sales Order', path: '/sales/orders/new', color: 'bg-indigo-500' },
    { label: 'New Purchase Order', path: '/purchase/orders/new', color: 'bg-purple-500' },
    { label: 'New Work Order', path: '/manufacturing/work-orders/new', color: 'bg-orange-500' },
    { label: 'Stock Summary', path: '/inventory/stock', color: 'bg-emerald-500' },
    { label: 'Pending Approvals', path: '/approvals', color: 'bg-amber-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Welcome back, {user?.fullName?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Here's what's happening at {user?.companyName || 'your company'} today.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="skeleton h-3 w-24 rounded mb-3" />
              <div className="skeleton h-6 w-32 rounded mb-2" />
              <div className="skeleton h-2.5 w-20 rounded" />
            </div>
          ))
        ) : (
          <>
            <KPICard label="Revenue (This Month)" value={data?.kpis?.revenue_this_month} prefix="₹" />
            <KPICard label="Outstanding Receivables" value={data?.kpis?.outstanding_receivables} prefix="₹" warning />
            <KPICard label="Inventory Value" value={data?.kpis?.total_inventory_value} prefix="₹" />
            <KPICard label="Low Stock Items" value={data?.kpis?.low_stock_items} />
          </>
        )}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center gap-2 p-4 bg-white border border-gray-200 rounded-xl hover:border-brand-300 hover:shadow-sm transition-all group"
            >
              <div className={`w-10 h-10 ${action.color} rounded-lg flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform`}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-xs font-medium text-gray-700 text-center">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Approvals */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Pending Approvals</h2>
            <button
              onClick={() => navigate('/approvals')}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              View all →
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton w-20 h-4 rounded" />
                  <div className="skeleton flex-1 h-4 rounded" />
                  <div className="skeleton w-16 h-4 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {(data?.pending_approvals || []).slice(0, 5).map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{item.document_number || `#${i + 1}`}</span>
                    <span className="text-xs text-gray-500 ml-2">{item.document_type}</span>
                  </div>
                  <AmountDisplay value={item.amount} className="text-sm" />
                </div>
              ))}
              {(!data?.pending_approvals || data.pending_approvals.length === 0) && (
                <p className="text-sm text-gray-400 py-4 text-center">No pending approvals</p>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Activity</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <div className="skeleton h-3 w-3/4 rounded" />
                    <div className="skeleton h-2.5 w-1/3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.recent_activity || []).slice(0, 5).map((item: any, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-2xs font-medium text-gray-500">{item.user_initials || 'U'}</span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-700">{item.description || 'Activity'}</p>
                    <p className="text-2xs text-gray-400">{formatRelativeDate(item.created_at)}</p>
                  </div>
                </div>
              ))}
              {(!data?.recent_activity || data.recent_activity.length === 0) && (
                <p className="text-sm text-gray-400 py-4 text-center">No recent activity</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────
function KPICard({ label, value, prefix, trend, warning }: {
  label: string; value: any; prefix?: string; trend?: string; warning?: boolean;
}) {
  const hasValue = value !== undefined && value !== null;
  const display = hasValue
    ? (prefix === '₹' ? <AmountDisplay value={value} compact className="text-2xl font-bold text-gray-900" /> : <span className="text-2xl font-bold text-gray-900">{value}</span>)
    : <span className="text-2xl font-bold text-gray-300">—</span>;

  return (
    <div className={`bg-white rounded-xl border p-5 ${warning ? 'border-amber-200' : 'border-gray-200'}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        {display}
        {trend && hasValue && value > 0 && (
          <span className="text-xs font-medium text-emerald-600 mb-1">{trend}</span>
        )}
      </div>
    </div>
  );
}
