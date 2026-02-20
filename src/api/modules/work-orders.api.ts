// src/api/modules/work-orders.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface WorkOrderMaterial {
  id: string;
  line_number: number;
  component_type: 'item' | 'product';
  component_item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  component_product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  planned_quantity: number;
  issued_quantity: number;
  consumed_quantity: number;
  returned_quantity: number;
  wastage_quantity: number;
  uom_id: string;
  uom_symbol: string;
  unit_cost: number;
  total_cost: number;
  batch_id: string | null;
  variance_quantity: number | null;
  variance_pct: number | null;
}

export interface WorkOrder {
  [key: string]: unknown;
  id: string;
  company_id: string;
  branch_id: string | null;
  work_order_number: string;
  work_order_date: string;
  product_id: string;
  product_name: string;
  product_code: string;
  bom_header_id: string;
  bom_name: string;
  bom_version: number;
  planned_quantity: number;
  completed_quantity: number;
  scrap_quantity: number;
  uom_id: string;
  uom_symbol: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  source_warehouse_id: string;
  source_warehouse_name: string;
  target_warehouse_id: string;
  target_warehouse_name: string;
  sales_order_id: string | null;
  sales_order_number: string | null;
  planned_cost: number | null;
  actual_cost: number | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: string;
  internal_notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface WorkOrderDetail extends WorkOrder {
  materials: WorkOrderMaterial[];
}

export interface WorkOrderListParams extends ListParams {
  branch_id?: string;
  product_id?: string;
  priority?: string;
  from_date?: string;
  to_date?: string;
  sales_order_id?: string;
}

export interface MaterialIssueLine {
  material_id: string;
  issue_quantity: number;
  batch_id?: string;
}

export interface MaterialConsumeLine {
  material_id: string;
  consumed_quantity: number;
  wastage_quantity?: number;
}

export interface MaterialReturnLine {
  material_id: string;
  return_quantity: number;
  batch_id?: string;
}

// ─── API ────────────────────────────────────────────────────────

export const workOrdersApi = {
  list: (params?: WorkOrderListParams) =>
    apiClient.get<PaginatedResponse<WorkOrder>>('/manufacturing/work-orders', params),

  getById: (id: string) =>
    apiClient.get<ApiResponse<WorkOrderDetail>>(`/manufacturing/work-orders/${id}`),

  create: (data: {
    work_order_date: string;
    product_id: string;
    bom_header_id: string;
    planned_quantity: number;
    uom_id: string;
    source_warehouse_id: string;
    target_warehouse_id: string;
    branch_id?: string;
    planned_start_date?: string;
    planned_end_date?: string;
    sales_order_id?: string;
    priority?: string;
    internal_notes?: string;
    metadata?: Record<string, unknown>;
  }) => apiClient.post<ApiResponse<WorkOrderDetail>>('/manufacturing/work-orders', data),

  update: (id: string, data: Record<string, unknown>) =>
    apiClient.put<ApiResponse<WorkOrderDetail>>(`/manufacturing/work-orders/${id}`, data),

  delete: (id: string) =>
    apiClient.del<ApiResponse<null>>(`/manufacturing/work-orders/${id}`),

  // Lifecycle actions
  approve: (id: string) =>
    apiClient.post<ApiResponse<WorkOrder>>(`/manufacturing/work-orders/${id}/approve`, {}),

  start: (id: string) =>
    apiClient.post<ApiResponse<WorkOrder>>(`/manufacturing/work-orders/${id}/start`, {}),

  complete: (id: string) =>
    apiClient.post<ApiResponse<WorkOrder>>(`/manufacturing/work-orders/${id}/complete`, {}),

  close: (id: string) =>
    apiClient.post<ApiResponse<WorkOrder>>(`/manufacturing/work-orders/${id}/close`, {}),

  cancel: (id: string) =>
    apiClient.patch<ApiResponse<WorkOrder>>(`/manufacturing/work-orders/${id}/cancel`, {}),

  // Material management
  issueMaterials: (id: string, lines: MaterialIssueLine[]) =>
    apiClient.post<ApiResponse<WorkOrderDetail>>(`/manufacturing/work-orders/${id}/issue-materials`, { lines }),

  consumeMaterials: (id: string, lines: MaterialConsumeLine[]) =>
    apiClient.post<ApiResponse<WorkOrderDetail>>(`/manufacturing/work-orders/${id}/consume-materials`, { lines }),

  returnMaterials: (id: string, lines: MaterialReturnLine[]) =>
    apiClient.post<ApiResponse<WorkOrderDetail>>(`/manufacturing/work-orders/${id}/return-materials`, { lines }),
};