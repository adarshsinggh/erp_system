// src/api/modules/approvals.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export type ApprovalDocumentType =
  | 'sales_order' | 'sales_invoice' | 'purchase_requisition' | 'purchase_order'
  | 'stock_adjustment' | 'stock_transfer' | 'work_order' | 'credit_note'
  | 'debit_note' | 'payment_receipt' | 'payment_made' | 'journal_entry';

export type ApprovalAction = 'pending' | 'approved' | 'rejected' | 'modified';

export interface ApprovalMatrixRule {
  [key: string]: unknown;
  id: string;
  company_id: string;
  document_type: ApprovalDocumentType;
  min_amount: number;
  max_amount: number | null;
  approver_role_id: string;
  approver_role_name?: string;
  approval_level: number;
  is_mandatory: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ApprovalQueueEntry {
  [key: string]: unknown;
  id: string;
  company_id: string;
  document_type: ApprovalDocumentType;
  document_id: string;
  document_number?: string;
  requested_by: string;
  requested_by_name?: string;
  requested_at: string;
  approver_id?: string;
  approver_name?: string;
  approval_level: number;
  action: ApprovalAction;
  action_at?: string;
  comments?: string;
  amount: number;
}

export interface ApprovalDashboardStats {
  pending_count: number;
  approved_today: number;
  rejected_today: number;
  by_document_type: { document_type: string; count: number }[];
}

export interface ApprovalStatusSummary {
  document_type: string;
  document_id: string;
  overall_status: 'pending' | 'approved' | 'rejected';
  levels: {
    level: number;
    action: ApprovalAction;
    approver_name?: string;
    action_at?: string;
    comments?: string;
  }[];
}

export interface MatrixListParams extends ListParams {
  document_type?: string;
}

export interface PendingListParams {
  [key: string]: unknown;
  document_type?: string;
  page?: number;
  limit?: number;
}

// ─── API ────────────────────────────────────────────────────────

export const approvalsApi = {
  // ── Matrix (Configuration CRUD) ────────────────────────
  matrix: {
    list: (params?: MatrixListParams) =>
      apiClient.get<PaginatedResponse<ApprovalMatrixRule>>('/approval-matrix', params),

    getById: (id: string) =>
      apiClient.get<ApiResponse<ApprovalMatrixRule>>(`/approval-matrix/${id}`),

    create: (data: {
      document_type: ApprovalDocumentType;
      min_amount: number;
      max_amount?: number | null;
      approver_role_id: string;
      approval_level: number;
      is_mandatory?: boolean;
      is_active?: boolean;
    }) =>
      apiClient.post<ApiResponse<ApprovalMatrixRule>>('/approval-matrix', data),

    update: (id: string, data: {
      min_amount?: number;
      max_amount?: number | null;
      approver_role_id?: string;
      approval_level?: number;
      is_mandatory?: boolean;
      is_active?: boolean;
    }) =>
      apiClient.put<ApiResponse<ApprovalMatrixRule>>(`/approval-matrix/${id}`, data),

    delete: (id: string) =>
      apiClient.del<ApiResponse<null>>(`/approval-matrix/${id}`),
  },

  // ── Engine (Runtime) ───────────────────────────────────
  engine: {
    submit: (data: {
      document_type: ApprovalDocumentType;
      document_id: string;
      document_number?: string;
      amount: number;
    }) =>
      apiClient.post<ApiResponse<ApprovalQueueEntry[]>>('/approvals/submit', data),

    pending: (params?: PendingListParams) =>
      apiClient.get<PaginatedResponse<ApprovalQueueEntry>>('/approvals/pending', params),

    approve: (id: string, data?: { comments?: string }) =>
      apiClient.post<ApiResponse<{ is_final_approval: boolean; message: string }>>(`/approvals/${id}/approve`, data),

    reject: (id: string, data?: { comments?: string }) =>
      apiClient.post<ApiResponse<{ message: string }>>(`/approvals/${id}/reject`, data),

    history: (documentType: string, documentId: string) =>
      apiClient.get<ApiResponse<ApprovalQueueEntry[]>>(`/approvals/history/${documentType}/${documentId}`),

    status: (documentType: string, documentId: string) =>
      apiClient.get<ApiResponse<ApprovalStatusSummary>>(`/approvals/status/${documentType}/${documentId}`),

    dashboard: () =>
      apiClient.get<ApiResponse<ApprovalDashboardStats>>('/approvals/dashboard'),
  },
};