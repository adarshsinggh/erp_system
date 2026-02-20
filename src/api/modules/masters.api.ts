// src/api/modules/masters.api.ts
// API module for taxes, UOMs, categories, brands, manufacturers
// All endpoints are LIVE on backend

import apiClient, { ApiResponse } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface TaxMaster {
  [key: string]: unknown;
  id: string;
  company_id: string;
  name: string;
  tax_type: 'GST' | 'TDS' | 'TCS';
  rate: number;
  description: string;
  is_compound: boolean;
  status: string;
  created_at: string;
}

export interface UnitOfMeasurement {
  [key: string]: unknown;
  id: string;
  company_id: string;
  name: string;
  symbol: string;
  base_unit: string;
  conversion_factor: number;
  status: string;
}

export interface UomConversion {
  id: string;
  company_id: string;
  from_uom_id: string;
  from_uom_name?: string;
  from_uom_symbol?: string;
  to_uom_id: string;
  to_uom_name?: string;
  to_uom_symbol?: string;
  conversion_factor: number;
}

export interface ItemCategory {
  id: string;
  company_id: string;
  name: string;
  code: string;
  parent_id: string | null;
  description: string;
  level: number;
  status: string;
  children?: ItemCategory[];
}

export interface Brand {
  id: string;
  company_id: string;
  name: string;
  description: string;
  status: string;
}

export interface Manufacturer {
  id: string;
  company_id: string;
  name: string;
  contact_info: string;
  website: string;
  status: string;
}

// ─── API ────────────────────────────────────────────────────────

export const mastersApi = {
  // ─── Taxes ────────────────────────────────────────────────────
  listTaxes: (tax_type?: string) =>
    apiClient.get<ApiResponse<TaxMaster[]>>('/taxes', tax_type ? { tax_type } : undefined),

  createTax: (data: Partial<TaxMaster>) =>
    apiClient.post<ApiResponse<TaxMaster>>('/taxes', data),

  updateTax: (id: string, data: Partial<TaxMaster>) =>
    apiClient.put<ApiResponse<TaxMaster>>(`/taxes/${id}`, data),

  // ─── UOMs ─────────────────────────────────────────────────────
  listUoms: () =>
    apiClient.get<ApiResponse<UnitOfMeasurement[]>>('/uoms'),

  createUom: (data: Partial<UnitOfMeasurement>) =>
    apiClient.post<ApiResponse<UnitOfMeasurement>>('/uoms', data),

  // ─── UOM Conversions ──────────────────────────────────────────
  listConversions: () =>
    apiClient.get<ApiResponse<UomConversion[]>>('/uom-conversions'),

  createConversion: (data: { from_uom_id: string; to_uom_id: string; conversion_factor: number }) =>
    apiClient.post<ApiResponse<UomConversion>>('/uom-conversions', data),

  // ─── Categories ───────────────────────────────────────────────
  listCategories: () =>
    apiClient.get<ApiResponse<ItemCategory[]>>('/categories'),

  createCategory: (data: Partial<ItemCategory>) =>
    apiClient.post<ApiResponse<ItemCategory>>('/categories', data),

  updateCategory: (id: string, data: Partial<ItemCategory>) =>
    apiClient.put<ApiResponse<ItemCategory>>(`/categories/${id}`, data),

  deleteCategory: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/categories/${id}`),

  // ─── Brands ───────────────────────────────────────────────────
  listBrands: () =>
    apiClient.get<ApiResponse<Brand[]>>('/brands'),

  createBrand: (data: Partial<Brand>) =>
    apiClient.post<ApiResponse<Brand>>('/brands', data),

  updateBrand: (id: string, data: Partial<Brand>) =>
    apiClient.put<ApiResponse<Brand>>(`/brands/${id}`, data),

  deleteBrand: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/brands/${id}`),

  // ─── Manufacturers ────────────────────────────────────────────
  listManufacturers: () =>
    apiClient.get<ApiResponse<Manufacturer[]>>('/manufacturers'),

  createManufacturer: (data: Partial<Manufacturer>) =>
    apiClient.post<ApiResponse<Manufacturer>>('/manufacturers', data),

  updateManufacturer: (id: string, data: Partial<Manufacturer>) =>
    apiClient.put<ApiResponse<Manufacturer>>(`/manufacturers/${id}`, data),

  deleteManufacturer: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/manufacturers/${id}`),
};