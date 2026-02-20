// src/api/modules/products.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

export interface Product {
  [key: string]: unknown;
  id: string;
  product_code: string;
  name: string;
  description: string;
  product_type: 'finished_goods' | 'semi_finished';
  category_id: string;
  category_name?: string;
  brand_id: string;
  brand_name?: string;
  primary_uom_id: string;
  uom_code?: string;
  uom_name?: string;
  hsn_code: string;
  gst_rate: number;
  selling_price: number;
  standard_cost: number;
  min_stock_threshold: number;
  reorder_quantity: number;
  max_stock_level: number;
  batch_tracking: boolean;
  serial_tracking: boolean;
  warranty_months: number;
  weight: number;
  weight_uom: string;
  manufacturing_location_id: string;
  tags: string[];
  status: string;
  created_at: string;
}

export interface BomVersion {
  id: string;
  bom_code: string;
  bom_version: number;
  status: string;
  effective_from: string;
  effective_to: string;
}

export interface BomLine {
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

export interface ProductDetail extends Product {
  active_bom: any;
  bom_lines: BomLine[];
  bom_versions: BomVersion[];
}

export const productsApi = {
  list: (params?: ListParams & { product_type?: string; category_id?: string }) =>
    apiClient.get<PaginatedResponse<Product>>('/products', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<ProductDetail>>(`/products/${id}`),

  create: (data: Partial<Product>) =>
    apiClient.post<ApiResponse<Product>>('/products', data),

  update: (id: string, data: Partial<Product>) =>
    apiClient.put<ApiResponse<Product>>(`/products/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/products/${id}`),
};