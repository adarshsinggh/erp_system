// src/api/modules/delivery-challans.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface DeliveryChallanLine {
  id?: string;
  line_number?: number;
  product_id: string;
  product_code?: string;
  product_name?: string;
  quantity: number;
  uom_id: string;
  uom_code?: string;
  sales_order_line_id?: string;
  batch_id?: string | null;
  serial_numbers?: string[];
}

export interface DeliveryChallan {
  [key: string]: unknown;
  id: string;
  challan_number: string;
  challan_date: string;
  customer_id: string;
  customer?: { id: string; customer_code: string; name: string; display_name: string };
  sales_order_id: string | null;
  sales_order?: { id: string; order_number: string } | null;
  warehouse_id: string;
  shipping_address_id: string;
  transporter_name: string;
  vehicle_number: string;
  lr_number: string;
  e_way_bill_number: string;
  status: string;
  internal_notes: string;
  created_at: string;
}

export interface DeliveryChallanDetail extends DeliveryChallan {
  lines: DeliveryChallanLine[];
}

export interface DeliveryChallanListParams extends ListParams {
  customer_id?: string;
  branch_id?: string;
  sales_order_id?: string;
  warehouse_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface PendingDeliveryLine {
  sales_order_line_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  ordered_quantity: number;
  delivered_quantity: number;
  pending_quantity: number;
  uom_id: string;
  uom_code: string;
}

// ─── API ────────────────────────────────────────────────────────

export const deliveryChallansApi = {
  list: (params?: DeliveryChallanListParams) =>
    apiClient.get<PaginatedResponse<DeliveryChallan>>('/delivery-challans', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<DeliveryChallanDetail>>(`/delivery-challans/${id}`),

  create: (data: { challan_date: string; customer_id: string; lines: Partial<DeliveryChallanLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<DeliveryChallanDetail>>('/delivery-challans', data),

  update: (id: string, data: Partial<DeliveryChallan> & { lines?: Partial<DeliveryChallanLine>[] }) =>
    apiClient.put<ApiResponse<DeliveryChallanDetail>>(`/delivery-challans/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/delivery-challans/${id}`),

  dispatch: (id: string) =>
    apiClient.post<ApiResponse<DeliveryChallan>>(`/delivery-challans/${id}/dispatch`),

  deliver: (id: string) =>
    apiClient.post<ApiResponse<DeliveryChallan>>(`/delivery-challans/${id}/delivered`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<DeliveryChallan>>(`/delivery-challans/${id}/cancel`),

  getPendingLines: (salesOrderId: string) =>
    apiClient.get<ApiResponse<PendingDeliveryLine[]>>(`/delivery-challans/pending/${salesOrderId}`),
};