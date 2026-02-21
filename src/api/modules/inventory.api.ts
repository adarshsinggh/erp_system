// src/api/modules/inventory.api.ts
import apiClient, { PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface StockSummaryItem {
  [key: string]: unknown;
  item_id: string;
  item_code: string;
  item_name: string;
  warehouse_id: string;
  warehouse_name: string;
  uom_name: string;
  uom_symbol: string;
  available_quantity: number;
  reserved_quantity: number;
  on_order_quantity: number;
  in_production_quantity: number;
  free_quantity: number;
  weighted_avg_cost: number;
  total_value: number;
  min_stock_threshold: number;
  reorder_quantity: number;
  is_below_minimum: boolean;
}

export interface StockLedgerEntry {
  [key: string]: unknown;
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  warehouse_id: string;
  warehouse_name: string;
  transaction_type: 'grn_receipt' | 'production_in' | 'production_out' | 'sales_dispatch' | 'transfer_in' | 'transfer_out' | 'adjustment' | 'scrap';
  direction: 'in' | 'out';
  quantity: number;
  unit_cost: number;
  running_balance: number;
  reference_type: string;
  reference_number: string;
  narration: string;
  batch_number: string;
  serial_number: string;
  transaction_date: string;
  created_at: string;
}

export interface StockValuationItem {
  [key: string]: unknown;
  item_id: string;
  item_code: string;
  item_name: string;
  warehouse_name: string;
  quantity: number;
  unit_cost: number;
  total_value: number;
  valuation_method: 'fifo' | 'weighted_avg' | 'standard';
}

export interface StockBalance {
  item_id: string;
  warehouse_id: string;
  available_quantity: number;
  reserved_quantity: number;
  free_quantity: number;
  weighted_avg_cost: number;
}

export interface StockSummaryParams extends ListParams {
  branch_id?: string;
  warehouse_id?: string;
  item_id?: string;
  below_minimum?: boolean;
}

export interface StockLedgerParams extends ListParams {
  branch_id?: string;
  warehouse_id?: string;
  item_id?: string;
  product_id?: string;
  transaction_type?: string;
  reference_type?: string;
  from_date?: string;
  to_date?: string;
}

export interface StockValuationParams extends ListParams {
  branch_id?: string;
  warehouse_id?: string;
  valuation_method?: 'fifo' | 'weighted_avg' | 'standard';
}

// ─── API ────────────────────────────────────────────────────────

export const inventoryApi = {
  getStockSummary: (params?: StockSummaryParams) =>
    apiClient.get<PaginatedResponse<StockSummaryItem>>('/inventory/stock-summary', params),

  getStockLedger: (params?: StockLedgerParams) =>
    apiClient.get<PaginatedResponse<StockLedgerEntry>>('/inventory/stock-ledger', params),

  getStockBalance: (params: { item_id?: string; product_id?: string; warehouse_id: string }) =>
    apiClient.get<{ success: boolean; data: StockBalance }>('/inventory/stock-balance', params),

  getStockBalanceAllWarehouses: (params: { item_id?: string; product_id?: string }) =>
    apiClient.get<{ success: boolean; data: StockBalance[] }>('/inventory/stock-balance/all-warehouses', params),

  getValuation: (params?: StockValuationParams) =>
    apiClient.get<PaginatedResponse<StockValuationItem>>('/inventory/valuation', params),

  recalculate: (data: { item_id: string; warehouse_id: string }) =>
    apiClient.post<{ success: boolean; message: string }>('/inventory/recalculate', data),
};