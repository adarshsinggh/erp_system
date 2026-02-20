// src/api/modules/sales-quotations.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface QuotationLine {
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
}

export interface Quotation {
  [key: string]: unknown;
  id: string;
  quotation_number: string;
  quotation_date: string;
  valid_until: string;
  customer_id: string;
  customer?: { id: string; customer_code: string; name: string; display_name: string; gstin: string };
  contact_person_id: string;
  billing_address_id: string;
  shipping_address_id: string;
  reference_number: string;
  status: string;
  subtotal: number;
  total_discount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  grand_total: number;
  currency_code: string;
  exchange_rate: number;
  terms_and_conditions: string;
  internal_notes: string;
  converted_to_so_id: string | null;
  created_at: string;
}

export interface QuotationDetail extends Quotation {
  lines: QuotationLine[];
}

export interface QuotationListParams extends ListParams {
  customer_id?: string;
  branch_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface ConvertToSOPayload {
  branch_id?: string;
  order_date?: string;
  expected_delivery_date?: string;
  customer_po_number?: string;
  payment_terms_days?: number;
  internal_notes?: string;
  line_warehouse_ids?: Record<string, string>;
}

// ─── API ────────────────────────────────────────────────────────

export const salesQuotationsApi = {
  list: (params?: QuotationListParams) =>
    apiClient.get<PaginatedResponse<Quotation>>('/sales-quotations', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<QuotationDetail>>(`/sales-quotations/${id}`),

  create: (data: { quotation_date: string; valid_until: string; customer_id: string; lines: Partial<QuotationLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<QuotationDetail>>('/sales-quotations', data),

  update: (id: string, data: Partial<Quotation> & { lines?: Partial<QuotationLine>[] }) =>
    apiClient.put<ApiResponse<QuotationDetail>>(`/sales-quotations/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/sales-quotations/${id}`),

  send: (id: string) =>
    apiClient.post<ApiResponse<Quotation>>(`/sales-quotations/${id}/send`),

  accept: (id: string) =>
    apiClient.post<ApiResponse<Quotation>>(`/sales-quotations/${id}/accept`),

  reject: (id: string) =>
    apiClient.post<ApiResponse<Quotation>>(`/sales-quotations/${id}/reject`),

  duplicate: (id: string) =>
    apiClient.post<ApiResponse<QuotationDetail>>(`/sales-quotations/${id}/duplicate`),

  convertToSO: (id: string, payload?: ConvertToSOPayload) =>
    apiClient.post<ApiResponse<{ sales_order_id: string }>>(`/sales-quotations/${id}/convert-to-so`, payload),
};