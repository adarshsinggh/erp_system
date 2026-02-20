// src/api/modules/scrap-entries.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface ScrapEntry {
  [key: string]: unknown;
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  scrap_number: string;
  scrap_date: string;
  work_order_id: string | null;
  work_order_number: string | null;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  uom_id: string;
  uom_symbol: string;
  scrap_reason: 'defective' | 'damaged' | 'expired' | 'process_waste';
  reason_detail: string | null;
  scrap_value: number | null;
  disposal_method: 'sell' | 'recycle' | 'discard' | null;
  warehouse_id: string;
  warehouse_name: string;
  status: 'recorded' | 'disposed';
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ScrapEntryListParams extends ListParams {
  branch_id?: string;
  work_order_id?: string;
  scrap_reason?: string;
  disposal_method?: string;
  from_date?: string;
  to_date?: string;
}

export interface ScrapAnalysis {
  group: string;
  total_quantity: number;
  total_value: number;
  entry_count: number;
}

// ─── API ────────────────────────────────────────────────────────

export const scrapEntriesApi = {
  list: (params?: ScrapEntryListParams) =>
    apiClient.get<PaginatedResponse<ScrapEntry>>('/manufacturing/scrap-entries', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<ScrapEntry>>(`/manufacturing/scrap-entries/${id}`),

  create: (data: {
    scrap_date: string;
    item_id?: string;
    product_id?: string;
    quantity: number;
    uom_id: string;
    scrap_reason: string;
    warehouse_id: string;
    work_order_id?: string;
    branch_id?: string;
    reason_detail?: string;
    scrap_value?: number;
    disposal_method?: string;
    metadata?: Record<string, unknown>;
  }) => apiClient.post<ApiResponse<ScrapEntry>>('/manufacturing/scrap-entries', data),

  dispose: (id: string, disposal_method: string) =>
    apiClient.patch<ApiResponse<ScrapEntry>>(`/manufacturing/scrap-entries/${id}/dispose`, { disposal_method }),

  analysis: (params?: { group_by?: string; from_date?: string; to_date?: string; branch_id?: string }) =>
    apiClient.get<ApiResponse<ScrapAnalysis[]>>('/manufacturing/scrap-analysis', params),
};