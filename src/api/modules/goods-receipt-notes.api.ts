// src/api/modules/goods-receipt-notes.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface GRNLine {
  id?: string;
  grn_id?: string;
  line_number: number;
  po_line_id?: string;
  item_id: string;
  item_code?: string;
  item_name?: string;
  ordered_quantity: number;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  uom_id: string;
  uom_code?: string;
  batch_number: string;
  serial_numbers: string;
  expiry_date: string | null;
  rejection_reason: string;
  remarks: string;
}

export interface GoodsReceiptNote {
  [key: string]: unknown;
  id: string;
  grn_number: string;
  grn_date: string;
  purchase_order_id: string;
  vendor_id: string;
  vendor?: { id: string; vendor_code: string; name: string; display_name: string };
  warehouse_id: string;
  vendor_challan_no: string;
  vendor_challan_date: string;
  vehicle_number: string;
  received_by: string;
  inspection_status: 'pending' | 'passed' | 'failed' | 'partial';
  remarks: string;
  status: string;
  created_at: string;
}

export interface GRNDetail extends GoodsReceiptNote {
  lines: GRNLine[];
  purchase_order?: { id: string; po_number: string };
  warehouse?: { id: string; name: string };
  branch?: { id: string; name: string };
}

export interface GRNListParams extends ListParams {
  vendor_id?: string;
  purchase_order_id?: string;
  warehouse_id?: string;
  inspection_status?: string;
  from_date?: string;
  to_date?: string;
}

export interface PendingPOLine {
  po_line_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  ordered_quantity: number;
  received_quantity: number;
  pending_quantity: number;
  uom_id: string;
  uom_code: string;
}

// ─── API ────────────────────────────────────────────────────────

export const goodsReceiptNotesApi = {
  list: (params?: GRNListParams) =>
    apiClient.get<PaginatedResponse<GoodsReceiptNote>>('/goods-receipt-notes', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<GRNDetail>>(`/goods-receipt-notes/${id}`),

  create: (data: { grn_date: string; purchase_order_id: string; lines: Partial<GRNLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<GRNDetail>>('/goods-receipt-notes', data),

  update: (id: string, data: Partial<GoodsReceiptNote> & { lines?: Partial<GRNLine>[] }) =>
    apiClient.put<ApiResponse<GRNDetail>>(`/goods-receipt-notes/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/goods-receipt-notes/${id}`),

  confirm: (id: string) =>
    apiClient.post<ApiResponse<GoodsReceiptNote>>(`/goods-receipt-notes/${id}/confirm`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<GoodsReceiptNote>>(`/goods-receipt-notes/${id}/cancel`),

  getPendingLines: (poId: string) =>
    apiClient.get<ApiResponse<PendingPOLine[]>>(`/goods-receipt-notes/pending/${poId}`),
};