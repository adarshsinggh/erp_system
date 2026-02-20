// =============================================================
// File: server/routes/reorder.ts
// Module: Smart Reorder & Automation — Phase 11 (Step 42)
// Description: Routes for the smart reorder engine.
//
//   POST /api/reorder/run              — Trigger reorder check
//   GET  /api/reorder/below-threshold  — Items below min stock
//   GET  /api/reorder/history          — Auto-generated PR history
//   GET  /api/reorder/consumption-analysis — Consumption anomalies
//   GET  /api/reorder/settings         — Get reorder settings
//   PUT  /api/reorder/settings         — Update reorder settings
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { reorderService } from '../services/reorder.service';

export async function reorderRoutes(server: FastifyInstance) {

  /**
   * POST /api/reorder/run
   * Trigger the reorder engine manually (or called by scheduler).
   * Scans stock vs thresholds, auto-generates draft PRs.
   *
   * Body: {
   *   branch_id?: string,     — scope to branch
   *   warehouse_id?: string,  — scope to warehouse
   *   item_ids?: string[],    — only check specific items
   *   dry_run?: boolean       — preview without creating PRs
   * }
   */
  server.post('/reorder/run', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { companyId, userId } = request.user!;
      const body = request.body as {
        branch_id?: string;
        warehouse_id?: string;
        item_ids?: string[];
        dry_run?: boolean;
      } || {};

      const result = await reorderService.runReorderCheck(companyId, userId, {
        branch_id: body.branch_id,
        warehouse_id: body.warehouse_id,
        item_ids: body.item_ids,
        dry_run: body.dry_run ?? false,
      });

      const statusCode = result.requisitions_created > 0 ? 201 : 200;
      return reply.code(statusCode).send({
        success: true,
        data: result,
        message: result.dry_run
          ? `Dry run: ${result.items_below_threshold} item(s) would trigger reorder`
          : result.requisitions_created > 0
            ? `${result.requisitions_created} draft purchase requisition(s) created for ${result.items_below_threshold} item(s)`
            : 'No items below threshold — no reorder needed',
      });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/reorder/below-threshold
   * Items currently below min_stock_threshold — reorder alert dashboard.
   *
   * Query: ?branch_id=&warehouse_id=&severity=&search=&page=&limit=
   * severity: 'out_of_stock' | 'critical' | 'low'
   */
  server.get('/reorder/below-threshold', { preHandler: [authenticate] }, async (request) => {
    const { companyId } = request.user!;
    const { branch_id, warehouse_id, severity, search, page, limit } = request.query as any;

    const result = await reorderService.getBelowThresholdItems(companyId, {
      branch_id,
      warehouse_id,
      severity,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    return { success: true, ...result };
  });

  /**
   * GET /api/reorder/history
   * List auto-generated purchase requisitions (source = 'auto_reorder').
   *
   * Query: ?branch_id=&status=&page=&limit=
   */
  server.get('/reorder/history', { preHandler: [authenticate] }, async (request) => {
    const { companyId } = request.user!;
    const { branch_id, status, page, limit } = request.query as any;

    const result = await reorderService.getReorderHistory(companyId, {
      branch_id,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    return { success: true, ...result };
  });

  /**
   * GET /api/reorder/consumption-analysis
   * Detect consumption anomalies — spikes or drops vs historical average.
   *
   * Query: ?branch_id=&warehouse_id=&threshold_ratio=&page=&limit=
   * threshold_ratio default 1.5 (flag if recent consumption is >1.5x or <0.67x of avg)
   */
  server.get('/reorder/consumption-analysis', { preHandler: [authenticate] }, async (request) => {
    const { companyId } = request.user!;
    const { branch_id, warehouse_id, threshold_ratio, page, limit } = request.query as any;

    const result = await reorderService.getConsumptionAnomalies(companyId, {
      branch_id,
      warehouse_id,
      threshold_ratio: threshold_ratio ? parseFloat(threshold_ratio) : 1.5,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    return { success: true, ...result };
  });

  /**
   * GET /api/reorder/settings
   * Get current reorder configuration for the company.
   */
  server.get('/reorder/settings', { preHandler: [authenticate] }, async (request) => {
    const settings = await reorderService.getSettings(request.user!.companyId);
    return { success: true, data: settings };
  });

  /**
   * PUT /api/reorder/settings
   * Update reorder configuration.
   *
   * Body: {
   *   auto_reorder_enabled?: boolean,
   *   reorder_check_interval_hours?: number,
   *   auto_reorder_priority?: string,
   *   require_approval?: boolean,
   *   lead_time_buffer_days?: number,
   *   exclude_zero_reorder_qty?: boolean
   * }
   */
  server.put('/reorder/settings', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { companyId, userId } = request.user!;
      const body = request.body as {
        auto_reorder_enabled?: boolean;
        reorder_check_interval_hours?: number;
        auto_reorder_priority?: string;
        require_approval?: boolean;
        lead_time_buffer_days?: number;
        exclude_zero_reorder_qty?: boolean;
      };

      // Validate priority if provided
      if (body.auto_reorder_priority && !['low', 'normal', 'high', 'urgent'].includes(body.auto_reorder_priority)) {
        return reply.code(400).send({ success: false, error: 'Priority must be: low, normal, high, or urgent' });
      }

      // Validate interval
      if (body.reorder_check_interval_hours !== undefined && (body.reorder_check_interval_hours < 1 || body.reorder_check_interval_hours > 168)) {
        return reply.code(400).send({ success: false, error: 'Check interval must be between 1 and 168 hours' });
      }

      const settings = await reorderService.updateSettings(companyId, body, userId);
      return { success: true, data: settings, message: 'Reorder settings updated' };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
}