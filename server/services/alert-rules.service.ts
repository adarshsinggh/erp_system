// =============================================================
// File: server/services/alert-rules.service.ts
// Module: Alerts — Phase 12 (Step 43)
// Description: Alert Rules Engine
//   - CRUD for configurable alert rules
//   - Evaluate rules against current data
//   - Generate notifications when conditions met
//   - Supported alert types: low_stock, overstock, payment_due,
//     approval_pending, consumption_anomaly
// =============================================================

import { BaseService, ListOptions } from './base.service';

// ─────────────────────────────────────────────────────────────

const VALID_ALERT_TYPES = ['low_stock', 'overstock', 'payment_due', 'approval_pending', 'consumption_anomaly'] as const;
const VALID_ENTITY_TYPES = ['items', 'products', 'invoices', 'vendor_bills'] as const;

interface CreateAlertRuleInput {
  name: string;
  alert_type: string;
  entity_type?: string;
  entity_id?: string;
  condition_json: Record<string, any>;
  notify_role_ids?: string[];
  notify_user_ids?: string[];
  is_active?: boolean;
}

interface AlertEvalResult {
  rule_id: string;
  rule_name: string;
  alert_type: string;
  triggered: boolean;
  matches: any[];
  notifications_created: number;
}

// ─────────────────────────────────────────────────────────────

class AlertRulesService extends BaseService {
  constructor() {
    super('alert_rules');
  }

  // ═══════════════════════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════════════════════

  async createRule(companyId: string, input: CreateAlertRuleInput, userId: string) {
    if (!input.name?.trim()) throw new Error('Alert rule name is required');

    if (!VALID_ALERT_TYPES.includes(input.alert_type as any)) {
      throw new Error(`Invalid alert_type. Must be one of: ${VALID_ALERT_TYPES.join(', ')}`);
    }
    if (input.entity_type && !VALID_ENTITY_TYPES.includes(input.entity_type as any)) {
      throw new Error(`Invalid entity_type. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`);
    }
    if (!input.condition_json || typeof input.condition_json !== 'object') {
      throw new Error('condition_json is required and must be a JSON object');
    }

    return this.create({
      company_id: companyId,
      name: input.name.trim(),
      alert_type: input.alert_type,
      entity_type: input.entity_type || null,
      entity_id: input.entity_id || null,
      condition_json: JSON.stringify(input.condition_json),
      notify_role_ids: input.notify_role_ids || null,
      notify_user_ids: input.notify_user_ids || null,
      is_active: input.is_active ?? true,
      created_by: userId,
      updated_by: userId,
    });
  }

  async listRules(options: ListOptions & { alert_type?: string }) {
    const { alert_type, ...listOpts } = options;
    const filters: Record<string, any> = {};
    if (alert_type) filters.alert_type = alert_type;

    return this.list({
      ...listOpts,
      filters,
      searchFields: ['name'],
      sortBy: options.sortBy || 'name',
      sortOrder: options.sortOrder || 'asc',
    });
  }

  async getRule(id: string, companyId: string) {
    const rule = await this.getById(id, companyId);
    if (!rule) throw new Error('Alert rule not found');
    return rule;
  }

  async updateRule(id: string, companyId: string, input: Partial<CreateAlertRuleInput>, userId: string) {
    const existing = await this.getById(id, companyId);
    if (!existing) throw new Error('Alert rule not found');

    if (input.alert_type && !VALID_ALERT_TYPES.includes(input.alert_type as any)) {
      throw new Error(`Invalid alert_type`);
    }
    if (input.entity_type && !VALID_ENTITY_TYPES.includes(input.entity_type as any)) {
      throw new Error(`Invalid entity_type`);
    }

    const updateData: Record<string, any> = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.entity_type !== undefined) updateData.entity_type = input.entity_type;
    if (input.entity_id !== undefined) updateData.entity_id = input.entity_id;
    if (input.condition_json !== undefined) updateData.condition_json = JSON.stringify(input.condition_json);
    if (input.notify_role_ids !== undefined) updateData.notify_role_ids = input.notify_role_ids;
    if (input.notify_user_ids !== undefined) updateData.notify_user_ids = input.notify_user_ids;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;

    return this.update(id, companyId, updateData, userId);
  }

  async deleteRule(id: string, companyId: string, userId: string) {
    const existing = await this.getById(id, companyId);
    if (!existing) throw new Error('Alert rule not found');
    return this.softDelete(id, companyId, userId);
  }

  // ═══════════════════════════════════════════════════════════
  // EVALUATE ALL ACTIVE RULES
  // Runs all active rules and generates notifications
  // ═══════════════════════════════════════════════════════════

  async evaluateAllRules(companyId: string, userId: string): Promise<{
    rules_evaluated: number;
    rules_triggered: number;
    total_notifications: number;
    results: AlertEvalResult[];
  }> {
    const rules = await this.db('alert_rules')
      .where({ company_id: companyId, is_active: true, is_deleted: false });

    const results: AlertEvalResult[] = [];
    let totalNotifications = 0;

    for (const rule of rules) {
      const result = await this._evaluateRule(companyId, rule, userId);
      results.push(result);
      totalNotifications += result.notifications_created;
    }

    return {
      rules_evaluated: rules.length,
      rules_triggered: results.filter(r => r.triggered).length,
      total_notifications: totalNotifications,
      results,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Private: Evaluate a single rule
  // ─────────────────────────────────────────────────────────

  private async _evaluateRule(companyId: string, rule: any, userId: string): Promise<AlertEvalResult> {
    const condition = typeof rule.condition_json === 'string'
      ? JSON.parse(rule.condition_json) : rule.condition_json;

    let matches: any[] = [];

    switch (rule.alert_type) {
      case 'low_stock':
        matches = await this._checkLowStock(companyId, condition, rule.entity_id);
        break;
      case 'overstock':
        matches = await this._checkOverstock(companyId, condition, rule.entity_id);
        break;
      case 'payment_due':
        matches = await this._checkPaymentDue(companyId, condition);
        break;
      case 'approval_pending':
        matches = await this._checkApprovalPending(companyId, condition);
        break;
      case 'consumption_anomaly':
        matches = await this._checkConsumptionAnomaly(companyId, condition);
        break;
    }

    let notificationsCreated = 0;

    if (matches.length > 0) {
      notificationsCreated = await this._generateNotifications(
        companyId, rule, matches, userId
      );
    }

    return {
      rule_id: rule.id,
      rule_name: rule.name,
      alert_type: rule.alert_type,
      triggered: matches.length > 0,
      matches,
      notifications_created: notificationsCreated,
    };
  }

  // ─── Low Stock Check ───

  private async _checkLowStock(companyId: string, condition: any, entityId?: string) {
    // condition: { threshold_percentage?: number } — e.g. 100 means at min_threshold
    let query = this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .where('ss.company_id', companyId)
      .whereNotNull('i.min_stock_threshold')
      .where('i.min_stock_threshold', '>', 0)
      .where('i.is_deleted', false)
      .whereRaw('ss.available_quantity < i.min_stock_threshold');

    if (entityId) query = query.where('ss.item_id', entityId);

    return query.select(
      'ss.item_id', 'i.item_code', 'i.name as item_name',
      'w.name as warehouse_name', 'ss.available_quantity',
      'i.min_stock_threshold'
    ).limit(100);
  }

  // ─── Overstock Check ───

  private async _checkOverstock(companyId: string, condition: any, entityId?: string) {
    let query = this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .where('ss.company_id', companyId)
      .whereNotNull('i.max_stock_level')
      .where('i.max_stock_level', '>', 0)
      .where('i.is_deleted', false)
      .whereRaw('ss.available_quantity > i.max_stock_level');

    if (entityId) query = query.where('ss.item_id', entityId);

    return query.select(
      'ss.item_id', 'i.item_code', 'i.name as item_name',
      'w.name as warehouse_name', 'ss.available_quantity',
      'i.max_stock_level'
    ).limit(100);
  }

  // ─── Payment Due Check ───

  private async _checkPaymentDue(companyId: string, condition: any) {
    // condition: { days_overdue?: number, type?: 'customer' | 'vendor' | 'both' }
    const daysOverdue = condition.days_overdue || 0;
    const cutoffDate = new Date(Date.now() - daysOverdue * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    const type = condition.type || 'both';

    const results: any[] = [];

    if (type === 'customer' || type === 'both') {
      const invoices = await this.db('sales_invoices as si')
        .join('customers as c', 'si.customer_id', 'c.id')
        .where('si.company_id', companyId)
        .where('si.is_deleted', false)
        .whereIn('si.status', ['sent', 'overdue'])
        .where('si.invoice_date', '<=', cutoffDate)
        .select(
          'si.id as reference_id',
          'si.invoice_number', 'c.name as party_name',
          'si.grand_total as amount', 'si.invoice_date',
          this.db.raw("'customer' as party_type")
        ).limit(50);
      results.push(...invoices);
    }

    if (type === 'vendor' || type === 'both') {
      const bills = await this.db('vendor_bills as vb')
        .join('vendors as v', 'vb.vendor_id', 'v.id')
        .where('vb.company_id', companyId)
        .where('vb.is_deleted', false)
        .whereIn('vb.status', ['received', 'overdue'])
        .where('vb.bill_date', '<=', cutoffDate)
        .select(
          'vb.id as reference_id',
          'vb.bill_number as invoice_number', 'v.name as party_name',
          'vb.grand_total as amount', 'vb.bill_date as invoice_date',
          this.db.raw("'vendor' as party_type")
        ).limit(50);
      results.push(...bills);
    }

    return results;
  }

  // ─── Approval Pending Check ───

  private async _checkApprovalPending(companyId: string, condition: any) {
    // condition: { older_than_hours?: number }
    const olderThanHours = condition.older_than_hours || 24;
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

    return this.db('approval_queue')
      .where({
        company_id: companyId,
        action: 'pending',
        is_deleted: false,
      })
      .where('requested_at', '<', cutoff)
      .select('id', 'document_type', 'document_number', 'amount', 'requested_at', 'approval_level')
      .limit(50);
  }

  // ─── Consumption Anomaly Check ───

  private async _checkConsumptionAnomaly(companyId: string, condition: any) {
    // condition: { threshold_ratio?: number } default 1.5
    const threshold = condition.threshold_ratio || 1.5;
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await this.db.raw(`
      WITH c30 AS (
        SELECT item_id, warehouse_id, SUM(quantity_out) / 30.0 as avg30
        FROM stock_ledger
        WHERE company_id = ? AND transaction_date >= ? AND transaction_date <= ? AND quantity_out > 0
        GROUP BY item_id, warehouse_id HAVING SUM(quantity_out) > 0
      ),
      c7 AS (
        SELECT item_id, warehouse_id, SUM(quantity_out) / 7.0 as avg7
        FROM stock_ledger
        WHERE company_id = ? AND transaction_date >= ? AND transaction_date <= ? AND quantity_out > 0
        GROUP BY item_id, warehouse_id
      )
      SELECT c30.item_id, i.item_code, i.name as item_name,
        ROUND(c30.avg30, 4) as avg_daily_30d,
        ROUND(COALESCE(c7.avg7, 0), 4) as avg_daily_7d,
        CASE WHEN c30.avg30 > 0 THEN ROUND(COALESCE(c7.avg7, 0) / c30.avg30, 2) ELSE 0 END as ratio
      FROM c30
      LEFT JOIN c7 ON c30.item_id = c7.item_id AND c30.warehouse_id = c7.warehouse_id
      JOIN items i ON c30.item_id = i.id
      WHERE c30.avg30 > 0
        AND (COALESCE(c7.avg7, 0) / c30.avg30 >= ? OR (COALESCE(c7.avg7, 0) / c30.avg30 > 0 AND COALESCE(c7.avg7, 0) / c30.avg30 <= ?))
      LIMIT 50
    `, [companyId, thirtyDaysAgo, today, companyId, sevenDaysAgo, today, threshold, 1 / threshold]);

    return result.rows || [];
  }

  // ─── Generate Notifications ───

  private async _generateNotifications(
    companyId: string, rule: any, matches: any[], systemUserId: string
  ): Promise<number> {
    // Determine recipients: explicit user_ids + users with matching role_ids
    const recipientIds = new Set<string>();

    if (rule.notify_user_ids?.length > 0) {
      for (const uid of rule.notify_user_ids) recipientIds.add(uid);
    }

    if (rule.notify_role_ids?.length > 0) {
      const users = await this.db('users')
        .where({ company_id: companyId, is_deleted: false, is_active: true })
        .whereIn('role_id', rule.notify_role_ids)
        .select('id');
      for (const u of users) recipientIds.add(u.id);
    }

    // If no recipients configured, notify all admins
    if (recipientIds.size === 0) {
      const admins = await this.db('users as u')
        .join('roles as r', 'u.role_id', 'r.id')
        .where({ 'u.company_id': companyId, 'u.is_deleted': false, 'u.is_active': true })
        .whereILike('r.name', '%admin%')
        .select('u.id');
      for (const a of admins) recipientIds.add(a.id);
    }

    if (recipientIds.size === 0) return 0;

    // Build notification message
    const title = `${rule.name} — ${matches.length} item(s)`;
    const message = this._buildNotificationMessage(rule.alert_type, matches);

    const priority = matches.length > 10 ? 'high'
      : rule.alert_type === 'low_stock' ? 'high'
        : 'normal';

    const notifications = Array.from(recipientIds).map(uid => ({
      company_id: companyId,
      user_id: uid,
      title,
      message,
      notification_type: 'alert' as const,
      priority,
      reference_type: rule.alert_type,
      reference_id: rule.id,
      created_by: systemUserId,
      updated_by: systemUserId,
    }));

    await this.db('notifications').insert(notifications);
    return notifications.length;
  }

  private _buildNotificationMessage(alertType: string, matches: any[]): string {
    const count = matches.length;
    switch (alertType) {
      case 'low_stock': {
        const top3 = matches.slice(0, 3).map((m: any) => `${m.item_name} (${m.available_quantity}/${m.min_stock_threshold})`);
        return `${count} item(s) below minimum stock: ${top3.join(', ')}${count > 3 ? '...' : ''}`;
      }
      case 'overstock': {
        const top3 = matches.slice(0, 3).map((m: any) => `${m.item_name} (${m.available_quantity}/${m.max_stock_level})`);
        return `${count} item(s) above maximum stock: ${top3.join(', ')}${count > 3 ? '...' : ''}`;
      }
      case 'payment_due': {
        const total = matches.reduce((s: number, m: any) => s + parseFloat(m.amount || 0), 0);
        return `${count} overdue payment(s) totalling ₹${total.toFixed(2)}`;
      }
      case 'approval_pending':
        return `${count} approval(s) pending for over the configured threshold`;
      case 'consumption_anomaly':
        return `${count} item(s) with unusual consumption patterns detected`;
      default:
        return `${count} match(es) found for alert rule`;
    }
  }
}

export const alertRulesService = new AlertRulesService();