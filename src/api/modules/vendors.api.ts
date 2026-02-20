// src/api/modules/vendors.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface Vendor {
  [key: string]: unknown;
  id: string;
  vendor_code: string;
  vendor_type: 'company' | 'individual';
  name: string;
  display_name: string;
  gstin: string;
  pan: string;
  msme_registered: boolean;
  msme_number: string;
  payment_terms_days: number;
  currency_code: string;
  is_preferred: boolean;
  tds_applicable: boolean;
  tds_section: string;
  tds_rate: number;
  opening_balance: number;
  opening_balance_type: 'debit' | 'credit';
  reliability_score: number;
  avg_lead_time_days: number;
  status: string;
  tags: string[];
  created_at: string;
}

export interface VendorContactPerson {
  id: string;
  name: string;
  designation: string;
  phone: string;
  mobile: string;
  email: string;
  is_primary: boolean;
}

export interface VendorAddress {
  id: string;
  address_type: 'billing' | 'shipping';
  label: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
  is_default: boolean;
}

export interface ItemVendorMapping {
  id: string;
  item_id: string;
  vendor_id: string;
  item_code: string;
  item_name: string;
  vendor_item_code: string;
  vendor_price: number;
  lead_time_days: number;
  minimum_order_qty: number;
  priority: number;
  is_active: boolean;
}

export interface VendorDetail extends Vendor {
  contact_persons: VendorContactPerson[];
  addresses: VendorAddress[];
  supplied_items: ItemVendorMapping[];
}

// ─── API ────────────────────────────────────────────────────────

export const vendorsApi = {
  list: (params?: ListParams) =>
    apiClient.get<PaginatedResponse<Vendor>>('/vendors', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<VendorDetail>>(`/vendors/${id}`),

  create: (data: Partial<Vendor> & { contact_persons?: Partial<VendorContactPerson>[]; addresses?: Partial<VendorAddress>[] }) =>
    apiClient.post<ApiResponse<VendorDetail>>('/vendors', data),

  update: (id: string, data: Partial<Vendor>) =>
    apiClient.put<ApiResponse<Vendor>>(`/vendors/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/vendors/${id}`),

  // Contacts
  addContact: (vendorId: string, data: Partial<VendorContactPerson>) =>
    apiClient.post<ApiResponse<VendorContactPerson>>(`/vendors/${vendorId}/contacts`, data),

  updateContact: (vendorId: string, contactId: string, data: Partial<VendorContactPerson>) =>
    apiClient.put<ApiResponse<VendorContactPerson>>(`/vendors/${vendorId}/contacts/${contactId}`, data),

  deleteContact: (vendorId: string, contactId: string) =>
    apiClient.del<ApiResponse<null>>(`/vendors/${vendorId}/contacts/${contactId}`),

  // Addresses
  addAddress: (vendorId: string, data: Partial<VendorAddress>) =>
    apiClient.post<ApiResponse<VendorAddress>>(`/vendors/${vendorId}/addresses`, data),

  updateAddress: (vendorId: string, addressId: string, data: Partial<VendorAddress>) =>
    apiClient.put<ApiResponse<VendorAddress>>(`/vendors/${vendorId}/addresses/${addressId}`, data),

  deleteAddress: (vendorId: string, addressId: string) =>
    apiClient.del<ApiResponse<null>>(`/vendors/${vendorId}/addresses/${addressId}`),

  // Item mapping
  mapItem: (vendorId: string, data: { item_id: string; vendor_item_code?: string; vendor_price?: number; lead_time_days?: number; minimum_order_qty?: number; priority?: number }) =>
    apiClient.post<ApiResponse<ItemVendorMapping>>(`/vendors/${vendorId}/items`, data),

  updateItemMapping: (mappingId: string, data: Partial<ItemVendorMapping>) =>
    apiClient.put<ApiResponse<ItemVendorMapping>>(`/vendors/item-mapping/${mappingId}`, data),

  removeItemMapping: (mappingId: string) =>
    apiClient.del<ApiResponse<null>>(`/vendors/item-mapping/${mappingId}`),
};