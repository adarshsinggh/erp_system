// src/api/modules/items.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface Item {
  [key: string]: unknown;
  id: string;
  item_code: string;
  name: string;
  description: string;
  item_type: 'raw_material' | 'component' | 'consumable' | 'packing';
  category_id: string;
  category_name?: string;
  brand_id: string;
  brand_name?: string;
  manufacturer_id: string;
  manufacturer_name?: string;
  primary_uom_id: string;
  uom_code?: string;
  uom_name?: string;
  purchase_uom_id: string;
  hsn_code: string;
  gst_rate: number;
  purchase_price: number;
  selling_price: number;
  standard_cost: number;
  min_stock_threshold: number;
  reorder_quantity: number;
  max_stock_level: number;
  lead_time_days: number;
  costing_method: 'fifo' | 'weighted_avg' | 'standard';
  batch_tracking: boolean;
  serial_tracking: boolean;
  shelf_life_days: number;
  weight: number;
  weight_uom: string;
  tags: string[];
  status: string;
  created_at: string;
}

export interface ItemVendor {
  id: string;
  vendor_code: string;
  vendor_name: string;
  vendor_item_code: string;
  vendor_price: number;
  lead_time_days: number;
  minimum_order_qty: number;
  priority: number;
}

export interface ItemAlternative {
  id: string;
  alternative_item_id: string;
  alt_item_code: string;
  alt_item_name: string;
  conversion_factor: number;
  priority: number;
  notes: string;
}

export interface ItemDetail extends Item {
  vendors: ItemVendor[];
  alternatives: ItemAlternative[];
}

// ─── API ────────────────────────────────────────────────────────

export const itemsApi = {
  list: (params?: ListParams & { item_type?: string; category_id?: string }) =>
    apiClient.get<PaginatedResponse<Item>>('/items', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<ItemDetail>>(`/items/${id}`),

  create: (data: Partial<Item>) =>
    apiClient.post<ApiResponse<Item>>('/items', data),

  update: (id: string, data: Partial<Item>) =>
    apiClient.put<ApiResponse<Item>>(`/items/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/items/${id}`),

  // Alternatives
  addAlternative: (itemId: string, data: { alternative_item_id: string; conversion_factor?: number; priority: number; notes?: string }) =>
    apiClient.post<ApiResponse<ItemAlternative>>(`/items/${itemId}/alternatives`, data),

  removeAlternative: (altId: string) =>
    apiClient.del<ApiResponse<null>>(`/items/alternatives/${altId}`),
};