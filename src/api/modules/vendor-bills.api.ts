// src/api/modules/vendor-bills.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface VendorBillLine {
  id?: string;
  vendor_bill_id?: string;
  line_number: number;
  item_id: string;
  item_code?: string;
  item_name?: string;
  description: string;
  quantity: number;
  uom_id: string;
  uom_code?: string;
  unit_price: number;
  taxable_amount?: number;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total_amount?: number;
  hsn_code: string;
  po_line_id?: string;
  grn_line_id?: string;
}

export interface VendorBillPayment {
  id: string;
  payment_number: string;
  payment_date: string;
  payment_mode: string;
  amount: number;
}

export interface VendorBill {
  [key: string]: unknown;
  id: string;
  bill_number: string;
  vendor_bill_number: string;
  vendor_bill_date: string;
  received_date: string;
  due_date: string;
  vendor_id: string;
  vendor?: { id: string; vendor_code: string; name: string; display_name: string; gstin: string };
  purchase_order_id: string | null;
  grn_id: string | null;
  currency_code: string;
  subtotal: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tds_applicable: boolean;
  tds_section: string;
  tds_rate: number;
  tds_amount: number;
  total_tax: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  three_way_match_status: 'matched' | 'unmatched' | 'partial';
  status: string;
  created_at: string;
}

export interface VendorBillDetail extends VendorBill {
  lines: VendorBillLine[];
  purchase_order?: { id: string; po_number: string };
  grn?: { id: string; grn_number: string };
  payments?: VendorBillPayment[];
}

export interface VendorOutstanding {
  total_billed: number;
  total_paid: number;
  total_outstanding: number;
  overdue_amount: number;
  bill_count: number;
}

export interface VendorBillListParams extends ListParams {
  vendor_id?: string;
  purchase_order_id?: string;
  overdue_only?: boolean;
  from_date?: string;
  to_date?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const vendorBillsApi = {
  list: (params?: VendorBillListParams) =>
    apiClient.get<PaginatedResponse<VendorBill>>('/vendor-bills', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<VendorBillDetail>>(`/vendor-bills/${id}`),

  create: (data: { vendor_bill_date: string; vendor_id: string; lines: Partial<VendorBillLine>[]; [key: string]: unknown }) =>
    apiClient.post<ApiResponse<VendorBillDetail>>('/vendor-bills', data),

  update: (id: string, data: Partial<VendorBill> & { lines?: Partial<VendorBillLine>[] }) =>
    apiClient.put<ApiResponse<VendorBillDetail>>(`/vendor-bills/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/vendor-bills/${id}`),

  approve: (id: string) =>
    apiClient.post<ApiResponse<VendorBill>>(`/vendor-bills/${id}/approve`),

  cancel: (id: string) =>
    apiClient.post<ApiResponse<VendorBill>>(`/vendor-bills/${id}/cancel`),

  getVendorOutstanding: (vendorId: string) =>
    apiClient.get<ApiResponse<VendorOutstanding>>(`/vendor-bills/outstanding/${vendorId}`),
};