// src/api/modules/settings.api.ts
// API module for company, branches, warehouses, users, roles, document sequences
// NOTE: Branch, Warehouse, User, Role, and DocumentSequence endpoints are PENDING on backend.
//       These use mock implementations that mirror the expected API shape.

import apiClient, { ApiResponse } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export interface CompanyProfile {
  id: string;
  name: string;
  display_name: string;
  legal_name: string;
  gstin: string;
  pan: string;
  tan: string;
  cin: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  state_code: string;
  pin_code: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  financial_year_start: string;
  financial_year_end: string;
  base_currency: string;
  license_tier: string;
  status: string;
  created_at: string;
}

export interface Branch {
  [key: string]: unknown;
  id: string;
  company_id: string;
  name: string;
  code: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  state_code: string;
  pin_code: string;
  gstin: string;
  phone: string;
  email: string;
  is_main: boolean;
  status: string;
  created_at: string;
}

export interface Warehouse {
  [key: string]: unknown;
  id: string;
  company_id: string;
  branch_id: string;
  branch_name?: string;
  name: string;
  code: string;
  warehouse_type: 'main' | 'raw_material' | 'finished_goods' | 'scrap';
  address: string;
  status: string;
  created_at: string;
}

export interface User {
  [key: string]: unknown;
  id: string;
  company_id: string;
  username: string;
  full_name: string;
  email: string;
  phone: string;
  role_id: string;
  role_name?: string;
  branch_id: string;
  branch_name?: string;
  status: string;
  last_login: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  company_id: string;
  name: string;
  description: string;
  is_system_role: boolean;
  user_count: number;
  permissions: RolePermission[];
}

export interface RolePermission {
  id: string;
  module: string;
  action: string;
  description: string;
  granted: boolean;
}

export interface DocumentSequence {
  [key: string]: unknown;
  id: string;
  company_id: string;
  branch_id: string;
  branch_name?: string;
  document_type: string;
  prefix: string;
  suffix: string;
  next_number: number;
  padding: number;
  preview: string;
  status: string;
}

// ─── Company API (LIVE) ─────────────────────────────────────────

export const settingsApi = {
  // Company
  getCompany: (id: string) =>
    apiClient.get<ApiResponse<CompanyProfile>>(`/companies/${id}`),

  updateCompany: (id: string, data: Partial<CompanyProfile>) =>
    apiClient.put<ApiResponse<CompanyProfile>>(`/companies/${id}`, data),

  // ─── Branches (PENDING — mock) ──────────────────────────────
  listBranches: async (): Promise<ApiResponse<Branch[]>> => {
    // TODO: Replace with apiClient.get<ApiResponse<Branch[]>>('/branches')
    await delay(400);
    return { success: true, data: mockBranches };
  },

  getBranch: async (id: string): Promise<ApiResponse<Branch>> => {
    // TODO: Replace with apiClient.get<ApiResponse<Branch>>(`/branches/${id}`)
    await delay(300);
    const branch = mockBranches.find((b) => b.id === id);
    if (!branch) throw new Error('Branch not found');
    return { success: true, data: branch };
  },

  createBranch: async (data: Partial<Branch>): Promise<ApiResponse<Branch>> => {
    // TODO: Replace with apiClient.post<ApiResponse<Branch>>('/branches', data)
    await delay(500);
    const newBranch: Branch = {
      id: crypto.randomUUID(),
      company_id: 'c1',
      name: data.name || '',
      code: data.code || '',
      address_line1: data.address_line1 || '',
      address_line2: data.address_line2 || '',
      city: data.city || '',
      state: data.state || '',
      state_code: data.state_code || '',
      pin_code: data.pin_code || '',
      gstin: data.gstin || '',
      phone: data.phone || '',
      email: data.email || '',
      is_main: data.is_main || false,
      status: 'active',
      created_at: new Date().toISOString(),
    };
    mockBranches.push(newBranch);
    return { success: true, data: newBranch };
  },

  updateBranch: async (id: string, data: Partial<Branch>): Promise<ApiResponse<Branch>> => {
    // TODO: Replace with apiClient.put<ApiResponse<Branch>>(`/branches/${id}`, data)
    await delay(500);
    const idx = mockBranches.findIndex((b) => b.id === id);
    if (idx === -1) throw new Error('Branch not found');
    mockBranches[idx] = { ...mockBranches[idx], ...data };
    return { success: true, data: mockBranches[idx] };
  },

  deleteBranch: async (id: string): Promise<ApiResponse<null>> => {
    // TODO: Replace with apiClient.del<ApiResponse<null>>(`/branches/${id}`)
    await delay(300);
    const idx = mockBranches.findIndex((b) => b.id === id);
    if (idx !== -1) mockBranches[idx].status = 'inactive';
    return { success: true, data: null, message: 'Branch deleted' };
  },

  // ─── Warehouses (PENDING — mock) ────────────────────────────
  listWarehouses: async (branch_id?: string): Promise<ApiResponse<Warehouse[]>> => {
    // TODO: Replace with apiClient.get<ApiResponse<Warehouse[]>>('/warehouses', { branch_id })
    await delay(400);
    const filtered = branch_id
      ? mockWarehouses.filter((w) => w.branch_id === branch_id)
      : mockWarehouses;
    return { success: true, data: filtered };
  },

  getWarehouse: async (id: string): Promise<ApiResponse<Warehouse>> => {
    await delay(300);
    const wh = mockWarehouses.find((w) => w.id === id);
    if (!wh) throw new Error('Warehouse not found');
    return { success: true, data: wh };
  },

  createWarehouse: async (data: Partial<Warehouse>): Promise<ApiResponse<Warehouse>> => {
    await delay(500);
    const newWh: Warehouse = {
      id: crypto.randomUUID(),
      company_id: 'c1',
      branch_id: data.branch_id || '',
      branch_name: mockBranches.find((b) => b.id === data.branch_id)?.name || '',
      name: data.name || '',
      code: data.code || '',
      warehouse_type: data.warehouse_type || 'main',
      address: data.address || '',
      status: 'active',
      created_at: new Date().toISOString(),
    };
    mockWarehouses.push(newWh);
    return { success: true, data: newWh };
  },

  updateWarehouse: async (id: string, data: Partial<Warehouse>): Promise<ApiResponse<Warehouse>> => {
    await delay(500);
    const idx = mockWarehouses.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error('Warehouse not found');
    mockWarehouses[idx] = { ...mockWarehouses[idx], ...data };
    return { success: true, data: mockWarehouses[idx] };
  },

  deleteWarehouse: async (id: string): Promise<ApiResponse<null>> => {
    await delay(300);
    const idx = mockWarehouses.findIndex((w) => w.id === id);
    if (idx !== -1) mockWarehouses[idx].status = 'inactive';
    return { success: true, data: null, message: 'Warehouse deleted' };
  },

  // ─── Users (PENDING — mock) ─────────────────────────────────
  listUsers: async (): Promise<ApiResponse<User[]>> => {
    await delay(400);
    return { success: true, data: mockUsers };
  },

  getUser: async (id: string): Promise<ApiResponse<User>> => {
    await delay(300);
    const user = mockUsers.find((u) => u.id === id);
    if (!user) throw new Error('User not found');
    return { success: true, data: user };
  },

  createUser: async (data: Partial<User> & { password?: string }): Promise<ApiResponse<User>> => {
    await delay(500);
    const newUser: User = {
      id: crypto.randomUUID(),
      company_id: 'c1',
      username: data.username || '',
      full_name: data.full_name || '',
      email: data.email || '',
      phone: data.phone || '',
      role_id: data.role_id || '',
      role_name: mockRoles.find((r) => r.id === data.role_id)?.name || '',
      branch_id: data.branch_id || '',
      branch_name: mockBranches.find((b) => b.id === data.branch_id)?.name || '',
      status: 'active',
      last_login: null,
      created_at: new Date().toISOString(),
    };
    mockUsers.push(newUser);
    return { success: true, data: newUser };
  },

  updateUser: async (id: string, data: Partial<User>): Promise<ApiResponse<User>> => {
    await delay(500);
    const idx = mockUsers.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('User not found');
    mockUsers[idx] = { ...mockUsers[idx], ...data };
    return { success: true, data: mockUsers[idx] };
  },

  // ─── Roles & Permissions ───────────────────────────────────
  listRoles: async (): Promise<ApiResponse<Role[]>> => {
    try {
      return await apiClient.get<ApiResponse<Role[]>>('/roles');
    } catch {
      // Fallback to mock data if endpoint is not available
      await delay(400);
      return { success: true, data: mockRoles };
    }
  },

  getRole: async (id: string): Promise<ApiResponse<Role>> => {
    await delay(300);
    const role = mockRoles.find((r) => r.id === id);
    if (!role) throw new Error('Role not found');
    return { success: true, data: role };
  },

  createRole: async (data: Partial<Role>): Promise<ApiResponse<Role>> => {
    await delay(500);
    const newRole: Role = {
      id: crypto.randomUUID(),
      company_id: 'c1',
      name: data.name || '',
      description: data.description || '',
      is_system_role: false,
      user_count: 0,
      permissions: data.permissions || [],
    };
    mockRoles.push(newRole);
    return { success: true, data: newRole };
  },

  updateRolePermissions: async (id: string, permissions: { permission_id: string; granted: boolean }[]): Promise<ApiResponse<Role>> => {
    await delay(500);
    const role = mockRoles.find((r) => r.id === id);
    if (!role) throw new Error('Role not found');
    permissions.forEach((p) => {
      const perm = role.permissions.find((rp) => rp.id === p.permission_id);
      if (perm) perm.granted = p.granted;
    });
    return { success: true, data: role };
  },

  // ─── Document Sequences (PENDING — mock) ────────────────────
  listSequences: async (): Promise<ApiResponse<DocumentSequence[]>> => {
    await delay(400);
    return { success: true, data: mockSequences };
  },

  updateSequence: async (id: string, data: Partial<DocumentSequence>): Promise<ApiResponse<DocumentSequence>> => {
    await delay(500);
    const idx = mockSequences.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Sequence not found');
    mockSequences[idx] = { ...mockSequences[idx], ...data };
    // Recalculate preview
    const s = mockSequences[idx];
    s.preview = `${s.prefix}${String(s.next_number).padStart(s.padding, '0')}${s.suffix}`;
    return { success: true, data: mockSequences[idx] };
  },
};

// ─── Helpers ────────────────────────────────────────────────────
function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

// ─── Mock Data ──────────────────────────────────────────────────
const mockBranches: Branch[] = [
  {
    id: 'br-1', company_id: 'c1', name: 'Head Office', code: 'HO',
    address_line1: '123 Industrial Area', address_line2: 'Phase 2',
    city: 'Ahmedabad', state: 'Gujarat', state_code: '24', pin_code: '380015',
    gstin: '24AABCU9603R1ZM', phone: '+91 79 2654 7890', email: 'ho@company.com',
    is_main: true, status: 'active', created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'br-2', company_id: 'c1', name: 'Pune Branch', code: 'PB',
    address_line1: '45 MIDC Road', address_line2: '',
    city: 'Pune', state: 'Maharashtra', state_code: '27', pin_code: '411018',
    gstin: '27AABCU9603R1ZK', phone: '+91 20 2567 1234', email: 'pune@company.com',
    is_main: false, status: 'active', created_at: '2024-03-10T10:00:00Z',
  },
];

const mockWarehouses: Warehouse[] = [
  {
    id: 'wh-1', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office',
    name: 'Main Store', code: 'WH-MAIN', warehouse_type: 'main',
    address: 'Building A, Industrial Area', status: 'active', created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'wh-2', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office',
    name: 'Raw Material Store', code: 'WH-RM', warehouse_type: 'raw_material',
    address: 'Building B, Industrial Area', status: 'active', created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'wh-3', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office',
    name: 'Finished Goods', code: 'WH-FG', warehouse_type: 'finished_goods',
    address: 'Building C, Industrial Area', status: 'active', created_at: '2024-02-01T10:00:00Z',
  },
  {
    id: 'wh-4', company_id: 'c1', branch_id: 'br-2', branch_name: 'Pune Branch',
    name: 'Pune Warehouse', code: 'WH-PUN', warehouse_type: 'main',
    address: 'MIDC Road, Pune', status: 'active', created_at: '2024-03-10T10:00:00Z',
  },
];

const allPermissions: RolePermission[] = [
  { id: 'p1', module: 'sales', action: 'view', description: 'View sales documents', granted: false },
  { id: 'p2', module: 'sales', action: 'create', description: 'Create sales documents', granted: false },
  { id: 'p3', module: 'sales', action: 'edit', description: 'Edit sales documents', granted: false },
  { id: 'p4', module: 'sales', action: 'delete', description: 'Delete sales documents', granted: false },
  { id: 'p5', module: 'sales', action: 'approve', description: 'Approve sales documents', granted: false },
  { id: 'p6', module: 'purchase', action: 'view', description: 'View purchase documents', granted: false },
  { id: 'p7', module: 'purchase', action: 'create', description: 'Create purchase documents', granted: false },
  { id: 'p8', module: 'purchase', action: 'edit', description: 'Edit purchase documents', granted: false },
  { id: 'p9', module: 'purchase', action: 'delete', description: 'Delete purchase documents', granted: false },
  { id: 'p10', module: 'purchase', action: 'approve', description: 'Approve purchase documents', granted: false },
  { id: 'p11', module: 'inventory', action: 'view', description: 'View inventory', granted: false },
  { id: 'p12', module: 'inventory', action: 'create', description: 'Create inventory transactions', granted: false },
  { id: 'p13', module: 'inventory', action: 'edit', description: 'Edit inventory transactions', granted: false },
  { id: 'p14', module: 'inventory', action: 'approve', description: 'Approve inventory transactions', granted: false },
  { id: 'p15', module: 'manufacturing', action: 'view', description: 'View manufacturing', granted: false },
  { id: 'p16', module: 'manufacturing', action: 'create', description: 'Create work orders', granted: false },
  { id: 'p17', module: 'manufacturing', action: 'edit', description: 'Edit work orders', granted: false },
  { id: 'p18', module: 'manufacturing', action: 'approve', description: 'Approve work orders', granted: false },
  { id: 'p19', module: 'finance', action: 'view', description: 'View financial data', granted: false },
  { id: 'p20', module: 'finance', action: 'create', description: 'Create financial entries', granted: false },
  { id: 'p21', module: 'finance', action: 'edit', description: 'Edit financial entries', granted: false },
  { id: 'p22', module: 'finance', action: 'approve', description: 'Approve financial entries', granted: false },
  { id: 'p23', module: 'settings', action: 'view', description: 'View settings', granted: false },
  { id: 'p24', module: 'settings', action: 'manage', description: 'Manage settings', granted: false },
  { id: 'p25', module: 'reports', action: 'view', description: 'View reports', granted: false },
  { id: 'p26', module: 'reports', action: 'export', description: 'Export reports', granted: false },
];

const mockRoles: Role[] = [
  {
    id: 'role-1', company_id: 'c1', name: 'Admin', description: 'Full system access',
    is_system_role: true, user_count: 1,
    permissions: allPermissions.map((p) => ({ ...p, granted: true })),
  },
  {
    id: 'role-2', company_id: 'c1', name: 'Manager', description: 'Department manager with approval rights',
    is_system_role: false, user_count: 3,
    permissions: allPermissions.map((p) => ({
      ...p,
      granted: ['view', 'create', 'edit', 'approve'].includes(p.action) && !p.module.includes('settings'),
    })),
  },
  {
    id: 'role-3', company_id: 'c1', name: 'Operator', description: 'Day-to-day data entry',
    is_system_role: false, user_count: 5,
    permissions: allPermissions.map((p) => ({
      ...p,
      granted: ['view', 'create'].includes(p.action) && !p.module.includes('settings') && !p.module.includes('finance'),
    })),
  },
  {
    id: 'role-4', company_id: 'c1', name: 'Viewer', description: 'Read-only access',
    is_system_role: true, user_count: 2,
    permissions: allPermissions.map((p) => ({ ...p, granted: p.action === 'view' })),
  },
];

const mockUsers: User[] = [
  {
    id: 'u-1', company_id: 'c1', username: 'admin', full_name: 'Rajesh Kumar',
    email: 'rajesh@company.com', phone: '+91 98765 43210', role_id: 'role-1', role_name: 'Admin',
    branch_id: 'br-1', branch_name: 'Head Office', status: 'active',
    last_login: '2025-02-20T09:30:00Z', created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'u-2', company_id: 'c1', username: 'mgr_sales', full_name: 'Priya Sharma',
    email: 'priya@company.com', phone: '+91 98765 43211', role_id: 'role-2', role_name: 'Manager',
    branch_id: 'br-1', branch_name: 'Head Office', status: 'active',
    last_login: '2025-02-19T14:45:00Z', created_at: '2024-02-01T10:00:00Z',
  },
  {
    id: 'u-3', company_id: 'c1', username: 'store_op', full_name: 'Amit Patel',
    email: 'amit@company.com', phone: '+91 98765 43212', role_id: 'role-3', role_name: 'Operator',
    branch_id: 'br-1', branch_name: 'Head Office', status: 'active',
    last_login: '2025-02-20T08:15:00Z', created_at: '2024-02-15T10:00:00Z',
  },
  {
    id: 'u-4', company_id: 'c1', username: 'pune_mgr', full_name: 'Suresh Deshmukh',
    email: 'suresh@company.com', phone: '+91 98765 43213', role_id: 'role-2', role_name: 'Manager',
    branch_id: 'br-2', branch_name: 'Pune Branch', status: 'active',
    last_login: '2025-02-18T16:00:00Z', created_at: '2024-03-10T10:00:00Z',
  },
  {
    id: 'u-5', company_id: 'c1', username: 'viewer1', full_name: 'Neha Gupta',
    email: 'neha@company.com', phone: '+91 98765 43214', role_id: 'role-4', role_name: 'Viewer',
    branch_id: 'br-1', branch_name: 'Head Office', status: 'inactive',
    last_login: null, created_at: '2024-06-01T10:00:00Z',
  },
];

const mockSequences: DocumentSequence[] = [
  { id: 'seq-1', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office', document_type: 'sales_quotation', prefix: 'SQ/', suffix: '', next_number: 1042, padding: 5, preview: 'SQ/01042', status: 'active' },
  { id: 'seq-2', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office', document_type: 'sales_order', prefix: 'SO/', suffix: '', next_number: 876, padding: 5, preview: 'SO/00876', status: 'active' },
  { id: 'seq-3', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office', document_type: 'sales_invoice', prefix: 'INV/', suffix: '/24-25', next_number: 651, padding: 5, preview: 'INV/00651/24-25', status: 'active' },
  { id: 'seq-4', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office', document_type: 'purchase_order', prefix: 'PO/', suffix: '', next_number: 423, padding: 5, preview: 'PO/00423', status: 'active' },
  { id: 'seq-5', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office', document_type: 'delivery_challan', prefix: 'DC/', suffix: '', next_number: 312, padding: 4, preview: 'DC/0312', status: 'active' },
  { id: 'seq-6', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office', document_type: 'credit_note', prefix: 'CN/', suffix: '', next_number: 89, padding: 4, preview: 'CN/0089', status: 'active' },
  { id: 'seq-7', company_id: 'c1', branch_id: 'br-1', branch_name: 'Head Office', document_type: 'work_order', prefix: 'WO/', suffix: '', next_number: 234, padding: 5, preview: 'WO/00234', status: 'active' },
  { id: 'seq-8', company_id: 'c1', branch_id: 'br-2', branch_name: 'Pune Branch', document_type: 'sales_invoice', prefix: 'PUN/INV/', suffix: '/24-25', next_number: 112, padding: 4, preview: 'PUN/INV/0112/24-25', status: 'active' },
  { id: 'seq-9', company_id: 'c1', branch_id: 'br-2', branch_name: 'Pune Branch', document_type: 'purchase_order', prefix: 'PUN/PO/', suffix: '', next_number: 78, padding: 4, preview: 'PUN/PO/0078', status: 'active' },
];