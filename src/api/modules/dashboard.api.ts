import apiClient, { ApiResponse } from '../client';

export interface DashboardData {
  kpis: Record<string, unknown>;
  widgets: unknown[];
  quick_actions: unknown[];
  pending_approvals: unknown[];
  notifications: unknown[];
  recent_activity: unknown[];
}

export interface ShortcutGroup {
  key: string;
  action: string;
  label: string;
}

export const dashboardApi = {
  getDashboard: () =>
    apiClient.get<ApiResponse<DashboardData>>('/dashboard'),

  getShortcuts: () =>
    apiClient.get<ApiResponse<Record<string, ShortcutGroup[]>>>('/shortcuts'),

  updateShortcuts: (shortcuts: Record<string, ShortcutGroup[]>) =>
    apiClient.put<ApiResponse<Record<string, ShortcutGroup[]>>>('/shortcuts', shortcuts),

  resetShortcuts: () =>
    apiClient.post<ApiResponse<Record<string, ShortcutGroup[]>>>('/shortcuts/reset'),
};
