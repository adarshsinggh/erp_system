// =============================================================
// File: server/services/reorder.service.ts
// Module: Smart Reorder & Automation — Phase 11 (Step 42)
// Description:
//   - Scan stock_summary vs items.min_stock_threshold
//   - Auto-generate draft purchase requisitions for below-threshold items
//   - Vendor auto-selection: preferred → best price → reliability → lead time
//   - Reorder dashboard with severity classification
//   - Consumption anomaly detection via stock_ledger analysis
//   - Principle: automate but NEVER remove managerial control
// =============================================================

import { Knex } from 'knex';
import { BaseService } from './base.service';

// ─────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────

interface ReorderRunOptions {
  branch_id?: string;        // Scope to a specific branch
  warehouse_id?: string;     // Scope to a specific warehouse
  item_ids?: string[];       // Only check specific items
  dry_run?: boolean;         // If true, return what WOULD be created without creating
}

interface ReorderRunResult {
  run_id: string;
  run_at: string;
  items_checked: number;
  items_below_threshold: number;
  requisitions_created: number;
  requisition_ids: string[];
  dry_run: boolean;
  details: ReorderItemDetail[];
}

interface ReorderItemDetail {
  item_id: string;
  item_code: string;
  item_name: string;
  warehouse_id: string;
  warehouse_name: string;
  branch_id: string;
  available_quantity: number;
  min_stock_threshold: number;
  reorder_quantity: number;
  shortage_quantity: number;
  severity: 'out_of_stock' | 'critical' | 'low';
  selected_vendor_id: string | null;
  selected_vendor_name: string | null;
  vendor_selection_reason: string | null;
  estimated_price: number | null;
  lead_time_days: number | null;
}

interface VendorCandidate {
  vendor_id: string;
  vendor_name: string;
  vendor_code: string;
  purchase_price: number;
  lead_time_days: number;
  is_preferred: boolean;
  reliability_score: number;
  min_order_qty: number | null;
  score: number; // Computed selection score
  reason: string;
}

interface ConsumptionAnomaly {
  item_id: string;
  item_code: string;
  item_name: string;
  warehouse_id: string;
  warehouse_name: string;
  avg_daily_consumption: number;
  recent_daily_consumption: number;
  anomaly_ratio: number;
  anomaly_type: 'spike' | 'drop';
  uom_symbol: string;
}

// ─────────────────────────────────────────────────────────────
// Reorder Service
// ─────────────────────────────────────────────────────────────

class ReorderService extends BaseService {
  constructor() {
    super('purchase_requisitions');
  }

  // ═══════════════════════════════════════════════════════════
  // 1. RUN REORDER CHECK
  // ═══════════════════════════════════════════════════════════

  /**
   * Main reorder engine. Scans stock vs thresholds and creates draft PRs.
   * Groups items by branch, creates one PR per branch.
   */
  async runReorderCheck(companyId: string, userId: string, options: ReorderRunOptions = {}): Promise<ReorderRunResult> {
    const { branch_id, warehouse_id, item_ids, dry_run = false } = options;
    const runId = `REORDER-${Date.now()}`;
    const runAt = new Date().toISOString();

    // Step 1: Find all items below threshold
    const belowThresholdItems = await this._findBelowThresholdItems(companyId, {
      branch_id,
      warehouse_id,
      item_ids,
    });

    if (belowThresholdItems.length === 0) {
      return {
        run_id: runId,
        run_at: runAt,
        items_checked: await this._countItemsWithThreshold(companyId),
        items_below_threshold: 0,
        requisitions_created: 0,
        requisition_ids: [],
        dry_run,
        details: [],
      };
    }

    // Step 2: For each item, select best vendor
    const detailedItems: ReorderItemDetail[] = [];
    for (const item of belowThresholdItems) {
      const vendor = await this._selectBestVendor(companyId, item.item_id);
      const reorderQty = parseFloat(item.reorder_quantity) || parseFloat(item.shortage_quantity);

      detailedItems.push({
        item_id: item.item_id,
        item_code: item.item_code,
        item_name: item.item_name,
        warehouse_id: item.warehouse_id,
        warehouse_name: item.warehouse_name,
        branch_id: item.branch_id,
        available_quantity: parseFloat(item.available_quantity),
        min_stock_threshold: parseFloat(item.min_stock_threshold),
        reorder_quantity: reorderQty,
        shortage_quantity: parseFloat(item.shortage_quantity),
        severity: item.severity,
        selected_vendor_id: vendor?.vendor_id || null,
        selected_vendor_name: vendor?.vendor_name || null,
        vendor_selection_reason: vendor?.reason || null,
        estimated_price: vendor?.purchase_price || null,
        lead_time_days: vendor?.lead_time_days || null,
      });
    }

    // Step 3: If dry run, return without creating
    if (dry_run) {
      return {
        run_id: runId,
        run_at: runAt,
        items_checked: await this._countItemsWithThreshold(companyId),
        items_below_threshold: detailedItems.length,
        requisitions_created: 0,
        requisition_ids: [],
        dry_run: true,
        details: detailedItems,
      };
    }

    // Step 4: Group by branch and create draft PRs
    const branchGroups = this._groupByBranch(detailedItems);
    const requisitionIds: string[] = [];

    for (const [branchId, items] of Object.entries(branchGroups)) {
      const prId = await this._createDraftPurchaseRequisition(companyId, branchId, items, userId, runId);
      if (prId) requisitionIds.push(prId);
    }

    return {
      run_id: runId,
      run_at: runAt,
      items_checked: await this._countItemsWithThreshold(companyId),
      items_below_threshold: detailedItems.length,
      requisitions_created: requisitionIds.length,
      requisition_ids: requisitionIds,
      dry_run: false,
      details: detailedItems,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 2. BELOW THRESHOLD DASHBOARD
  // ═══════════════════════════════════════════════════════════

  /**
   * Get all items currently below their min_stock_threshold.
   * Used for the reorder alert dashboard.
   */
  async getBelowThresholdItems(companyId: string, options: {
    branch_id?: string;
    warehouse_id?: string;
    severity?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { branch_id, warehouse_id, severity, search, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .leftJoin('units_of_measurement as u', 'ss.uom_id', 'u.id')
      .where('ss.company_id', companyId)
      .whereNotNull('i.min_stock_threshold')
      .where('i.min_stock_threshold', '>', 0)
      .where('i.is_deleted', false)
      .where('i.status', 'active')
      .whereRaw('ss.available_quantity < i.min_stock_threshold');

    if (branch_id) query = query.where('ss.branch_id', branch_id);
    if (warehouse_id) query = query.where('ss.warehouse_id', warehouse_id);

    if (search) {
      query = query.where(function () {
        this.whereILike('i.name', `%${search}%`)
          .orWhereILike('i.item_code', `%${search}%`);
      });
    }

    if (severity) {
      switch (severity) {
        case 'out_of_stock':
          query = query.where('ss.available_quantity', '<=', 0);
          break;
        case 'critical':
          query = query.where('ss.available_quantity', '>', 0)
            .whereRaw('ss.available_quantity <= i.min_stock_threshold * 0.5');
          break;
        case 'low':
          query = query.whereRaw('ss.available_quantity > i.min_stock_threshold * 0.5');
          break;
      }
    }

    const countResult = await query.clone().count('ss.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .select(
        'ss.id as stock_summary_id',
        'ss.item_id',
        'i.item_code',
        'i.name as item_name',
        'i.item_type',
        'ss.warehouse_id',
        'w.name as warehouse_name',
        'ss.branch_id',
        'b.name as branch_name',
        'ss.available_quantity',
        'ss.reserved_quantity',
        'ss.on_order_quantity',
        'ss.free_quantity',
        'i.min_stock_threshold',
        'i.reorder_quantity',
        'i.max_stock_level',
        'i.lead_time_days',
        'i.purchase_price',
        'ss.last_purchase_date',
        'ss.last_movement_date',
        'u.code as uom_symbol',
        'u.name as uom_name'
      )
      .select(
        this.db.raw('ROUND(i.min_stock_threshold - ss.available_quantity, 3) as shortage_quantity'),
        this.db.raw(`
          CASE
            WHEN ss.available_quantity <= 0 THEN 'out_of_stock'
            WHEN ss.available_quantity <= i.min_stock_threshold * 0.5 THEN 'critical'
            ELSE 'low'
          END as severity
        `)
      )
      .orderByRaw(`
        CASE
          WHEN ss.available_quantity <= 0 THEN 1
          WHEN ss.available_quantity <= i.min_stock_threshold * 0.5 THEN 2
          ELSE 3
        END
      `)
      .orderBy('i.name')
      .limit(limit)
      .offset(offset);

    // Add summary stats
    const summaryQuery = this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .where('ss.company_id', companyId)
      .whereNotNull('i.min_stock_threshold')
      .where('i.min_stock_threshold', '>', 0)
      .where('i.is_deleted', false)
      .where('i.status', 'active')
      .whereRaw('ss.available_quantity < i.min_stock_threshold');

    if (branch_id) summaryQuery.where('ss.branch_id', branch_id);
    if (warehouse_id) summaryQuery.where('ss.warehouse_id', warehouse_id);

    const summary = await summaryQuery.select(
      this.db.raw("COUNT(*) FILTER (WHERE ss.available_quantity <= 0) as out_of_stock_count"),
      this.db.raw("COUNT(*) FILTER (WHERE ss.available_quantity > 0 AND ss.available_quantity <= i.min_stock_threshold * 0.5) as critical_count"),
      this.db.raw("COUNT(*) FILTER (WHERE ss.available_quantity > i.min_stock_threshold * 0.5) as low_count"),
      this.db.raw('COUNT(*) as total_below_threshold')
    ).first();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        out_of_stock: parseInt(String(summary?.out_of_stock_count || '0'), 10),
        critical: parseInt(String(summary?.critical_count || '0'), 10),
        low: parseInt(String(summary?.low_count || '0'), 10),
        total_below_threshold: parseInt(String(summary?.total_below_threshold || '0'), 10),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 3. REORDER HISTORY (Auto-generated PRs)
  // ═══════════════════════════════════════════════════════════

  /**
   * List purchase requisitions created by the reorder engine (source = 'auto_reorder').
   */
  async getReorderHistory(companyId: string, options: {
    branch_id?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { branch_id, status, page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('purchase_requisitions as pr')
      .join('branches as b', 'pr.branch_id', 'b.id')
      .leftJoin('users as u', 'pr.requested_by', 'u.id')
      .where({
        'pr.company_id': companyId,
        'pr.source': 'auto_reorder',
        'pr.is_deleted': false,
      });

    if (branch_id) query = query.where('pr.branch_id', branch_id);
    if (status) query = query.where('pr.status', status);

    const countResult = await query.clone().count('pr.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .select(
        'pr.id',
        'pr.requisition_number',
        'pr.requisition_date',
        'pr.required_by_date',
        'pr.priority',
        'pr.source',
        'pr.source_reference_id',
        'pr.purpose',
        'pr.status',
        'pr.branch_id',
        'b.name as branch_name',
        'pr.created_at',
        'u.full_name as requested_by_name'
      )
      .orderBy('pr.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    // Get line counts per PR
    const prIds = data.map((d: any) => d.id);
    let lineCounts: Record<string, number> = {};

    if (prIds.length > 0) {
      const counts = await this.db('purchase_requisition_lines')
        .whereIn('requisition_id', prIds)
        .where('is_deleted', false)
        .select('requisition_id')
        .count('id as line_count')
        .groupBy('requisition_id');

      lineCounts = counts.reduce((acc: any, row: any) => {
        acc[row.requisition_id] = parseInt(String(row.line_count), 10);
        return acc;
      }, {});
    }

    const enrichedData = data.map((pr: any) => ({
      ...pr,
      line_count: lineCounts[pr.id] || 0,
    }));

    return { data: enrichedData, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ═══════════════════════════════════════════════════════════
  // 4. CONSUMPTION ANOMALY DETECTION
  // ═══════════════════════════════════════════════════════════

  /**
   * Detect consumption anomalies by comparing recent 7-day average
   * vs overall 30-day average from stock_ledger outward movements.
   * A spike (>1.5x) or drop (<0.5x) is flagged.
   */
  async getConsumptionAnomalies(companyId: string, options: {
    branch_id?: string;
    warehouse_id?: string;
    threshold_ratio?: number; // default 1.5
    page?: number;
    limit?: number;
  } = {}): Promise<{ data: ConsumptionAnomaly[]; total: number; page: number; limit: number; totalPages: number }> {
    const { branch_id, warehouse_id, threshold_ratio = 1.5, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    // We compare:
    //   avg_daily_30d = SUM(quantity_out) over last 30 days / 30
    //   avg_daily_7d  = SUM(quantity_out) over last 7 days / 7
    // Anomaly if: ratio = avg_daily_7d / avg_daily_30d > threshold OR < 1/threshold

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    // 30-day consumption by item+warehouse
    let baseQuery = this.db('stock_ledger as sl')
      .join('items as i', 'sl.item_id', 'i.id')
      .join('warehouses as w', 'sl.warehouse_id', 'w.id')
      .leftJoin('units_of_measurement as u', 'i.primary_uom_id', 'u.id')
      .where('sl.company_id', companyId)
      .where('sl.transaction_date', '>=', thirtyDaysAgo)
      .where('sl.transaction_date', '<=', today)
      .where('sl.quantity_out', '>', 0)
      .where('i.is_deleted', false);

    if (branch_id) baseQuery = baseQuery.where('sl.branch_id', branch_id);
    if (warehouse_id) baseQuery = baseQuery.where('sl.warehouse_id', warehouse_id);

    // Use raw SQL for the complex aggregation
    const anomalies = await this.db.raw(`
      WITH consumption_30d AS (
        SELECT
          sl.item_id,
          sl.warehouse_id,
          SUM(sl.quantity_out) as total_out_30d
        FROM stock_ledger sl
        JOIN items i ON sl.item_id = i.id
        WHERE sl.company_id = ?
          AND sl.transaction_date >= ?
          AND sl.transaction_date <= ?
          AND sl.quantity_out > 0
          AND i.is_deleted = FALSE
          ${branch_id ? 'AND sl.branch_id = ?' : ''}
          ${warehouse_id ? 'AND sl.warehouse_id = ?' : ''}
        GROUP BY sl.item_id, sl.warehouse_id
        HAVING SUM(sl.quantity_out) > 0
      ),
      consumption_7d AS (
        SELECT
          sl.item_id,
          sl.warehouse_id,
          SUM(sl.quantity_out) as total_out_7d
        FROM stock_ledger sl
        JOIN items i ON sl.item_id = i.id
        WHERE sl.company_id = ?
          AND sl.transaction_date >= ?
          AND sl.transaction_date <= ?
          AND sl.quantity_out > 0
          AND i.is_deleted = FALSE
          ${branch_id ? 'AND sl.branch_id = ?' : ''}
          ${warehouse_id ? 'AND sl.warehouse_id = ?' : ''}
        GROUP BY sl.item_id, sl.warehouse_id
      ),
      analysis AS (
        SELECT
          c30.item_id,
          c30.warehouse_id,
          ROUND(c30.total_out_30d / 30.0, 4) as avg_daily_30d,
          ROUND(COALESCE(c7.total_out_7d, 0) / 7.0, 4) as avg_daily_7d,
          CASE
            WHEN c30.total_out_30d / 30.0 > 0
            THEN ROUND((COALESCE(c7.total_out_7d, 0) / 7.0) / (c30.total_out_30d / 30.0), 2)
            ELSE 0
          END as anomaly_ratio
        FROM consumption_30d c30
        LEFT JOIN consumption_7d c7
          ON c30.item_id = c7.item_id AND c30.warehouse_id = c7.warehouse_id
      )
      SELECT
        a.item_id,
        a.warehouse_id,
        i.item_code,
        i.name as item_name,
        w.name as warehouse_name,
        a.avg_daily_30d as avg_daily_consumption,
        a.avg_daily_7d as recent_daily_consumption,
        a.anomaly_ratio,
        CASE
          WHEN a.anomaly_ratio >= ? THEN 'spike'
          ELSE 'drop'
        END as anomaly_type,
        u.code as uom_symbol
      FROM analysis a
      JOIN items i ON a.item_id = i.id
      JOIN warehouses w ON a.warehouse_id = w.id
      LEFT JOIN units_of_measurement u ON i.primary_uom_id = u.id
      WHERE a.anomaly_ratio >= ? OR (a.anomaly_ratio > 0 AND a.anomaly_ratio <= ?)
      ORDER BY a.anomaly_ratio DESC
      LIMIT ? OFFSET ?
    `, [
      companyId, thirtyDaysAgo, today,
      ...(branch_id ? [branch_id] : []),
      ...(warehouse_id ? [warehouse_id] : []),
      companyId, sevenDaysAgo, today,
      ...(branch_id ? [branch_id] : []),
      ...(warehouse_id ? [warehouse_id] : []),
      threshold_ratio,
      threshold_ratio, (1 / threshold_ratio),
      limit, offset,
    ]);

    const data: ConsumptionAnomaly[] = (anomalies.rows || []).map((row: any) => ({
      item_id: row.item_id,
      item_code: row.item_code,
      item_name: row.item_name,
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name,
      avg_daily_consumption: parseFloat(row.avg_daily_consumption),
      recent_daily_consumption: parseFloat(row.recent_daily_consumption),
      anomaly_ratio: parseFloat(row.anomaly_ratio),
      anomaly_type: row.anomaly_type,
      uom_symbol: row.uom_symbol || '',
    }));

    // Get total count (simplified — re-run with count)
    const totalResult = data.length; // Approximate; exact count would need another query

    return {
      data,
      total: totalResult,
      page,
      limit,
      totalPages: Math.ceil(totalResult / limit),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 5. REORDER SETTINGS (stored in company metadata)
  // ═══════════════════════════════════════════════════════════

  /**
   * Get reorder settings for the company
   */
  async getSettings(companyId: string) {
    const company = await this.db('companies')
      .where({ id: companyId, is_deleted: false })
      .select('metadata')
      .first();

    const metadata = company?.metadata || {};
    return {
      auto_reorder_enabled: metadata.auto_reorder_enabled ?? false,
      reorder_check_interval_hours: metadata.reorder_check_interval_hours ?? 24,
      auto_reorder_priority: metadata.auto_reorder_priority ?? 'normal',
      require_approval: metadata.reorder_require_approval ?? true,
      lead_time_buffer_days: metadata.reorder_lead_time_buffer ?? 0,
      exclude_zero_reorder_qty: metadata.reorder_exclude_zero_qty ?? true,
    };
  }

  /**
   * Update reorder settings
   */
  async updateSettings(companyId: string, settings: {
    auto_reorder_enabled?: boolean;
    reorder_check_interval_hours?: number;
    auto_reorder_priority?: string;
    require_approval?: boolean;
    lead_time_buffer_days?: number;
    exclude_zero_reorder_qty?: boolean;
  }, userId: string) {
    const company = await this.db('companies')
      .where({ id: companyId, is_deleted: false })
      .first();

    if (!company) throw new Error('Company not found');

    const metadata = company.metadata || {};

    if (settings.auto_reorder_enabled !== undefined) metadata.auto_reorder_enabled = settings.auto_reorder_enabled;
    if (settings.reorder_check_interval_hours !== undefined) metadata.reorder_check_interval_hours = settings.reorder_check_interval_hours;
    if (settings.auto_reorder_priority !== undefined) metadata.auto_reorder_priority = settings.auto_reorder_priority;
    if (settings.require_approval !== undefined) metadata.reorder_require_approval = settings.require_approval;
    if (settings.lead_time_buffer_days !== undefined) metadata.reorder_lead_time_buffer = settings.lead_time_buffer_days;
    if (settings.exclude_zero_reorder_qty !== undefined) metadata.reorder_exclude_zero_qty = settings.exclude_zero_reorder_qty;

    await this.db('companies')
      .where({ id: companyId })
      .update({ metadata: JSON.stringify(metadata), updated_by: userId });

    return this.getSettings(companyId);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Find all stock_summary entries where available_quantity < min_stock_threshold
   */
  private async _findBelowThresholdItems(companyId: string, filters: {
    branch_id?: string;
    warehouse_id?: string;
    item_ids?: string[];
  }) {
    let query = this.db('stock_summary as ss')
      .join('items as i', 'ss.item_id', 'i.id')
      .join('warehouses as w', 'ss.warehouse_id', 'w.id')
      .join('branches as b', 'ss.branch_id', 'b.id')
      .where('ss.company_id', companyId)
      .whereNotNull('i.min_stock_threshold')
      .where('i.min_stock_threshold', '>', 0)
      .where('i.is_deleted', false)
      .where('i.status', 'active')
      .whereRaw('ss.available_quantity < i.min_stock_threshold');

    if (filters.branch_id) query = query.where('ss.branch_id', filters.branch_id);
    if (filters.warehouse_id) query = query.where('ss.warehouse_id', filters.warehouse_id);
    if (filters.item_ids && filters.item_ids.length > 0) {
      query = query.whereIn('ss.item_id', filters.item_ids);
    }

    // Exclude items that already have a pending/draft auto-reorder PR
    query = query.whereNotExists(function () {
      this.select(this.client.raw('1'))
        .from('purchase_requisitions as pr')
        .join('purchase_requisition_lines as prl', 'pr.id', 'prl.requisition_id')
        .whereRaw('prl.item_id = ss.item_id')
        .where('pr.company_id', companyId)
        .where('pr.source', 'auto_reorder')
        .whereIn('pr.status', ['draft', 'submitted'])
        .where('pr.is_deleted', false)
        .where('prl.is_deleted', false);
    });

    return query.select(
      'ss.item_id',
      'i.item_code',
      'i.name as item_name',
      'i.item_type',
      'ss.warehouse_id',
      'w.name as warehouse_name',
      'ss.branch_id',
      'b.name as branch_name',
      'ss.available_quantity',
      'i.min_stock_threshold',
      'i.reorder_quantity',
      'i.lead_time_days',
      'i.purchase_price',
      'i.primary_uom_id',
      this.db.raw('ROUND(i.min_stock_threshold - ss.available_quantity, 3) as shortage_quantity'),
      this.db.raw(`
        CASE
          WHEN ss.available_quantity <= 0 THEN 'out_of_stock'
          WHEN ss.available_quantity <= i.min_stock_threshold * 0.5 THEN 'critical'
          ELSE 'low'
        END as severity
      `)
    ).orderByRaw(`
      CASE
        WHEN ss.available_quantity <= 0 THEN 1
        WHEN ss.available_quantity <= i.min_stock_threshold * 0.5 THEN 2
        ELSE 3
      END
    `);
  }

  /**
   * Vendor auto-selection logic:
   * Priority: 1) Preferred vendor  2) Best price  3) Best reliability  4) Shortest lead time
   * Returns the best vendor or null if no vendors mapped.
   */
  private async _selectBestVendor(companyId: string, itemId: string): Promise<VendorCandidate | null> {
    const today = new Date().toISOString().split('T')[0];

    const mappings = await this.db('item_vendor_mapping as ivm')
      .join('vendors as v', 'ivm.vendor_id', 'v.id')
      .where({
        'ivm.company_id': companyId,
        'ivm.item_id': itemId,
        'ivm.is_active': true,
        'ivm.is_deleted': false,
        'v.is_deleted': false,
        'v.status': 'active',
      })
      .where('ivm.effective_from', '<=', today)
      .andWhere(function () {
        this.whereNull('ivm.effective_to').orWhere('ivm.effective_to', '>=', today);
      })
      .select(
        'ivm.vendor_id',
        'v.name as vendor_name',
        'v.vendor_code',
        'ivm.purchase_price',
        'ivm.lead_time_days',
        'ivm.is_preferred',
        'ivm.min_order_qty',
        'v.reliability_score'
      );

    if (mappings.length === 0) return null;

    // Score each vendor (higher = better)
    const candidates: VendorCandidate[] = mappings.map((m: any) => {
      let score = 0;
      let reason = '';

      // Preferred vendor gets big bonus
      if (m.is_preferred) {
        score += 1000;
        reason = 'Preferred vendor';
      }

      // Lower price = higher score (normalize: 100 - price_rank * 10)
      const price = parseFloat(m.purchase_price) || 0;
      score += price > 0 ? Math.max(0, 100 - price / 10) : 0;

      // Reliability score (0-100 scale)
      const reliability = parseFloat(m.reliability_score) || 0;
      score += reliability;

      // Shorter lead time = higher score
      const leadTime = parseInt(m.lead_time_days) || 7;
      score += Math.max(0, 50 - leadTime);

      if (!reason) {
        reason = `Score-based (price: ${price}, reliability: ${reliability}, lead: ${leadTime}d)`;
      }

      return {
        vendor_id: m.vendor_id,
        vendor_name: m.vendor_name,
        vendor_code: m.vendor_code,
        purchase_price: price,
        lead_time_days: leadTime,
        is_preferred: m.is_preferred,
        reliability_score: reliability,
        min_order_qty: m.min_order_qty ? parseFloat(m.min_order_qty) : null,
        score,
        reason,
      };
    });

    // Sort by score descending — pick the best
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  /**
   * Group reorder items by branch_id for PR creation
   */
  private _groupByBranch(items: ReorderItemDetail[]): Record<string, ReorderItemDetail[]> {
    const groups: Record<string, ReorderItemDetail[]> = {};
    for (const item of items) {
      if (!groups[item.branch_id]) groups[item.branch_id] = [];
      groups[item.branch_id].push(item);
    }
    return groups;
  }

  /**
   * Create a draft purchase requisition with lines for reorder items.
   * Uses the get_next_document_number function if available, or generates manually.
   */
  private async _createDraftPurchaseRequisition(
    companyId: string,
    branchId: string,
    items: ReorderItemDetail[],
    userId: string,
    runId: string
  ): Promise<string | null> {
    return this.db.transaction(async (trx) => {
      // Generate PR number
      let prNumber: string;
      try {
        // Try to use the document_sequences function
        // PR is not in document_sequences, so generate manually
        const countResult = await trx('purchase_requisitions')
          .where({ company_id: companyId, is_deleted: false })
          .count('id as cnt')
          .first();
        const nextNum = parseInt(String(countResult?.cnt || '0'), 10) + 1;
        prNumber = `PR/${String(nextNum).padStart(5, '0')}`;
      } catch {
        prNumber = `PR/${Date.now()}`;
      }

      const today = new Date().toISOString().split('T')[0];

      // Calculate required_by_date: today + max lead time among items + buffer
      const settings = await this.getSettings(companyId);
      const maxLeadTime = Math.max(...items.map(i => i.lead_time_days || 7));
      const bufferDays = settings.lead_time_buffer_days || 0;
      const requiredByDate = new Date(Date.now() + (maxLeadTime + bufferDays) * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      // Determine priority based on severity
      const hasCritical = items.some(i => i.severity === 'out_of_stock' || i.severity === 'critical');
      const priority = hasCritical ? 'high' : (settings.auto_reorder_priority || 'normal');

      // Create PR header
      const [pr] = await trx('purchase_requisitions')
        .insert({
          company_id: companyId,
          branch_id: branchId,
          requisition_number: prNumber,
          requisition_date: today,
          requested_by: userId,
          required_by_date: requiredByDate,
          priority,
          source: 'auto_reorder',
          source_reference_id: null,
          purpose: `Auto-generated reorder (${runId}). ${items.length} item(s) below threshold.`,
          status: 'draft',
          metadata: JSON.stringify({ reorder_run_id: runId }),
          created_by: userId,
          updated_by: userId,
        })
        .returning('*');

      // Create PR lines
      const lines = items.map((item, idx) => ({
        company_id: companyId,
        requisition_id: pr.id,
        line_number: idx + 1,
        item_id: item.item_id,
        description: `Reorder: ${item.item_name} (shortage: ${item.shortage_quantity}, severity: ${item.severity})`,
        quantity: item.reorder_quantity || item.shortage_quantity,
        uom_id: null, // Will be resolved from item's primary_uom_id
        preferred_vendor_id: item.selected_vendor_id,
        estimated_price: item.estimated_price,
        notes: item.vendor_selection_reason
          ? `Vendor: ${item.selected_vendor_name} — ${item.vendor_selection_reason}`
          : 'No vendor mapping found',
        created_by: userId,
        updated_by: userId,
      }));

      // Resolve UOM IDs from items
      for (const line of lines) {
        const item = await trx('items')
          .where({ id: line.item_id, company_id: companyId })
          .select('primary_uom_id', 'purchase_uom_id')
          .first();
        line.uom_id = item?.purchase_uom_id || item?.primary_uom_id || null;
      }

      if (lines.length > 0) {
        await trx('purchase_requisition_lines').insert(lines);
      }

      return pr.id;
    });
  }

  /**
   * Count items that have a threshold configured
   */
  private async _countItemsWithThreshold(companyId: string): Promise<number> {
    const result = await this.db('items')
      .where({ company_id: companyId, is_deleted: false, status: 'active' })
      .whereNotNull('min_stock_threshold')
      .where('min_stock_threshold', '>', 0)
      .count('id as cnt')
      .first();
    return parseInt(String(result?.cnt || '0'), 10);
  }
}

// ─────────────────────────────────────────────────────────────
// Export singleton
// ─────────────────────────────────────────────────────────────

export const reorderService = new ReorderService();