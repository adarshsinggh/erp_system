// src/api/modules/credit-notes.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface CreditNoteLine {
  id?: string;
  line_number?: number;
  product_id: string;
  product_code?: string;
  product_name?: string;
  description?: string;
  quantity: number;
  uom_id: string;
  uom_code?: string;
  unit_price: number;
  discount_amount?: number;
  line_subtotal?: number;
  hsn_code?: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  line_total?: number;
}

export interface ReturnItem {
  product_id: string;
  product_code?: string;
  product_name?: string;
  quantity: number;
  uom_id: string;
  uom_code?: string;
  warehouse_id: string;
}

export interface CreditNote {
  [key: string]: unknown;
  id: string;
  credit_note_number: string;
  credit_note_date: string;
  customer_id: string;
  customer?: { id: string; customer_code: string; name: string; display_name: string; gstin: string };
  invoice_id: string | null;
  invoice?: { id: string; invoice_number: string } | null;
  reason: string;
  reason_detail: string;
  subtotal: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  status: string;
  internal_notes: string;
  created_at: string;
}

export interface CreditNoteDetail extends CreditNote {
  lines?: CreditNoteLine[];
  return_items?: ReturnItem[];
}

export interface CreditNoteListParams extends ListParams {
  customer_id?: string;
  branch_id?: string;
  invoice_id?: string;
  reason?: string;
  from_date?: string;
  to_date?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const creditNotesApi = {
  list: (params?: CreditNoteListParams) =>
    apiClient.get<PaginatedResponse<CreditNote>>('/credit-notes', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<CreditNoteDetail>>(`/credit-notes/${id}`),

  create: (data: Record<string, unknown>) =>
    apiClient.post<ApiResponse<CreditNoteDetail>>('/credit-notes', data),

  createFromInvoice: (invoiceId: string, data?: Record<string, unknown>) =>
    apiClient.post<ApiResponse<CreditNoteDetail>>(`/credit-notes/from-invoice/${invoiceId}`, data),

  update: (id: string, data: Record<string, unknown>) =>
    apiClient.put<ApiResponse<CreditNoteDetail>>(`/credit-notes/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/credit-notes/${id}`),

  approve: (id: string) =>
    apiClient.post<ApiResponse<CreditNote>>(`/credit-notes/${id}/approve`),

  apply: (id: string) =>
    apiClient.post<ApiResponse<CreditNote>>(`/credit-notes/${id}/apply`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<CreditNote>>(`/credit-notes/${id}/cancel`),

  getInvoiceSummary: (invoiceId: string) =>
    apiClient.get<ApiResponse<CreditNote[]>>(`/credit-notes/invoice-summary/${invoiceId}`),
};