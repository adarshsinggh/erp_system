// src/api/modules/purchase-orders.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface PurchaseOrderLine {
  id?: string;
  purchase_order_id?: string;
  line_number: number;
  item_id: string;
  item_code?: string;
  item_name?: string;
  description: string;
  quantity: number;
  received_quantity?: number;
  billed_quantity?: number;
  uom_id: string;
  uom_code?: string;
  unit_price: number;
  discount_amount: number;
  taxable_amount?: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total_amount?: number;
  hsn_code: string;
  requisition_line_id?: string;
  warehouse_id?: string;
}

export interface PurchaseOrder {
  [key: string]: unknown;
  id: string;
  po_number: string;
  po_date: string;
  expected_delivery_date: string;
  vendor_id: string;
  vendor?: { id: string; vendor_code: string; name: string; display_name: string; gstin: string };
  requisition_id: string | null;
  requisition?: { id: string; requisition_number: string } | null;
  warehouse_id: string;
  currency_code: string;
  exchange_rate: number;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  grand_total: number;
  round_off: number;
  payment_terms_days: number;
  terms_and_conditions: string;
  internal_notes: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: PurchaseOrderLine[];
  branch?: { id: string; name: string };
}

export interface PurchaseOrderListParams extends ListParams {
  vendor_id?: string;
  branch_id?: string;
  from_date?: string;
  to_date?: string;
  requisition_id?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const purchaseOrdersApi = {
  list: (params?: PurchaseOrderListParams) =>
    apiClient.get<PaginatedResponse<PurchaseOrder>>('/purchase-orders', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<PurchaseOrderDetail>>(`/purchase-orders/${id}`),

  create: (data: { po_date: string; vendor_id: string; lines: Partial<PurchaseOrderLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<PurchaseOrderDetail>>('/purchase-orders', data),

  update: (id: string, data: Partial<PurchaseOrder> & { lines?: Partial<PurchaseOrderLine>[] }) =>
    apiClient.put<ApiResponse<PurchaseOrderDetail>>(`/purchase-orders/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/purchase-orders/${id}`),

  approve: (id: string) =>
    apiClient.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/approve`),

  send: (id: string) =>
    apiClient.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/send`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/cancel`),

  close: (id: string) =>
    apiClient.post<ApiResponse<PurchaseOrder>>(`/purchase-orders/${id}/close`),

  createFromRequisition: (requisitionId: string, overrides?: Record<string, unknown>) =>
    apiClient.post<ApiResponse<PurchaseOrderDetail>>('/purchase-orders/from-requisition', { requisition_id: requisitionId, ...overrides }),
};