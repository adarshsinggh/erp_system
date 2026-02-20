// src/api/modules/stock-transfers.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface StockTransferLine {
  id?: string;
  line_number: number;
  item_id: string;
  item_code?: string;
  item_name?: string;
  product_id?: string;
  product_code?: string;
  product_name?: string;
  quantity: number;
  received_quantity?: number;
  uom_id: string;
  uom_code?: string;
  batch_id?: string;
  batch_number?: string;
  unit_cost?: number;
  remarks?: string;
}

export interface StockTransfer {
  [key: string]: unknown;
  id: string;
  transfer_number: string;
  transfer_date: string;
  transfer_type: 'inter_warehouse' | 'inter_branch';
  from_branch_id: string;
  from_branch_name?: string;
  from_warehouse_id: string;
  from_warehouse_name?: string;
  to_branch_id: string;
  to_branch_name?: string;
  to_warehouse_id: string;
  to_warehouse_name?: string;
  status: 'draft' | 'approved' | 'in_transit' | 'partially_received' | 'received' | 'cancelled';
  reason: string;
  dispatched_at: string | null;
  received_at: string | null;
  created_at: string;
}

export interface StockTransferDetail extends StockTransfer {
  lines: StockTransferLine[];
}

export interface ReceiveLineInput {
  line_id: string;
  received_quantity: number;
  remarks?: string;
}

export interface StockTransferListParams extends ListParams {
  transfer_type?: string;
  from_branch_id?: string;
  to_branch_id?: string;
  from_warehouse_id?: string;
  to_warehouse_id?: string;
  from_date?: string;
  to_date?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const stockTransfersApi = {
  list: (params?: StockTransferListParams) =>
    apiClient.get<PaginatedResponse<StockTransfer>>('/inventory/stock-transfers', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<StockTransferDetail>>(`/inventory/stock-transfers/${id}`),

  create: (data: { transfer_date: string; transfer_type: string; from_warehouse_id: string; to_warehouse_id: string; lines: Partial<StockTransferLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<StockTransferDetail>>('/inventory/stock-transfers', data),

  update: (id: string, data: Partial<StockTransfer> & { lines?: Partial<StockTransferLine>[] }) =>
    apiClient.put<ApiResponse<StockTransferDetail>>(`/inventory/stock-transfers/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/inventory/stock-transfers/${id}`),

  approve: (id: string) =>
    apiClient.post<ApiResponse<StockTransfer>>(`/inventory/stock-transfers/${id}/approve`),

  dispatch: (id: string) =>
    apiClient.post<ApiResponse<StockTransfer>>(`/inventory/stock-transfers/${id}/dispatch`),

  receive: (id: string, data: { lines: ReceiveLineInput[] }) =>
    apiClient.post<ApiResponse<StockTransfer>>(`/inventory/stock-transfers/${id}/receive`, data),

  cancel: (id: string) =>
    apiClient.patch<ApiResponse<StockTransfer>>(`/inventory/stock-transfers/${id}/cancel`),
};