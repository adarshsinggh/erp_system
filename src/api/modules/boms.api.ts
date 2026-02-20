// src/api/modules/boms.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

export interface Bom {
  [key: string]: unknown;
  id: string;
  bom_code: string;
  product_id: string;
  bom_version: number;
  description: string;
  effective_from: string;
  effective_to: string;
  output_quantity: number;
  output_uom_id: string;
  expected_yield_pct: number;
  status: string;
  approved_by: string;
  approved_at: string;
  created_at: string;
  product?: { product_code: string; name: string };
}

export interface BomLineInput {
  line_number: number;
  component_type: 'item' | 'product';
  component_item_id?: string;
  component_product_id?: string;
  quantity: number;
  uom_id: string;
  wastage_pct?: number;
  notes?: string;
}

export interface BomLine {
  [key: string]: unknown;
  id: string;
  line_number: number;
  component_type: 'item' | 'product';
  component_item_id: string;
  component_product_id: string;
  item_code?: string;
  item_name?: string;
  product_code?: string;
  sub_product_name?: string;
  quantity: number;
  uom_id: string;
  uom_code?: string;
  wastage_pct: number;
  item_cost?: number;
  sub_product_cost?: number;
  notes: string;
}

export interface BomDetail extends Bom {
  lines: BomLine[];
  total_material_cost: number;
}

export const bomsApi = {
  list: (params?: ListParams & { product_id?: string }) =>
    apiClient.get<PaginatedResponse<Bom>>('/boms', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<BomDetail>>(`/boms/${id}`),

  create: (data: { product_id: string; description?: string; effective_from?: string; effective_to?: string; output_quantity?: number; output_uom_id?: string; expected_yield_pct?: number; lines: BomLineInput[] }) =>
    apiClient.post<ApiResponse<BomDetail>>('/boms', data),

  activate: (id: string) =>
    apiClient.post<ApiResponse<Bom>>(`/boms/${id}/activate`, {}),

  obsolete: (id: string) =>
    apiClient.post<ApiResponse<Bom>>(`/boms/${id}/obsolete`, {}),

  updateLines: (id: string, lines: BomLineInput[]) =>
    apiClient.put<ApiResponse<BomLine[]>>(`/boms/${id}/lines`, { lines }),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/boms/${id}`),
};