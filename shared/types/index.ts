// ============================================================
// Base types used by all entities
// ============================================================

export interface BaseEntity {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  version: number;
  sync_status: 'pending' | 'synced' | 'conflict';
  last_synced_at: string | null;
  device_id: string | null;
}

// ============================================================
// Module 1: Company & Setup
// ============================================================

export interface Company extends BaseEntity {
  name: string;
  display_name: string | null;
  logo_path: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  gstin: string | null;
  pan: string | null;
  tan: string | null;
  cin: string | null;
  base_currency: string;
  financial_year_start: number;
  license_key: string | null;
  license_valid_until: string | null;
  license_tier: 'starter' | 'professional' | 'enterprise';
  max_users: number;
  max_branches: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface FinancialYear extends BaseEntity {
  year_code: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
}

export interface Branch extends BaseEntity {
  code: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  is_main_branch: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface Warehouse extends BaseEntity {
  branch_id: string;
  code: string;
  name: string;
  address: string | null;
  warehouse_type: 'main' | 'raw_material' | 'finished_goods' | 'scrap';
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

// ============================================================
// Module 2: Users & Access Control
// ============================================================

export interface Role extends BaseEntity {
  name: string;
  description: string | null;
  hierarchy_level: number;
  is_system_role: boolean;
  is_active: boolean;
}

export interface User extends BaseEntity {
  username: string;
  email: string;
  password_hash: string;
  full_name: string;
  role_id: string;
  branch_id: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  force_password_change: boolean;
}

// ============================================================
// Module 3: Customer & Vendor
// ============================================================

export interface Customer extends BaseEntity {
  customer_code: string;
  customer_type: 'company' | 'individual';
  name: string;
  display_name: string | null;
  gstin: string | null;
  pan: string | null;
  tan: string | null;
  credit_limit: number;
  payment_terms_days: number;
  currency_code: string;
  tds_applicable: boolean;
  tds_section: string | null;
  tds_rate: number | null;
  opening_balance: number;
  opening_balance_type: 'debit' | 'credit';
  status: 'active' | 'inactive' | 'blocked';
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface Vendor extends BaseEntity {
  vendor_code: string;
  vendor_type: 'company' | 'individual';
  name: string;
  display_name: string | null;
  gstin: string | null;
  pan: string | null;
  msme_registered: boolean;
  msme_number: string | null;
  payment_terms_days: number;
  currency_code: string;
  is_preferred: boolean;
  tds_applicable: boolean;
  tds_section: string | null;
  tds_rate: number | null;
  reliability_score: number;
  average_lead_days: number;
  opening_balance: number;
  opening_balance_type: 'debit' | 'credit';
  status: 'active' | 'inactive' | 'blocked';
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface ContactPerson extends BaseEntity {
  entity_type: 'customer' | 'vendor';
  entity_id: string;
  name: string;
  designation: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  is_primary: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface Address extends BaseEntity {
  entity_type: 'customer' | 'vendor';
  entity_id: string;
  address_type: 'billing' | 'shipping';
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string | null;
  is_default: boolean;
}

// ============================================================
// Module 4: Item & Product
// ============================================================

export interface Item extends BaseEntity {
  item_code: string;
  name: string;
  description: string | null;
  item_type: 'raw_material' | 'component' | 'consumable' | 'packing';
  category_id: string | null;
  brand_id: string | null;
  manufacturer_id: string | null;
  primary_uom_id: string;
  purchase_uom_id: string | null;
  hsn_code: string | null;
  gst_rate: number | null;
  purchase_price: number | null;
  selling_price: number | null;
  min_stock_threshold: number | null;
  reorder_quantity: number | null;
  max_stock_level: number | null;
  lead_time_days: number;
  costing_method: 'fifo' | 'weighted_avg' | 'standard';
  standard_cost: number | null;
  batch_tracking: boolean;
  serial_tracking: boolean;
  shelf_life_days: number | null;
  weight: number | null;
  weight_uom: string | null;
  image_path: string | null;
  status: 'active' | 'inactive' | 'blocked';
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface Product extends BaseEntity {
  product_code: string;
  name: string;
  description: string | null;
  product_type: 'finished_goods' | 'semi_finished';
  category_id: string | null;
  brand_id: string | null;
  primary_uom_id: string;
  hsn_code: string | null;
  gst_rate: number | null;
  selling_price: number | null;
  standard_cost: number | null;
  min_stock_threshold: number | null;
  reorder_quantity: number | null;
  max_stock_level: number | null;
  batch_tracking: boolean;
  serial_tracking: boolean;
  warranty_months: number | null;
  weight: number | null;
  weight_uom: string | null;
  manufacturing_location_id: string | null;
  image_path: string | null;
  status: 'active' | 'inactive' | 'blocked';
  tags: string[];
  metadata: Record<string, unknown>;
}

// ============================================================
// Module 5: BOM
// ============================================================

export interface BomHeader extends BaseEntity {
  product_id: string;
  bom_code: string;
  bom_version: number;
  description: string | null;
  output_quantity: number;
  output_uom_id: string;
  expected_yield_pct: number;
  effective_from: string;
  effective_to: string | null;
  status: 'draft' | 'active' | 'obsolete';
  approved_by: string | null;
  approved_at: string | null;
}

export interface BomLine extends BaseEntity {
  bom_header_id: string;
  line_number: number;
  component_type: 'item' | 'product';
  component_item_id: string | null;
  component_product_id: string | null;
  quantity: number;
  uom_id: string;
  wastage_pct: number | null;
  is_critical: boolean;
  notes: string | null;
  metadata: Record<string, unknown>;
}

// ============================================================
// API Response types
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AppConfig {
  mode: 'server' | 'client';
  apiPort: number;
  apiUrl: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
}
