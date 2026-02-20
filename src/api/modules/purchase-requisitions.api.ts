// src/api/modules/purchase-requisitions.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface PurchaseRequisitionLine {
  id?: string;
  requisition_id?: string;
  line_number: number;
  item_id: string;
  item_code?: string;
  item_name?: string;
  description: string;
  quantity: number;
  uom_id: string;
  uom_code?: string;
  preferred_vendor_id: string | null;
  preferred_vendor_name?: string;
  estimated_price: number;
  notes: string;
}

export interface PurchaseRequisition {
  [key: string]: unknown;
  id: string;
  requisition_number: string;
  requisition_date: string;
  required_by_date: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  source: 'manual' | 'auto_reorder' | 'work_order';
  source_reference_id: string | null;
  purpose: string;
  status: string;
  branch_id: string;
  requested_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface PurchaseRequisitionDetail extends PurchaseRequisition {
  lines: PurchaseRequisitionLine[];
  branch?: { id: string; name: string };
  requested_by_user?: { id: string; full_name: string };
}

export interface PurchaseRequisitionListParams extends ListParams {
  priority?: string;
  source?: string;
  branch_id?: string;
  from_date?: string;
  to_date?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const purchaseRequisitionsApi = {
  list: (params?: PurchaseRequisitionListParams) =>
    apiClient.get<PaginatedResponse<PurchaseRequisition>>('/purchase-requisitions', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<PurchaseRequisitionDetail>>(`/purchase-requisitions/${id}`),

  create: (data: { requisition_date: string; lines: Partial<PurchaseRequisitionLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<PurchaseRequisitionDetail>>('/purchase-requisitions', data),

  update: (id: string, data: Partial<PurchaseRequisition> & { lines?: Partial<PurchaseRequisitionLine>[] }) =>
    apiClient.put<ApiResponse<PurchaseRequisitionDetail>>(`/purchase-requisitions/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/purchase-requisitions/${id}`),

  submit: (id: string) =>
    apiClient.post<ApiResponse<PurchaseRequisition>>(`/purchase-requisitions/${id}/submit`),

  approve: (id: string) =>
    apiClient.post<ApiResponse<PurchaseRequisition>>(`/purchase-requisitions/${id}/approve`),

  reject: (id: string, reason: string) =>
    apiClient.post<ApiResponse<PurchaseRequisition>>(`/purchase-requisitions/${id}/reject`, { reason }),

  convertToPO: (id: string, overrides?: Record<string, unknown>) =>
    apiClient.post<ApiResponse<unknown>>(`/purchase-requisitions/${id}/convert-to-po`, overrides),
};