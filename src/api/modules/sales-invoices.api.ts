// src/api/modules/sales-invoices.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface InvoiceLine {
  id?: string;
  line_number: number;
  product_id: string;
  product_code?: string;
  product_name?: string;
  description: string;
  quantity: number;
  uom_id: string;
  uom_code?: string;
  unit_price: number;
  discount_type: 'percentage' | 'amount';
  discount_value: number;
  discount_amount?: number;
  line_subtotal?: number;
  hsn_code: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  line_total?: number;
  sales_order_line_id?: string;
  warehouse_id?: string;
}

export interface InvoicePayment {
  id: string;
  receipt_number: string;
  amount: number;
  receipt_date: string;
  payment_mode: string;
}

export interface SalesInvoice {
  [key: string]: unknown;
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_id: string;
  customer?: { id: string; customer_code: string; name: string; display_name: string; gstin: string };
  sales_order_id: string | null;
  place_of_supply: string;
  is_reverse_charge: boolean;
  tcs_rate: number;
  tcs_amount: number;
  status: string;
  subtotal: number;
  total_discount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  irn: string | null;
  irn_date: string | null;
  currency_code: string;
  exchange_rate: number;
  terms_and_conditions: string;
  internal_notes: string;
  created_at: string;
}

export interface SalesInvoiceDetail extends SalesInvoice {
  lines: InvoiceLine[];
  payments: InvoicePayment[];
}

export interface InvoiceListParams extends ListParams {
  customer_id?: string;
  branch_id?: string;
  sales_order_id?: string;
  from_date?: string;
  to_date?: string;
  overdue_only?: boolean;
}

export interface CustomerOutstanding {
  customer_id: string;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  overdue_amount: number;
  invoice_count: number;
}

// ─── API ────────────────────────────────────────────────────────

export const salesInvoicesApi = {
  list: (params?: InvoiceListParams) =>
    apiClient.get<PaginatedResponse<SalesInvoice>>('/sales-invoices', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<SalesInvoiceDetail>>(`/sales-invoices/${id}`),

  create: (data: { invoice_date: string; customer_id: string; lines: Partial<InvoiceLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<SalesInvoiceDetail>>('/sales-invoices', data),

  createFromSO: (salesOrderId: string, data?: Record<string, unknown>) =>
    apiClient.post<ApiResponse<SalesInvoiceDetail>>(`/sales-invoices/from-so/${salesOrderId}`, data),

  update: (id: string, data: Partial<SalesInvoice> & { lines?: Partial<InvoiceLine>[] }) =>
    apiClient.put<ApiResponse<SalesInvoiceDetail>>(`/sales-invoices/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/sales-invoices/${id}`),

  approve: (id: string) =>
    apiClient.post<ApiResponse<SalesInvoice>>(`/sales-invoices/${id}/approve`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<SalesInvoice>>(`/sales-invoices/${id}/cancel`),

  setIrn: (id: string, data: { irn: string; irn_date: string }) =>
    apiClient.post<ApiResponse<SalesInvoice>>(`/sales-invoices/${id}/set-irn`, data),

  markOverdue: (id: string) =>
    apiClient.post<ApiResponse<SalesInvoice>>(`/sales-invoices/${id}/mark-overdue`),

  getCustomerOutstanding: (customerId: string) =>
    apiClient.get<ApiResponse<CustomerOutstanding>>(`/sales-invoices/customer-outstanding/${customerId}`),
};