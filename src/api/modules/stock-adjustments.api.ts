 // src/api/modules/stock-adjustments.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface StockAdjustmentLine {
  id?: string;
  line_number: number;
  item_id: string;
  item_code?: string;
  item_name?: string;
  product_id?: string;
  product_code?: string;
  product_name?: string;
  system_quantity: number;
  actual_quantity: number;
  adjustment_quantity: number;
  uom_id: string;
  uom_code?: string;
  unit_cost: number;
  total_value?: number;
  batch_id?: string;
  batch_number?: string;
  remarks?: string;
}

export interface StockAdjustment {
  [key: string]: unknown;
  id: string;
  adjustment_number: string;
  adjustment_date: string;
  branch_id: string;
  branch_name?: string;
  warehouse_id: string;
  warehouse_name?: string;
  reason: 'physical_count' | 'damage' | 'theft' | 'correction' | 'opening_stock';
  reason_detail: string;
  status: 'draft' | 'approved' | 'posted' | 'cancelled';
  approved_by?: string;
  approved_at?: string;
  created_at: string;
}

export interface StockAdjustmentDetail extends StockAdjustment {
  lines: StockAdjustmentLine[];
}

export interface StockAdjustmentListParams extends ListParams {
  reason?: string;
  branch_id?: string;
  warehouse_id?: string;
  from_date?: string;
  to_date?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const stockAdjustmentsApi = {
  list: (params?: StockAdjustmentListParams) =>
    apiClient.get<PaginatedResponse<StockAdjustment>>('/inventory/stock-adjustments', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<StockAdjustmentDetail>>(`/inventory/stock-adjustments/${id}`),

  create: (data: { adjustment_date: string; warehouse_id: string; reason: string; lines: Partial<StockAdjustmentLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<StockAdjustmentDetail>>('/inventory/stock-adjustments', data),

  update: (id: string, data: Partial<StockAdjustment> & { lines?: Partial<StockAdjustmentLine>[] }) =>
    apiClient.put<ApiResponse<StockAdjustmentDetail>>(`/inventory/stock-adjustments/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/inventory/stock-adjustments/${id}`),

  approve: (id: string) =>
    apiClient.post<ApiResponse<StockAdjustment>>(`/inventory/stock-adjustments/${id}/approve`),

  post: (id: string) =>
    apiClient.post<ApiResponse<StockAdjustment>>(`/inventory/stock-adjustments/${id}/post`),

  cancel: (id: string) =>
    apiClient.patch<ApiResponse<StockAdjustment>>(`/inventory/stock-adjustments/${id}/cancel`),
};