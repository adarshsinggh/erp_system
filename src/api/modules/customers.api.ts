// src/api/modules/customers.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface Customer {
  [key: string]: unknown;
  id: string;
  customer_code: string;
  customer_type: 'company' | 'individual';
  name: string;
  display_name: string;
  gstin: string;
  pan: string;
  tan: string;
  credit_limit: number;
  payment_terms_days: number;
  currency_code: string;
  tds_applicable: boolean;
  tds_section: string;
  tds_rate: number;
  opening_balance: number;
  opening_balance_type: 'debit' | 'credit';
  status: string;
  tags: string[];
  created_at: string;
}

export interface ContactPerson {
  id: string;
  name: string;
  designation: string;
  phone: string;
  mobile: string;
  email: string;
  is_primary: boolean;
}

export interface Address {
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

export interface CustomerDetail extends Customer {
  contact_persons: ContactPerson[];
  addresses: Address[];
}

// ─── API ────────────────────────────────────────────────────────

export const customersApi = {
  list: (params?: ListParams) =>
    apiClient.get<PaginatedResponse<Customer>>('/customers', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<CustomerDetail>>(`/customers/${id}`),

  create: (data: Partial<Customer> & { contact_persons?: Partial<ContactPerson>[]; addresses?: Partial<Address>[] }) =>
    apiClient.post<ApiResponse<CustomerDetail>>('/customers', data),

  update: (id: string, data: Partial<Customer>) =>
    apiClient.put<ApiResponse<Customer>>(`/customers/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/customers/${id}`),

  // Contacts
  addContact: (customerId: string, data: Partial<ContactPerson>) =>
    apiClient.post<ApiResponse<ContactPerson>>(`/customers/${customerId}/contacts`, data),

  updateContact: (customerId: string, contactId: string, data: Partial<ContactPerson>) =>
    apiClient.put<ApiResponse<ContactPerson>>(`/customers/${customerId}/contacts/${contactId}`, data),

  deleteContact: (customerId: string, contactId: string) =>
    apiClient.del<ApiResponse<null>>(`/customers/${customerId}/contacts/${contactId}`),

  // Addresses
  addAddress: (customerId: string, data: Partial<Address>) =>
    apiClient.post<ApiResponse<Address>>(`/customers/${customerId}/addresses`, data),

  updateAddress: (customerId: string, addressId: string, data: Partial<Address>) =>
    apiClient.put<ApiResponse<Address>>(`/customers/${customerId}/addresses/${addressId}`, data),

  deleteAddress: (customerId: string, addressId: string) =>
    apiClient.del<ApiResponse<null>>(`/customers/${customerId}/addresses/${addressId}`),
};