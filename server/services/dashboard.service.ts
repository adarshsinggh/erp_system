// =============================================================
// File: server/services/dashboard.service.ts
// Module: UI/UX Polish — Phase 16 (Steps 51 & 52)
// Description:
//   Step 51 — Keyboard shortcut configuration per user/role
//   Step 52 — Role-based dashboard data aggregation:
//     - Owner: P&L, revenue trends, outstanding, inventory value
//     - Purchase Manager: stock alerts, pending PRs/POs, reorder
//     - Sales: pipeline, recent invoices, top customers
//     - Shop Floor: active work orders, production today, materials
//     - Quick actions per role
//     - Recent transactions (user-scoped)
//     - Pending approvals for current user
// =============================================================

import { BaseService } from './base.service';

// ─────────────────────────────────────────────────────────────
// Default keyboard shortcuts (frontend will consume this)
// ─────────────────────────────────────────────────────────────

const DEFAULT_SHORTCUTS = {
  global: [
    { key: 'ctrl+k', action: 'command_palette', label: 'Command Palette' },
    { key: 'alt+h', action: 'navigate_home', label: 'Home / Dashboard' },
    { key: 'alt+s', action: 'navigate_sales', label: 'Sales Module' },
    { key: 'alt+p', action: 'navigate_purchase', label: 'Purchase Module' },
    { key: 'alt+i', action: 'navigate_inventory', label: 'Inventory Module' },
    { key: 'alt+m', action: 'navigate_manufacturing', label: 'Manufacturing Module' },
    { key: 'alt+f', action: 'navigate_finance', label: 'Finance Module' },
    { key: 'alt+r', action: 'navigate_reports', label: 'Reports' },
    { key: 'alt+n', action: 'toggle_notifications', label: 'Notifications' },
    { key: 'escape', action: 'close_modal', label: 'Close Modal / Cancel' },
  ],
  forms: [
    { key: 'ctrl+enter', action: 'save_form', label: 'Save Current Form' },
    { key: 'ctrl+shift+s', action: 'save_and_new', label: 'Save & New' },
    { key: 'ctrl+d', action: 'duplicate', label: 'Duplicate Record' },
    { key: 'ctrl+shift+d', action: 'delete', label: 'Delete Record' },
    { key: 'ctrl+p', action: 'print', label: 'Print / PDF' },
  ],
  tables: [
    { key: 'ctrl+f', action: 'search_focus', label: 'Focus Search' },
    { key: 'ctrl+n', action: 'new_record', label: 'New Record' },
    { key: 'enter', action: 'open_selected', label: 'Open Selected Row' },
    { key: 'ctrl+e', action: 'export', label: 'Export Data' },
  ],
  quick_create: [
    { key: 'alt+shift+q', action: 'new_quotation', label: 'New Quotation' },
    { key: 'alt+shift+o', action: 'new_sales_order', label: 'New Sales Order' },
    { key: 'alt+shift+i', action: 'new_invoice', label: 'New Invoice' },
    { key: 'alt+shift+p', action: 'new_purchase_order', label: 'New Purchase Order' },
    { key: 'alt+shift+w', action: 'new_work_order', label: 'New Work Order' },
  ],
};

// ─────────────────────────────────────────────────────────────

class DashboardService extends BaseService {
  constructor() {
    super('companies');
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 51: KEYBOARD SHORTCUTS CONFIG
  // ═══════════════════════════════════════════════════════════

  /**
   * Get keyboard shortcuts — defaults merged with user customizations
   */
  async getShortcuts(companyId: string, userId: string) {
    const user = await this.db('users').where({ id: userId, company_id: companyId }).first();
    const customShortcuts = user?.metadata?.keyboard_shortcuts || {};

    // Merge: user overrides on top of defaults
    const merged = { ...DEFAULT_SHORTCUTS };
    for (const category of Object.keys(customShortcuts)) {
      if (merged[category as keyof typeof merged]) {
        const customs = customShortcuts[category] as any[];
        for (const custom of customs) {
          const idx = (merged[category as keyof typeof merged] as any[])
            .findIndex((s: any) => s.action === custom.action);
          if (idx >= 0) {
            (merged[category as keyof typeof merged] as any[])[idx].key = custom.key;
          }
        }
      }
    }

    return merged;
  }

  /**
   * Update a user's custom keyboard shortcuts
   */
  async updateShortcuts(companyId: string, userId: string, shortcuts: Record<string, any[]>) {
    const user = await this.db('users').where({ id: userId, company_id: companyId }).first();
    if (!user) throw new Error('User not found');

    const metadata = user.metadata || {};
    metadata.keyboard_shortcuts = shortcuts;

    await this.db('users')
      .where({ id: userId })
      .update({ metadata: JSON.stringify(metadata), updated_by: userId });

    return this.getShortcuts(companyId, userId);
  }

  /**
   * Reset shortcuts to defaults
   */
  async resetShortcuts(companyId: string, userId: string) {
    const user = await this.db('users').where({ id: userId, company_id: companyId }).first();
    if (!user) throw new Error('User not found');

    const metadata = user.metadata || {};
    delete metadata.keyboard_shortcuts;

    await this.db('users')
      .where({ id: userId })
      .update({ metadata: JSON.stringify(metadata), updated_by: userId });

    return DEFAULT_SHORTCUTS;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP 52: ROLE-BASED DASHBOARD
  // ═══════════════════════════════════════════════════════════

  /**
   * Main dashboard — returns data based on user's role
   */
  async getDashboard(companyId: string, userId: string, roleId: string) {
    // Get role name to determine dashboard type
    const role = await this.db('roles').where({ id: roleId }).first();
    const roleName = (role?.name || '').toLowerCase();

    // Common data for all roles
    const common = await this._getCommonData(companyId, userId);

    // Role-specific widgets
    let roleData: Record<string, any> = {};

    if (roleName.includes('admin') || roleName.includes('owner') || roleName.includes('director')) {
      roleData = await this._getOwnerDashboard(companyId);
    } else if (roleName.includes('purchase')) {
      roleData = await this._getPurchaseDashboard(companyId);
    } else if (roleName.includes('sales')) {
      roleData = await this._getSalesDashboard(companyId);
    } else if (roleName.includes('production') || roleName.includes('shop') || roleName.includes('manufacturing')) {
      roleData = await this._getProductionDashboard(companyId);
    } else if (roleName.includes('account') || roleName.includes('finance')) {
      roleData = await this._getFinanceDashboard(companyId);
    } else {
      // Default: show owner dashboard (most comprehensive)
      roleData = await this._getOwnerDashboard(companyId);
    }

    return {
      role: role?.name || 'unknown',
      ...common,
      ...roleData,
    };
  }

  // ─── Common Data (all roles) ───

  private async _getCommonData(companyId: string, userId: string) {
    // Pending approvals for this user
    const pendingApprovals = await this.db('approval_queue')
      .where({ company_id: companyId, approver_id: userId, action: 'pending', is_deleted: false })
      .select('id', 'document_type', 'document_number', 'amount', 'requested_at')
      .orderBy('requested_at', 'asc')
      .limit(10);

    // Unread notifications count
    const unreadResult = await this.db('notifications')
      .where({ company_id: companyId, user_id: userId, is_read: false, is_dismissed: false })
      .count('id as cnt').first();

    // Recent transactions by this user (across key tables)
    const recentActivity = await this.db('entity_activity')
      .where({ company_id: companyId, created_by: userId })
      .select('entity_type', 'entity_id', 'activity_type', 'description', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(10);

    return {
      pending_approvals: pendingApprovals,
      pending_approval_count: pendingApprovals.length,
      unread_notifications: parseInt(String(unreadResult?.cnt || '0'), 10),
      recent_activity: recentActivity,
    };
  }

  // ─── Owner / Admin Dashboard ───

  private async _getOwnerDashboard(companyId: string) {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Revenue this month
    const monthStart = today.substring(0, 7) + '-01';
    const revenue = await this.db('sales_invoices')
      .where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['draft', 'cancelled'])
      .where('invoice_date', '>=', monthStart)
      .select(
        this.db.raw('SUM(grand_total) as total_revenue'),
        this.db.raw('COUNT(id) as invoice_count')
      ).first();

    // Outstanding receivables
    const receivables = await this.db('sales_invoices')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['sent', 'overdue'])
      .sum('grand_total as total').first();

    // Outstanding payables
    const payables = await this.db('vendor_bills')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['received', 'overdue'])
      .sum('grand_total as total').first();

    // Inventory value
    const inventory = await this.db('stock_summary')
      .where({ company_id: companyId })
      .sum('total_value as total').first();

    // Low stock count
    const lowStock = await this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .where('ss.company_id', companyId)
      .where('i.min_stock_threshold', '>', 0)
      .where('i.is_deleted', false)
      .whereRaw('ss.available_quantity < i.min_stock_threshold')
      .count('ss.id as cnt').first();

    // Open sales orders value (pipeline visibility when no invoices yet)
    const openOrders = await this.db('sales_orders')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['confirmed', 'partial'])
      .select(
        this.db.raw('COALESCE(SUM(grand_total), 0) as total'),
        this.db.raw('COUNT(id) as count')
      ).first();

    // Revenue trend (last 6 months)
    const revenueTrend = await this.db('sales_invoices')
      .where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['draft', 'cancelled'])
      .where('invoice_date', '>=', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .select(
        this.db.raw("TO_CHAR(invoice_date, 'YYYY-MM') as month"),
        this.db.raw('SUM(grand_total) as revenue')
      )
      .groupByRaw("TO_CHAR(invoice_date, 'YYYY-MM')")
      .orderBy('month');

    return {
      dashboard_type: 'owner',
      kpis: {
        revenue_this_month: parseFloat(String(revenue?.total_revenue || '0')),
        invoices_this_month: parseInt(String(revenue?.invoice_count || '0'), 10),
        outstanding_receivables: parseFloat(String(receivables?.total || '0')),
        outstanding_payables: parseFloat(String(payables?.total || '0')),
        total_inventory_value: parseFloat(String(inventory?.total || '0')),
        low_stock_items: parseInt(String(lowStock?.cnt || '0'), 10),
        open_orders_value: parseFloat(String(openOrders?.total || '0')),
        open_orders_count: parseInt(String(openOrders?.count || '0'), 10),
      },
      revenue_trend: revenueTrend,
      quick_actions: [
        { action: 'new_invoice', label: 'Create Invoice', icon: 'file-text' },
        { action: 'view_reports', label: 'View Reports', icon: 'bar-chart' },
        { action: 'view_approvals', label: 'Pending Approvals', icon: 'check-circle' },
        { action: 'view_low_stock', label: 'Low Stock Items', icon: 'alert-triangle' },
      ],
    };
  }

  // ─── Purchase Manager Dashboard ───

  private async _getPurchaseDashboard(companyId: string) {
    // Pending PRs
    const pendingPRs = await this.db('purchase_requisitions')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['draft', 'pending'])
      .count('id as cnt').first();

    // Open POs
    const openPOs = await this.db('purchase_orders')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['approved', 'sent', 'partial'])
      .count('id as cnt').first();

    // Low stock items
    const lowStock = await this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .where('ss.company_id', companyId)
      .where('i.min_stock_threshold', '>', 0)
      .where('i.is_deleted', false)
      .whereRaw('ss.available_quantity < i.min_stock_threshold')
      .select('i.item_code', 'i.name', 'ss.available_quantity', 'i.min_stock_threshold')
      .orderByRaw('ss.available_quantity - i.min_stock_threshold ASC')
      .limit(10);

    // Pending vendor bills
    const pendingBills = await this.db('vendor_bills')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['received', 'overdue'])
      .select(
        this.db.raw('COUNT(id) as count'),
        this.db.raw('SUM(grand_total) as total')
      ).first();

    return {
      dashboard_type: 'purchase',
      kpis: {
        pending_requisitions: parseInt(String(pendingPRs?.cnt || '0'), 10),
        open_purchase_orders: parseInt(String(openPOs?.cnt || '0'), 10),
        pending_vendor_bills: parseInt(String(pendingBills?.count || '0'), 10),
        vendor_bill_amount: parseFloat(String(pendingBills?.total || '0')),
      },
      low_stock_items: lowStock,
      quick_actions: [
        { action: 'new_purchase_order', label: 'Create PO', icon: 'shopping-cart' },
        { action: 'run_reorder', label: 'Run Reorder Check', icon: 'refresh-cw' },
        { action: 'view_low_stock', label: 'Low Stock Items', icon: 'alert-triangle' },
        { action: 'view_vendor_bills', label: 'Vendor Bills', icon: 'file-text' },
      ],
    };
  }

  // ─── Sales Dashboard ───

  private async _getSalesDashboard(companyId: string) {
    const monthStart = new Date().toISOString().split('T')[0].substring(0, 7) + '-01';

    // Sales this month
    const sales = await this.db('sales_invoices')
      .where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['draft', 'cancelled'])
      .where('invoice_date', '>=', monthStart)
      .select(
        this.db.raw('SUM(grand_total) as total'),
        this.db.raw('COUNT(id) as count')
      ).first();

    // Open quotations
    const openQuotes = await this.db('sales_quotations')
      .where({ company_id: companyId, is_deleted: false, status: 'sent' })
      .count('id as cnt').first();

    // Open sales orders
    const openSOs = await this.db('sales_orders')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['confirmed', 'partial'])
      .count('id as cnt').first();

    // Top 5 customers this month
    const topCustomers = await this.db('sales_invoices as si')
      .join('customers as c', 'si.customer_id', 'c.id')
      .where('si.company_id', companyId)
      .where('si.is_deleted', false)
      .whereNotIn('si.status', ['draft', 'cancelled'])
      .where('si.invoice_date', '>=', monthStart)
      .select('c.name as customer_name', this.db.raw('SUM(si.grand_total) as total'))
      .groupBy('c.name')
      .orderBy('total', 'desc')
      .limit(5);

    return {
      dashboard_type: 'sales',
      kpis: {
        sales_this_month: parseFloat(String(sales?.total || '0')),
        invoices_this_month: parseInt(String(sales?.count || '0'), 10),
        open_quotations: parseInt(String(openQuotes?.cnt || '0'), 10),
        open_sales_orders: parseInt(String(openSOs?.cnt || '0'), 10),
      },
      top_customers: topCustomers,
      quick_actions: [
        { action: 'new_quotation', label: 'New Quotation', icon: 'file-plus' },
        { action: 'new_sales_order', label: 'New Sales Order', icon: 'shopping-bag' },
        { action: 'new_invoice', label: 'New Invoice', icon: 'file-text' },
        { action: 'view_outstanding', label: 'Outstanding', icon: 'clock' },
      ],
    };
  }

  // ─── Production / Shop Floor Dashboard ───

  private async _getProductionDashboard(companyId: string) {
    // Active work orders
    const activeWOs = await this.db('work_orders')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['released', 'in_progress'])
      .select('id', 'work_order_number', 'status', 'planned_start_date', 'priority')
      .orderByRaw("CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END")
      .limit(10);

    // Production today
    const today = new Date().toISOString().split('T')[0];
    const prodToday = await this.db('production_entries')
      .where({ company_id: companyId, is_deleted: false })
      .where('production_date', today)
      .select(
        this.db.raw('SUM(quantity_produced) as total_produced'),
        this.db.raw('COUNT(id) as entry_count')
      ).first();

    // Scrap today
    const scrapToday = await this.db('scrap_entries')
      .where({ company_id: companyId, is_deleted: false })
      .where('scrap_date', today)
      .select(
        this.db.raw('SUM(quantity) as total_scrap'),
        this.db.raw('SUM(scrap_value) as scrap_value')
      ).first();

    // Materials pending issue
    const pendingMaterials = await this.db('work_order_materials as wom')
      .join('work_orders as wo', 'wom.work_order_id', 'wo.id')
      .where('wo.company_id', companyId)
      .where('wo.is_deleted', false)
      .whereIn('wo.status', ['released', 'in_progress'])
      .whereRaw('wom.issued_quantity < wom.planned_quantity')
      .count('wom.id as cnt').first();

    return {
      dashboard_type: 'production',
      kpis: {
        active_work_orders: activeWOs.length,
        produced_today: parseFloat(String(prodToday?.total_produced || '0')),
        production_entries_today: parseInt(String(prodToday?.entry_count || '0'), 10),
        scrap_today: parseFloat(String(scrapToday?.total_scrap || '0')),
        scrap_value_today: parseFloat(String(scrapToday?.scrap_value || '0')),
        pending_material_issues: parseInt(String(pendingMaterials?.cnt || '0'), 10),
      },
      active_work_orders: activeWOs,
      quick_actions: [
        { action: 'new_work_order', label: 'New Work Order', icon: 'settings' },
        { action: 'production_entry', label: 'Production Entry', icon: 'plus-circle' },
        { action: 'issue_materials', label: 'Issue Materials', icon: 'package' },
        { action: 'scrap_entry', label: 'Scrap Entry', icon: 'trash-2' },
      ],
    };
  }

  // ─── Finance / Accounts Dashboard ───

  private async _getFinanceDashboard(companyId: string) {
    // Receivables
    const receivables = await this.db('sales_invoices')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['sent', 'overdue'])
      .select(
        this.db.raw('COUNT(id) as count'),
        this.db.raw('SUM(grand_total) as total'),
        this.db.raw("COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count")
      ).first();

    // Payables
    const payables = await this.db('vendor_bills')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['received', 'overdue'])
      .select(
        this.db.raw('COUNT(id) as count'),
        this.db.raw('SUM(grand_total) as total'),
        this.db.raw("COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count")
      ).first();

    // Bank balances
    const banks = await this.db('bank_accounts')
      .where({ company_id: companyId, is_deleted: false, is_active: true })
      .select('bank_name', 'account_name', 'current_balance')
      .orderBy('current_balance', 'desc')
      .limit(5);

    return {
      dashboard_type: 'finance',
      kpis: {
        total_receivables: parseFloat(String(receivables?.total || '0')),
        receivable_count: parseInt(String(receivables?.count || '0'), 10),
        overdue_receivables: parseInt(String(receivables?.overdue_count || '0'), 10),
        total_payables: parseFloat(String(payables?.total || '0')),
        payable_count: parseInt(String(payables?.count || '0'), 10),
        overdue_payables: parseInt(String(payables?.overdue_count || '0'), 10),
      },
      bank_balances: banks,
      quick_actions: [
        { action: 'receive_payment', label: 'Receive Payment', icon: 'dollar-sign' },
        { action: 'make_payment', label: 'Make Payment', icon: 'credit-card' },
        { action: 'view_receivables', label: 'Receivables', icon: 'arrow-down-circle' },
        { action: 'view_payables', label: 'Payables', icon: 'arrow-up-circle' },
      ],
    };
  }
}

export const dashboardService = new DashboardService();