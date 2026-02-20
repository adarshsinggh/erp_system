// src/api/modules/system.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export type AlertType = 'low_stock' | 'overstock' | 'payment_due' | 'approval_pending' | 'consumption_anomaly';
export type NotificationType = 'alert' | 'reminder' | 'system';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';
export type BackupStatus = 'running' | 'completed' | 'failed';
export type BackupType = 'full' | 'incremental';

export interface AlertRule {
  [key: string]: unknown;
  id: string;
  company_id: string;
  name: string;
  alert_type: AlertType;
  entity_type?: string | null;
  entity_id?: string | null;
  condition_json: Record<string, any>;
  notify_role_ids?: string[];
  notify_user_ids?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface AlertRuleListParams extends ListParams {
  alert_type?: string;
}

export interface EvaluationResult {
  rules_evaluated: number;
  rules_triggered: number;
  total_notifications: number;
  results: { rule_id: string; rule_name: string; triggered: boolean; notifications_created: number }[];
}

export interface Notification {
  [key: string]: unknown;
  id: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  priority: NotificationPriority;
  reference_type?: string;
  reference_id?: string;
  is_read: boolean;
  read_at?: string;
  is_dismissed: boolean;
  created_at: string;
}

export interface NotificationListParams {
  [key: string]: unknown;
  filter?: 'unread' | 'read' | 'all';
  notification_type?: string;
  priority?: string;
  page?: number;
  limit?: number;
}

export interface UnreadCount {
  [key: string]: unknown;
  unread_count: number;
  by_priority: Record<string, number>;
}

export interface BackupRecord {
  [key: string]: unknown;
  id: string;
  backup_type: BackupType;
  status: BackupStatus;
  file_path: string;
  file_size: number;
  file_size_mb?: string;
  is_encrypted: boolean;
  checksum?: string;
  started_at: string;
  completed_at?: string;
  error_message?: string;
  created_by_name?: string;
  file_exists: boolean;
}

export interface BackupVerification {
  [key: string]: unknown;
  backup_id: string;
  file_exists: boolean;
  checksum_match: boolean;
  is_valid: boolean;
  file_size: number;
}

export interface BackupListParams {
  [key: string]: unknown;
  status?: string;
  backup_type?: string;
  page?: number;
  limit?: number;
}

// ─── API ────────────────────────────────────────────────────────

export const systemApi = {
  // ── Alert Rules CRUD ───────────────────────────────
  alertRules: {
    list: (params?: AlertRuleListParams) =>
      apiClient.get<PaginatedResponse<AlertRule>>('/alert-rules', params),

    getById: (id: string) =>
      apiClient.get<ApiResponse<AlertRule>>(`/alert-rules/${id}`),

    create: (data: {
      name: string;
      alert_type: AlertType;
      entity_type?: string | null;
      entity_id?: string | null;
      condition_json: Record<string, any>;
      notify_role_ids?: string[];
      notify_user_ids?: string[];
      is_active?: boolean;
    }) =>
      apiClient.post<ApiResponse<AlertRule>>('/alert-rules', data),

    update: (id: string, data: {
      name?: string;
      alert_type?: AlertType;
      entity_type?: string | null;
      entity_id?: string | null;
      condition_json?: Record<string, any>;
      notify_role_ids?: string[];
      notify_user_ids?: string[];
      is_active?: boolean;
    }) =>
      apiClient.put<ApiResponse<AlertRule>>(`/alert-rules/${id}`, data),

    delete: (id: string) =>
      apiClient.del<ApiResponse<null>>(`/alert-rules/${id}`),

    evaluate: () =>
      apiClient.post<ApiResponse<EvaluationResult>>('/alert-rules/evaluate'),
  },

  // ── Notifications ──────────────────────────────────
  notifications: {
    list: (params?: NotificationListParams) =>
      apiClient.get<PaginatedResponse<Notification>>('/notifications', params),

    unreadCount: () =>
      apiClient.get<ApiResponse<UnreadCount>>('/notifications/unread-count'),

    markRead: (id: string) =>
      apiClient.put<ApiResponse<Notification>>(`/notifications/${id}/read`),

    markAllRead: () =>
      apiClient.put<ApiResponse<null>>('/notifications/read-all'),

    dismiss: (id: string) =>
      apiClient.put<ApiResponse<Notification>>(`/notifications/${id}/dismiss`),

    dismissAll: () =>
      apiClient.put<ApiResponse<null>>('/notifications/dismiss-all'),
  },

  // ── Backups ────────────────────────────────────────
  backups: {
    list: (params?: BackupListParams) =>
      apiClient.get<PaginatedResponse<BackupRecord>>('/backups', params),

    run: (data?: { backup_type?: BackupType; encrypt?: boolean }) =>
      apiClient.post<ApiResponse<BackupRecord>>('/backups/run', data),

    restore: (id: string) =>
      apiClient.post<ApiResponse<null>>(`/backups/${id}/restore`),

    verify: (id: string) =>
      apiClient.get<ApiResponse<BackupVerification>>(`/backups/${id}/verify`),

    delete: (id: string) =>
      apiClient.del<ApiResponse<null>>(`/backups/${id}`),
  },
};