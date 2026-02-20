// src/api/modules/production-entries.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface ProductionEntry {
  [key: string]: unknown;
  id: string;
  work_order_id: string;
  work_order_number: string;
  entry_number: string;
  entry_date: string;
  product_id: string;
  product_name: string;
  product_code: string;
  quantity_produced: number;
  scrap_quantity: number;
  uom_id: string;
  uom_symbol: string;
  warehouse_id: string;
  warehouse_name: string;
  batch_number: string | null;
  serial_numbers: string[] | null;
  unit_cost: number | null;
  total_cost: number | null;
  remarks: string | null;
  metadata: Record<string, unknown> | null;
  // from WO join
  planned_quantity: number;
  wo_completed: number;
  created_at: string;
}

export interface ProductionEntryListParams extends ListParams {
  work_order_id?: string;
  product_id?: string;
  from_date?: string;
  to_date?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const productionEntriesApi = {
  list: (params?: ProductionEntryListParams) =>
    apiClient.get<PaginatedResponse<ProductionEntry>>('/manufacturing/production-entries', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<ProductionEntry>>(`/manufacturing/production-entries/${id}`),

  create: (data: {
    work_order_id: string;
    entry_date: string;
    quantity_produced: number;
    branch_id?: string;
    scrap_quantity?: number;
    warehouse_id?: string;
    batch_number?: string;
    serial_numbers?: string[];
    remarks?: string;
    metadata?: Record<string, unknown>;
  }) => apiClient.post<ApiResponse<ProductionEntry>>('/manufacturing/production-entries', data),
};