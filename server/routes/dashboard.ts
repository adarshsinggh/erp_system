// =============================================================
// File: server/routes/dashboard.ts
// Module: UI/UX Polish — Phase 16 (Steps 51 & 52)
//
// KEYBOARD SHORTCUTS (Step 51):
//   GET    /api/shortcuts             — Get user's shortcuts
//   PUT    /api/shortcuts             — Update custom shortcuts
//   POST   /api/shortcuts/reset       — Reset to defaults
//
// DASHBOARD (Step 52):
//   GET    /api/dashboard             — Role-based dashboard data
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { dashboardService } from '../services/dashboard.service';

export async function dashboardRoutes(server: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS — Step 51
  // ═══════════════════════════════════════════════════════════

  server.get('/shortcuts', { preHandler: [authenticate] }, async (request) => {
    const data = await dashboardService.getShortcuts(
      request.user!.companyId, request.user!.userId
    );
    return { success: true, data };
  });

  server.put('/shortcuts', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const shortcuts = request.body as Record<string, any[]>;
      const data = await dashboardService.updateShortcuts(
        request.user!.companyId, request.user!.userId, shortcuts
      );
      return { success: true, data, message: 'Shortcuts updated' };
    } catch (e: any) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  server.post('/shortcuts/reset', { preHandler: [authenticate] }, async (request) => {
    const data = await dashboardService.resetShortcuts(
      request.user!.companyId, request.user!.userId
    );
    return { success: true, data, message: 'Shortcuts reset to defaults' };
  });

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD — Step 52
  // ═══════════════════════════════════════════════════════════

  /**
   * GET /api/dashboard
   * Returns role-specific KPIs, widgets, quick actions,
   * pending approvals, unread notifications, recent activity.
   */
  server.get('/dashboard', { preHandler: [authenticate] }, async (request) => {
    const data = await dashboardService.getDashboard(
      request.user!.companyId,
      request.user!.userId,
      request.user!.roleId
    );
    return { success: true, data };
  });
}