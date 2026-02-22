// =============================================================
// File: server/services/insights.service.ts
// Module: Business Insights — Phase 12 (Step 45)
// Description: Actionable business intelligence dashboard
//   - Fast/slow moving items
//   - Low stock predictions (days until stockout)
//   - Overstock detection
//   - Margin analysis
//   - Vendor reliability scoring
//   - Customer payment risk
//   - Branch/product profitability
// =============================================================

import { BaseService } from './base.service';

class InsightsService extends BaseService {
  constructor() {
    super('stock_summary'); // Primary table for many queries
  }

  // ═══════════════════════════════════════════════════════════
  // 1. FAST / SLOW MOVING ITEMS
  // Based on stock_ledger outward movements in the last N days
  // ═══════════════════════════════════════════════════════════

  async getItemMovementAnalysis(companyId: string, options: {
    days?: number;
    branch_id?: string;
    category?: 'fast' | 'slow' | 'dead' | 'all';
    limit?: number;
  } = {}) {
    const { days = 90, branch_id, category = 'all', limit: maxResults = 50 } = options;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await this.db.raw(`
      WITH movement AS (
        SELECT
          sl.item_id,
          SUM(sl.quantity_out) as total_out,
          COUNT(DISTINCT sl.transaction_date) as movement_days,
          MAX(sl.transaction_date) as last_movement
        FROM stock_ledger sl
        WHERE sl.company_id = ?
          AND sl.transaction_date >= ?
          AND sl.quantity_out > 0
          ${branch_id ? 'AND sl.branch_id = ?' : ''}
        GROUP BY sl.item_id
      ),
      stock AS (
        SELECT item_id, SUM(available_quantity) as total_stock
        FROM stock_summary
        WHERE company_id = ?
        GROUP BY item_id
      ),
      classified AS (
        SELECT
          i.id as item_id, i.item_code, i.name as item_name, i.item_type,
          COALESCE(m.total_out, 0) as total_consumed,
          COALESCE(m.movement_days, 0) as movement_days,
          m.last_movement,
          COALESCE(s.total_stock, 0) as current_stock,
          CASE
            WHEN COALESCE(m.total_out, 0) = 0 THEN 'dead'
            WHEN m.movement_days >= ? * 0.3 THEN 'fast'
            WHEN m.movement_days >= ? * 0.1 THEN 'normal'
            ELSE 'slow'
          END as movement_category,
          CASE
            WHEN COALESCE(m.total_out, 0) > 0 THEN ROUND(m.total_out / ?, 4)
            ELSE 0
          END as avg_daily_consumption
        FROM items i
        LEFT JOIN movement m ON i.id = m.item_id
        LEFT JOIN stock s ON i.id = s.item_id
        WHERE i.company_id = ? AND i.is_deleted = FALSE AND i.status = 'active'
      )
      SELECT * FROM classified
      ${category !== 'all' ? 'WHERE movement_category = ?' : ''}
      ORDER BY
        CASE movement_category
          WHEN 'dead' THEN 1
          WHEN 'slow' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'fast' THEN 4
        END,
        total_consumed DESC
      LIMIT ?
    `, [
      companyId, cutoff,
      ...(branch_id ? [branch_id] : []),
      companyId,
      days, days, days,
      companyId,
      ...(category !== 'all' ? [category] : []),
      maxResults,
    ]);

    // Summary counts
    const summaryResult = await this.db.raw(`
      WITH movement AS (
        SELECT sl.item_id, COUNT(DISTINCT sl.transaction_date) as movement_days
        FROM stock_ledger sl
        WHERE sl.company_id = ? AND sl.transaction_date >= ? AND sl.quantity_out > 0
        ${branch_id ? 'AND sl.branch_id = ?' : ''}
        GROUP BY sl.item_id
      )
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(m.movement_days, 0) = 0) as dead_count,
        COUNT(*) FILTER (WHERE m.movement_days > 0 AND m.movement_days < ? * 0.1) as slow_count,
        COUNT(*) FILTER (WHERE m.movement_days >= ? * 0.1 AND m.movement_days < ? * 0.3) as normal_count,
        COUNT(*) FILTER (WHERE m.movement_days >= ? * 0.3) as fast_count
      FROM items i
      LEFT JOIN movement m ON i.id = m.item_id
      WHERE i.company_id = ? AND i.is_deleted = FALSE AND i.status = 'active'
    `, [
      companyId, cutoff,
      ...(branch_id ? [branch_id] : []),
      days, days, days, days, companyId,
    ]);

    const summary = summaryResult.rows?.[0] || {};

    return {
      period_days: days,
      data: result.rows || [],
      summary: {
        fast: parseInt(summary.fast_count || '0', 10),
        normal: parseInt(summary.normal_count || '0', 10),
        slow: parseInt(summary.slow_count || '0', 10),
        dead: parseInt(summary.dead_count || '0', 10),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 2. LOW STOCK PREDICTIONS (days until stockout)
  // ═══════════════════════════════════════════════════════════

  async getStockoutPredictions(companyId: string, options: {
    branch_id?: string;
    days_lookback?: number;
    limit?: number;
  } = {}) {
    const { branch_id, days_lookback = 30, limit: maxResults = 50 } = options;
    const cutoff = new Date(Date.now() - days_lookback * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await this.db.raw(`
      WITH consumption AS (
        SELECT item_id, warehouse_id,
          SUM(quantity_out) / ? as avg_daily
        FROM stock_ledger
        WHERE company_id = ? AND transaction_date >= ? AND quantity_out > 0
        ${branch_id ? 'AND branch_id = ?' : ''}
        GROUP BY item_id, warehouse_id
        HAVING SUM(quantity_out) > 0
      )
      SELECT
        ss.item_id, i.item_code, i.name as item_name,
        ss.warehouse_id, w.name as warehouse_name,
        ss.available_quantity as current_stock,
        ROUND(c.avg_daily, 4) as avg_daily_consumption,
        CASE
          WHEN c.avg_daily > 0 THEN ROUND(ss.available_quantity / c.avg_daily, 1)
          ELSE NULL
        END as days_until_stockout,
        i.min_stock_threshold,
        i.reorder_quantity,
        COALESCE(u.symbol, u.code) as uom_symbol
      FROM stock_summary ss
      JOIN items i ON ss.item_id = i.id
      JOIN warehouses w ON ss.warehouse_id = w.id
      JOIN consumption c ON ss.item_id = c.item_id AND ss.warehouse_id = c.warehouse_id
      LEFT JOIN units_of_measurement u ON i.primary_uom_id = u.id
      WHERE ss.company_id = ? AND ss.available_quantity > 0 AND i.is_deleted = FALSE
      ORDER BY days_until_stockout ASC NULLS LAST
      LIMIT ?
    `, [
      days_lookback, companyId, cutoff,
      ...(branch_id ? [branch_id] : []),
      companyId, maxResults,
    ]);

    return { data: result.rows || [], lookback_days: days_lookback };
  }

  // ═══════════════════════════════════════════════════════════
  // 3. MARGIN ANALYSIS
  // Compare purchase price vs selling price and actual costs
  // ═══════════════════════════════════════════════════════════

  async getMarginAnalysis(companyId: string, options: {
    branch_id?: string;
    days?: number;
    limit?: number;
  } = {}) {
    const { branch_id, days = 90, limit: maxResults = 50 } = options;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Items with both purchase and selling price — calculate margin
    const result = await this.db.raw(`
      SELECT
        i.id as item_id, i.item_code, i.name as item_name,
        i.purchase_price, i.selling_price,
        CASE
          WHEN i.selling_price > 0 THEN ROUND((i.selling_price - COALESCE(i.purchase_price, 0)) / i.selling_price * 100, 2)
          ELSE 0
        END as margin_percentage,
        ROUND(i.selling_price - COALESCE(i.purchase_price, 0), 2) as margin_amount,
        ss.valuation_rate as current_valuation_rate,
        CASE
          WHEN i.selling_price > 0 AND ss.valuation_rate > 0
          THEN ROUND((i.selling_price - ss.valuation_rate) / i.selling_price * 100, 2)
          ELSE NULL
        END as effective_margin_pct
      FROM items i
      LEFT JOIN (
        SELECT item_id, AVG(valuation_rate) as valuation_rate
        FROM stock_summary WHERE company_id = ?
        GROUP BY item_id
      ) ss ON i.id = ss.item_id
      WHERE i.company_id = ? AND i.is_deleted = FALSE AND i.status = 'active'
        AND i.selling_price > 0
      ORDER BY margin_percentage ASC
      LIMIT ?
    `, [companyId, companyId, maxResults]);

    return { data: result.rows || [], period_days: days };
  }

  // ═══════════════════════════════════════════════════════════
  // 4. VENDOR RELIABILITY SCORING
  // ═══════════════════════════════════════════════════════════

  async getVendorReliability(companyId: string, options: { limit?: number } = {}) {
    const { limit: maxResults = 50 } = options;

    const result = await this.db.raw(`
      SELECT
        v.id as vendor_id, v.vendor_code, v.name as vendor_name,
        v.reliability_score,
        v.average_lead_days,
        v.is_preferred,
        v.payment_terms_days,
        COUNT(DISTINCT po.id) as total_pos,
        COUNT(DISTINCT grn.id) as total_grns,
        ROUND(AVG(
          CASE WHEN grn.grn_date IS NOT NULL AND po.expected_delivery_date IS NOT NULL
          THEN EXTRACT(DAY FROM grn.grn_date::timestamp - po.expected_delivery_date::timestamp)
          ELSE NULL END
        ), 1) as avg_delivery_variance_days
      FROM vendors v
      LEFT JOIN purchase_orders po ON v.id = po.vendor_id AND po.company_id = ? AND po.is_deleted = FALSE
      LEFT JOIN goods_receipt_notes grn ON po.id = grn.purchase_order_id AND grn.is_deleted = FALSE
      WHERE v.company_id = ? AND v.is_deleted = FALSE AND v.status = 'active'
      GROUP BY v.id, v.vendor_code, v.name, v.reliability_score, v.average_lead_days, v.is_preferred, v.payment_terms_days
      ORDER BY v.reliability_score DESC NULLS LAST
      LIMIT ?
    `, [companyId, companyId, maxResults]);

    return { data: result.rows || [] };
  }

  // ═══════════════════════════════════════════════════════════
  // 5. CUSTOMER PAYMENT RISK
  // Based on payment patterns and outstanding amounts
  // ═══════════════════════════════════════════════════════════

  async getCustomerPaymentRisk(companyId: string, options: { limit?: number } = {}) {
    const { limit: maxResults = 50 } = options;

    const result = await this.db.raw(`
      SELECT
        c.id as customer_id, c.customer_code, c.name as customer_name,
        c.credit_limit,
        c.payment_terms_days,
        COUNT(si.id) as total_invoices,
        COALESCE(SUM(si.grand_total), 0) as total_invoiced,
        COALESCE(SUM(CASE WHEN si.status IN ('sent', 'overdue') THEN si.grand_total ELSE 0 END), 0) as outstanding_amount,
        CASE
          WHEN c.credit_limit > 0
          THEN ROUND(COALESCE(SUM(CASE WHEN si.status IN ('sent', 'overdue') THEN si.grand_total ELSE 0 END), 0) / c.credit_limit * 100, 2)
          ELSE NULL
        END as credit_utilization_pct,
        COUNT(CASE WHEN si.status = 'overdue' THEN 1 END) as overdue_count,
        CASE
          WHEN COUNT(CASE WHEN si.status = 'overdue' THEN 1 END) > 3 THEN 'high'
          WHEN COUNT(CASE WHEN si.status = 'overdue' THEN 1 END) > 0 THEN 'medium'
          ELSE 'low'
        END as payment_risk
      FROM customers c
      LEFT JOIN sales_invoices si ON c.id = si.customer_id AND si.company_id = ? AND si.is_deleted = FALSE
      WHERE c.company_id = ? AND c.is_deleted = FALSE AND c.status = 'active'
      GROUP BY c.id, c.customer_code, c.name, c.credit_limit, c.payment_terms_days
      HAVING COALESCE(SUM(si.grand_total), 0) > 0
      ORDER BY outstanding_amount DESC
      LIMIT ?
    `, [companyId, companyId, maxResults]);

    return { data: result.rows || [] };
  }

  // ═══════════════════════════════════════════════════════════
  // 6. BRANCH PROFITABILITY
  // Revenue vs Cost of Goods per branch
  // ═══════════════════════════════════════════════════════════

  async getBranchProfitability(companyId: string, options: { days?: number } = {}) {
    const { days = 90 } = options;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await this.db.raw(`
      SELECT
        b.id as branch_id, b.name as branch_name, b.code as branch_code,
        COALESCE(sales.total_revenue, 0) as total_revenue,
        COALESCE(purchase.total_cost, 0) as total_cost,
        ROUND(COALESCE(sales.total_revenue, 0) - COALESCE(purchase.total_cost, 0), 2) as gross_profit,
        CASE
          WHEN COALESCE(sales.total_revenue, 0) > 0
          THEN ROUND((COALESCE(sales.total_revenue, 0) - COALESCE(purchase.total_cost, 0)) / sales.total_revenue * 100, 2)
          ELSE 0
        END as gross_margin_pct,
        COALESCE(sales.invoice_count, 0) as invoice_count,
        COALESCE(purchase.bill_count, 0) as bill_count
      FROM branches b
      LEFT JOIN (
        SELECT branch_id, SUM(grand_total) as total_revenue, COUNT(*) as invoice_count
        FROM sales_invoices
        WHERE company_id = ? AND is_deleted = FALSE AND invoice_date >= ?
          AND status NOT IN ('draft', 'cancelled')
        GROUP BY branch_id
      ) sales ON b.id = sales.branch_id
      LEFT JOIN (
        SELECT branch_id, SUM(grand_total) as total_cost, COUNT(*) as bill_count
        FROM vendor_bills
        WHERE company_id = ? AND is_deleted = FALSE AND bill_date >= ?
          AND status NOT IN ('draft', 'cancelled')
        GROUP BY branch_id
      ) purchase ON b.id = purchase.branch_id
      WHERE b.company_id = ? AND b.is_deleted = FALSE
      ORDER BY gross_profit DESC
    `, [companyId, cutoff, companyId, cutoff, companyId]);

    return { data: result.rows || [], period_days: days };
  }

  // ═══════════════════════════════════════════════════════════
  // 7. COMBINED DASHBOARD SUMMARY
  // ═══════════════════════════════════════════════════════════

  async getDashboardSummary(companyId: string) {
    // Low stock count
    const lowStockResult = await this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .where('ss.company_id', companyId)
      .whereNotNull('i.min_stock_threshold')
      .where('i.min_stock_threshold', '>', 0)
      .where('i.is_deleted', false)
      .whereRaw('ss.available_quantity < i.min_stock_threshold')
      .count('ss.id as cnt').first();

    // Overstock count
    const overstockResult = await this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .where('ss.company_id', companyId)
      .whereNotNull('i.max_stock_level')
      .where('i.max_stock_level', '>', 0)
      .where('i.is_deleted', false)
      .whereRaw('ss.available_quantity > i.max_stock_level')
      .count('ss.id as cnt').first();

    // Pending approvals
    const pendingApprovals = await this.db('approval_queue')
      .where({ company_id: companyId, action: 'pending', is_deleted: false })
      .count('id as cnt').first();

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

    // Active work orders
    const workOrders = await this.db('work_orders')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['released', 'in_progress'])
      .count('id as cnt').first();

    // Total inventory value
    const inventoryValue = await this.db('stock_summary')
      .where({ company_id: companyId })
      .sum('total_value as total').first();

    return {
      low_stock_items: parseInt(String(lowStockResult?.cnt || '0'), 10),
      overstock_items: parseInt(String(overstockResult?.cnt || '0'), 10),
      pending_approvals: parseInt(String(pendingApprovals?.cnt || '0'), 10),
      outstanding_receivables: parseFloat(String(receivables?.total || '0')),
      outstanding_payables: parseFloat(String(payables?.total || '0')),
      active_work_orders: parseInt(String(workOrders?.cnt || '0'), 10),
      total_inventory_value: parseFloat(String(inventoryValue?.total || '0')),
    };
  }
}

export const insightsService = new InsightsService();