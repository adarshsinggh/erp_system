// src/api/modules/debit-notes.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface DebitNote {
  [key: string]: unknown;
  id: string;
  debit_note_number: string;
  debit_note_date: string;
  vendor_id: string;
  vendor?: { id: string; vendor_code: string; name: string; display_name: string };
  vendor_bill_id: string | null;
  vendor_bill?: { id: string; bill_number: string } | null;
  reason: 'return' | 'pricing_error' | 'quality' | 'shortage';
  reason_detail: string;
  subtotal: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  grand_total: number;
  status: string;
  created_at: string;
}

export interface DebitNoteLine {
  id: string;
  item_id: string;
  item_code?: string;
  item_name?: string;
  description: string;
  quantity: number;
  uom_id: string;
  uom_code?: string;
  unit_price: number;
  hsn_code: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  line_total?: number;
}

export interface DebitNoteDetail extends DebitNote {
  lines: DebitNoteLine[];
}

export interface DebitNoteListParams extends ListParams {
  vendor_id?: string;
  reason?: string;
  from_date?: string;
  to_date?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const debitNotesApi = {
  list: (params?: DebitNoteListParams) =>
    apiClient.get<PaginatedResponse<DebitNote>>('/debit-notes', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<DebitNoteDetail>>(`/debit-notes/${id}`),

  create: (data: { debit_note_date: string; vendor_id: string; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<DebitNoteDetail>>('/debit-notes', data),

  update: (id: string, data: Partial<DebitNote>) =>
    apiClient.put<ApiResponse<DebitNoteDetail>>(`/debit-notes/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/debit-notes/${id}`),

  approve: (id: string) =>
    apiClient.post<ApiResponse<DebitNote>>(`/debit-notes/${id}/approve`),

  apply: (id: string) =>
    apiClient.post<ApiResponse<DebitNote>>(`/debit-notes/${id}/apply`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<DebitNote>>(`/debit-notes/${id}/cancel`),
};