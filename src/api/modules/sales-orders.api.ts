// src/api/modules/sales-orders.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface SalesOrderLine {
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
  discount_type: 'percentage' | 'fixed';
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
  warehouse_id: string;
  delivered_quantity?: number;
}

export interface SalesOrder {
  [key: string]: unknown;
  id: string;
  order_number: string;
  order_date: string;
  expected_delivery_date: string;
  customer_id: string;
  customer?: { id: string; customer_code: string; name: string; display_name: string; gstin: string };
  customer_po_number: string;
  quotation_id: string | null;
  quotation?: { id: string; quotation_number: string } | null;
  payment_terms_days: number;
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
  created_at: string;
}

export interface SalesOrderDetail extends SalesOrder {
  lines: SalesOrderLine[];
}

export interface SalesOrderListParams extends ListParams {
  customer_id?: string;
  branch_id?: string;
  from_date?: string;
  to_date?: string;
  quotation_id?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const salesOrdersApi = {
  list: (params?: SalesOrderListParams) =>
    apiClient.get<PaginatedResponse<SalesOrder>>('/sales-orders', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<SalesOrderDetail>>(`/sales-orders/${id}`),

  create: (data: { order_date: string; customer_id: string; lines: Partial<SalesOrderLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<SalesOrderDetail>>('/sales-orders', data),

  createFromQuotation: (quotationId: string, data?: Record<string, unknown>) =>
    apiClient.post<ApiResponse<SalesOrderDetail>>(`/sales-orders/from-quotation/${quotationId}`, data),

  update: (id: string, data: Partial<SalesOrder> & { lines?: Partial<SalesOrderLine>[] }) =>
    apiClient.put<ApiResponse<SalesOrderDetail>>(`/sales-orders/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/sales-orders/${id}`),

  confirm: (id: string) =>
    apiClient.post<ApiResponse<SalesOrder>>(`/sales-orders/${id}/confirm`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<SalesOrder>>(`/sales-orders/${id}/cancel`),

  close: (id: string) =>
    apiClient.post<ApiResponse<SalesOrder>>(`/sales-orders/${id}/close`),
};