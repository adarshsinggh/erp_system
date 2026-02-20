// src/api/modules/batch-serial.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface StockBatch {
  [key: string]: unknown;
  id: string;
  batch_number: string;
  item_id: string;
  item_code?: string;
  item_name?: string;
  manufacturing_date: string;
  expiry_date: string;
  vendor_id?: string;
  vendor_name?: string;
  grn_id?: string;
  initial_quantity: number;
  current_quantity: number;
  unit_cost: number;
  status: 'active' | 'depleted' | 'expired' | 'quarantine';
  created_at: string;
}

export interface BatchMovement {
  id: string;
  transaction_type: string;
  direction: 'in' | 'out';
  quantity: number;
  warehouse_name: string;
  reference_number: string;
  narration: string;
  transaction_date: string;
}

export interface BatchDistribution {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
}

export interface SerialTraceEntry {
  id: string;
  transaction_type: string;
  direction: 'in' | 'out';
  quantity: number;
  warehouse_name: string;
  reference_type: string;
  reference_number: string;
  narration: string;
  transaction_date: string;
}

export interface BatchListParams extends ListParams {
  item_id?: string;
  vendor_id?: string;
  batch_status?: string;
  expiry_before?: string;
  expiry_after?: string;
  warehouse_id?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const batchSerialApi = {
  list: (params?: BatchListParams) =>
    apiClient.get<PaginatedResponse<StockBatch>>('/inventory/batches', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<StockBatch>>(`/inventory/batches/${id}`),

  create: (data: Partial<StockBatch>) =>
    apiClient.post<ApiResponse<StockBatch>>('/inventory/batches', data),

  update: (id: string, data: Partial<StockBatch>) =>
    apiClient.put<ApiResponse<StockBatch>>(`/inventory/batches/${id}`, data),

  changeStatus: (id: string, status: StockBatch['status']) =>
    apiClient.patch<ApiResponse<StockBatch>>(`/inventory/batches/${id}/status`, { status }),

  getHistory: (id: string) =>
    apiClient.get<ApiResponse<BatchMovement[]>>(`/inventory/batches/${id}/history`),

  getDistribution: (id: string) =>
    apiClient.get<ApiResponse<BatchDistribution[]>>(`/inventory/batches/${id}/distribution`),

  getItemBatches: (itemId: string) =>
    apiClient.get<ApiResponse<StockBatch[]>>(`/inventory/batches/item/${itemId}`),

  getExpiringSoon: (days?: number) =>
    apiClient.get<ApiResponse<StockBatch[]>>('/inventory/batches/expiring-soon', days ? { days } : undefined),

  serialSearch: (params: { serial_number: string; item_id?: string }) =>
    apiClient.get<ApiResponse<SerialTraceEntry[]>>('/inventory/serial-search', params),
};