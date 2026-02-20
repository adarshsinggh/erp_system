// src/api/modules/vendor-payments.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface VendorPayment {
  [key: string]: unknown;
  id: string;
  payment_number: string;
  payment_date: string;
  vendor_id: string;
  vendor?: { id: string; vendor_code: string; name: string; display_name: string };
  amount: number;
  payment_mode: 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'card';
  bank_account_id: string | null;
  cheque_number: string | null;
  cheque_date: string | null;
  transaction_reference: string | null;
  vendor_bill_id: string | null;
  vendor_bill?: { id: string; bill_number: string; grand_total: number; amount_due: number } | null;
  tds_deducted: number;
  narration: string;
  is_advance: boolean;
  status: string;
  created_at: string;
}

export interface VendorPaymentDetail extends VendorPayment {}

export interface VendorPaymentListParams extends ListParams {
  vendor_id?: string;
  payment_mode?: string;
  vendor_bill_id?: string;
  is_advance?: boolean;
  from_date?: string;
  to_date?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const vendorPaymentsApi = {
  list: (params?: VendorPaymentListParams) =>
    apiClient.get<PaginatedResponse<VendorPayment>>('/vendor-payments', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<VendorPaymentDetail>>(`/vendor-payments/${id}`),

  create: (data: { payment_date: string; vendor_id: string; amount: number; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<VendorPaymentDetail>>('/vendor-payments', data),

  update: (id: string, data: Partial<VendorPayment>) =>
    apiClient.put<ApiResponse<VendorPaymentDetail>>(`/vendor-payments/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/vendor-payments/${id}`),

  confirm: (id: string) =>
    apiClient.post<ApiResponse<VendorPayment>>(`/vendor-payments/${id}/confirm`),

  bounce: (id: string) =>
    apiClient.post<ApiResponse<VendorPayment>>(`/vendor-payments/${id}/bounce`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<VendorPayment>>(`/vendor-payments/${id}/cancel`),
};