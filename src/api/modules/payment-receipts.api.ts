// src/api/modules/payment-receipts.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface PaymentReceipt {
  [key: string]: unknown;
  id: string;
  receipt_number: string;
  receipt_date: string;
  customer_id: string;
  customer?: { id: string; customer_code: string; name: string; display_name: string };
  invoice_id: string | null;
  invoice?: { id: string; invoice_number: string; grand_total: number; amount_due: number } | null;
  amount: number;
  payment_mode: string;
  bank_account_id: string | null;
  cheque_number: string | null;
  cheque_date: string | null;
  transaction_reference: string | null;
  tds_deducted: number;
  net_amount: number;
  status: string;
  narration: string;
  is_advance: boolean;
  created_at: string;
}

export interface PaymentReceiptListParams extends ListParams {
  customer_id?: string;
  branch_id?: string;
  invoice_id?: string;
  payment_mode?: string;
  from_date?: string;
  to_date?: string;
  is_advance?: boolean;
}

export interface CustomerPaymentHistory {
  receipt_number: string;
  receipt_date: string;
  amount: number;
  payment_mode: string;
  invoice_number: string | null;
  status: string;
}

export interface UnallocatedPayment {
  id: string;
  receipt_number: string;
  receipt_date: string;
  amount: number;
  net_amount: number;
  payment_mode: string;
}

// ─── API ────────────────────────────────────────────────────────

export const paymentReceiptsApi = {
  list: (params?: PaymentReceiptListParams) =>
    apiClient.get<PaginatedResponse<PaymentReceipt>>('/payment-receipts', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<PaymentReceipt>>(`/payment-receipts/${id}`),

  create: (data: Record<string, unknown>) =>
    apiClient.post<ApiResponse<PaymentReceipt>>('/payment-receipts', data),

  update: (id: string, data: Record<string, unknown>) =>
    apiClient.put<ApiResponse<PaymentReceipt>>(`/payment-receipts/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/payment-receipts/${id}`),

  confirm: (id: string) =>
    apiClient.post<ApiResponse<PaymentReceipt>>(`/payment-receipts/${id}/confirm`),

  bounce: (id: string) =>
    apiClient.post<ApiResponse<PaymentReceipt>>(`/payment-receipts/${id}/bounce`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<PaymentReceipt>>(`/payment-receipts/${id}/cancel`),

  getCustomerHistory: (customerId: string) =>
    apiClient.get<ApiResponse<CustomerPaymentHistory[]>>(`/payment-receipts/customer-history/${customerId}`),

  getUnallocated: (customerId: string) =>
    apiClient.get<ApiResponse<UnallocatedPayment[]>>(`/payment-receipts/advances/${customerId}`),

  allocate: (id: string, data: { invoice_id: string }) =>
    apiClient.post<ApiResponse<PaymentReceipt>>(`/payment-receipts/${id}/allocate`, data),
};