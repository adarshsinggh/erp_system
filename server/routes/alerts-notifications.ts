// =============================================================
// File: server/routes/alerts-notifications.ts
// Module: Alerts, Notifications & Insights — Phase 12
// Description: All routes for Steps 43, 44, 45
//
// ALERT RULES (Step 43):
//   POST   /api/alert-rules            — Create rule
//   GET    /api/alert-rules            — List rules
//   GET    /api/alert-rules/:id        — Get single rule
//   PUT    /api/alert-rules/:id        — Update rule
//   DELETE /api/alert-rules/:id        — Delete rule
//   POST   /api/alert-rules/evaluate   — Evaluate all active rules
//
// NOTIFICATIONS (Step 44):
//   GET    /api/notifications          — List my notifications
//   GET    /api/notifications/unread-count — Unread count
//   PUT    /api/notifications/:id/read — Mark as read
//   PUT    /api/notifications/read-all — Mark all as read
//   PUT    /api/notifications/:id/dismiss — Dismiss
//   PUT    /api/notifications/dismiss-all — Dismiss all
//
// BUSINESS INSIGHTS (Step 45):
//   GET    /api/insights/dashboard      — Summary dashboard
//   GET    /api/insights/item-movement  — Fast/slow/dead movers
//   GET    /api/insights/stockout-predictions — Days until stockout
//   GET    /api/insights/margin-analysis — Margin analysis
//   GET    /api/insights/vendor-reliability — Vendor scoring
//   GET    /api/insights/customer-risk  — Customer payment risk
//   GET    /api/insights/branch-profitability — Branch P&L
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { alertRulesService } from '../services/alert-rules.service';
import { notificationsService } from '../services/notifications.service';
import { insightsService } from '../services/insights.service';

export async function alertsNotificationsRoutes(server: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════
  // ALERT RULES — Step 43
  // ═══════════════════════════════════════════════════════════

  server.post('/alert-rules', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const rule = await alertRulesService.createRule(
        request.user!.companyId, request.body as any, request.user!.userId
      );
      return reply.code(201).send({ success: true, data: rule });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.get('/alert-rules', { preHandler: [authenticate] }, async (request) => {
    const { alert_type, page, limit, search, sortBy, sortOrder } = request.query as any;
    const result = await alertRulesService.listRules({
      companyId: request.user!.companyId,
      alert_type,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search, sortBy, sortOrder,
    });
    return { success: true, ...result };
  });

  server.get('/alert-rules/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const rule = await alertRulesService.getRule(id, request.user!.companyId);
      return { success: true, data: rule };
    } catch (error: any) {
      return reply.code(404).send({ success: false, error: error.message });
    }
  });

  server.put('/alert-rules/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const updated = await alertRulesService.updateRule(
        id, request.user!.companyId, request.body as any, request.user!.userId
      );
      return { success: true, data: updated };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.delete('/alert-rules/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await alertRulesService.deleteRule(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Alert rule deleted' };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/alert-rules/evaluate
   * Evaluate all active alert rules and generate notifications.
   * Called manually or by scheduled task.
   */
  server.post('/alert-rules/evaluate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const result = await alertRulesService.evaluateAllRules(
        request.user!.companyId, request.user!.userId
      );
      return {
        success: true,
        data: result,
        message: `${result.rules_triggered} of ${result.rules_evaluated} rule(s) triggered, ${result.total_notifications} notification(s) created`,
      };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // NOTIFICATIONS — Step 44
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/notifications
   * Query: ?filter=unread|read|all&notification_type=&priority=&page=&limit=
   */
  server.get('/notifications', { preHandler: [authenticate] }, async (request) => {
    const { filter, notification_type, priority, page, limit } = request.query as any;
    const result = await notificationsService.listForUser(
      request.user!.companyId, request.user!.userId, {
        filter, notification_type, priority,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
      }
    );
    return { success: true, ...result };
  });

  server.get('/notifications/unread-count', { preHandler: [authenticate] }, async (request) => {
    const result = await notificationsService.getUnreadCount(
      request.user!.companyId, request.user!.userId
    );
    return { success: true, data: result };
  });

  server.put('/notifications/:id/read', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const notif = await notificationsService.markAsRead(
        id, request.user!.companyId, request.user!.userId
      );
      return { success: true, data: notif };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/notifications/read-all', { preHandler: [authenticate] }, async (request) => {
    const result = await notificationsService.markAllAsRead(
      request.user!.companyId, request.user!.userId
    );
    return { success: true, data: result, message: `${result.marked_count} notification(s) marked as read` };
  });

  server.put('/notifications/:id/dismiss', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const notif = await notificationsService.dismiss(
        id, request.user!.companyId, request.user!.userId
      );
      return { success: true, data: notif };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/notifications/dismiss-all', { preHandler: [authenticate] }, async (request) => {
    const result = await notificationsService.dismissAll(
      request.user!.companyId, request.user!.userId
    );
    return { success: true, data: result, message: `${result.dismissed_count} notification(s) dismissed` };
  });

  // ═══════════════════════════════════════════════════════════
  // BUSINESS INSIGHTS — Step 45
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/insights/dashboard
   * Combined summary: low stock, overstock, pending approvals,
   * receivables, payables, work orders, inventory value
   */
  server.get('/insights/dashboard', { preHandler: [authenticate] }, async (request) => {
    const data = await insightsService.getDashboardSummary(request.user!.companyId);
    return { success: true, data };
  });

  /**
   * GET /api/insights/item-movement
   * Query: ?days=90&branch_id=&category=fast|slow|dead|all&limit=50
   */
  server.get('/insights/item-movement', { preHandler: [authenticate] }, async (request) => {
    const { days, branch_id, category, limit } = request.query as any;
    const data = await insightsService.getItemMovementAnalysis(request.user!.companyId, {
      days: days ? parseInt(days, 10) : 90,
      branch_id,
      category: category || 'all',
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return { success: true, data };
  });

  /**
   * GET /api/insights/stockout-predictions
   * Query: ?branch_id=&days_lookback=30&limit=50
   */
  server.get('/insights/stockout-predictions', { preHandler: [authenticate] }, async (request) => {
    const { branch_id, days_lookback, limit } = request.query as any;
    const data = await insightsService.getStockoutPredictions(request.user!.companyId, {
      branch_id,
      days_lookback: days_lookback ? parseInt(days_lookback, 10) : 30,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return { success: true, data };
  });

  /**
   * GET /api/insights/margin-analysis
   * Query: ?branch_id=&days=90&limit=50
   */
  server.get('/insights/margin-analysis', { preHandler: [authenticate] }, async (request) => {
    const { branch_id, days, limit } = request.query as any;
    const data = await insightsService.getMarginAnalysis(request.user!.companyId, {
      branch_id,
      days: days ? parseInt(days, 10) : 90,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return { success: true, data };
  });

  /**
   * GET /api/insights/vendor-reliability
   * Query: ?limit=50
   */
  server.get('/insights/vendor-reliability', { preHandler: [authenticate] }, async (request) => {
    const { limit } = request.query as any;
    const data = await insightsService.getVendorReliability(request.user!.companyId, {
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return { success: true, data };
  });

  /**
   * GET /api/insights/customer-risk
   * Query: ?limit=50
   */
  server.get('/insights/customer-risk', { preHandler: [authenticate] }, async (request) => {
    const { limit } = request.query as any;
    const data = await insightsService.getCustomerPaymentRisk(request.user!.companyId, {
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return { success: true, data };
  });

  /**
   * GET /api/insights/branch-profitability
   * Query: ?days=90
   */
  server.get('/insights/branch-profitability', { preHandler: [authenticate] }, async (request) => {
    const { days } = request.query as any;
    const data = await insightsService.getBranchProfitability(request.user!.companyId, {
      days: days ? parseInt(days, 10) : 90,
    });
    return { success: true, data };
  });
}