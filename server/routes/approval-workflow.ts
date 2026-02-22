// =============================================================
// File: server/routes/approval-workflow.ts
// Module: Approval Workflow — Phase 10 (Step 41)
// Description: Routes for approval matrix CRUD + approval engine
//
// APPROVAL MATRIX (Configuration):
//   POST   /api/approval-matrix          — Create rule
//   GET    /api/approval-matrix          — List rules
//   GET    /api/approval-matrix/:id      — Get single rule
//   PUT    /api/approval-matrix/:id      — Update rule
//   DELETE /api/approval-matrix/:id      — Delete rule
//
// APPROVAL ENGINE (Runtime):
//   POST   /api/approvals/submit         — Submit document for approval
//   GET    /api/approvals/pending        — My pending approval queue
//   POST   /api/approvals/:id/approve    — Approve entry
//   POST   /api/approvals/:id/reject     — Reject entry
//   GET    /api/approvals/history/:documentType/:documentId — History
//   GET    /api/approvals/status/:documentType/:documentId  — Status
//   GET    /api/approvals/dashboard      — Dashboard stats
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { approvalMatrixService, approvalEngineService } from '../services/approval-workflow.service';
import { getDb } from '../database/connection';

export async function approvalWorkflowRoutes(server: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════
  // ROLES — Needed by approval matrix UI for role selection
  // ═══════════════════════════════════════════════════════════

  server.get('/roles', { preHandler: [authenticate] }, async (request) => {
    const db = getDb();
    const roles = await db('roles')
      .where({ company_id: request.user!.companyId, is_deleted: false })
      .select('id', 'name', 'description', 'is_system_role')
      .orderBy('name', 'asc');
    return { success: true, data: roles };
  });

  // ═══════════════════════════════════════════════════════════
  // APPROVAL MATRIX — Configuration CRUD
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/approval-matrix
   * Create a new approval rule
   */
  server.post('/approval-matrix', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { companyId, userId } = request.user!;
      const body = request.body as {
        document_type: string;
        min_amount: number;
        max_amount?: number | null;
        approver_role_id: string;
        approval_level: number;
        is_mandatory?: boolean;
        is_active?: boolean;
      };

      if (!body.document_type || body.min_amount === undefined || !body.approver_role_id || !body.approval_level) {
        return reply.code(400).send({
          success: false,
          error: 'document_type, min_amount, approver_role_id, and approval_level are required',
        });
      }

      const rule = await approvalMatrixService.createRule(companyId, body, userId);
      return reply.code(201).send({ success: true, data: rule });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/approval-matrix
   * List approval rules with optional filters
   * Query: ?document_type=&page=&limit=&search=
   */
  server.get('/approval-matrix', { preHandler: [authenticate] }, async (request) => {
    const { companyId } = request.user!;
    const { document_type, page, limit, search, sortBy, sortOrder } = request.query as any;

    const result = await approvalMatrixService.listRules({
      companyId,
      document_type,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      search,
      sortBy,
      sortOrder,
    });

    return { success: true, ...result };
  });

  /**
   * GET /api/approval-matrix/:id
   * Get a single approval rule with role name
   */
  server.get('/approval-matrix/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const rule = await approvalMatrixService.getRule(id, request.user!.companyId);
      return { success: true, data: rule };
    } catch (error: any) {
      return reply.code(404).send({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/approval-matrix/:id
   * Update an approval rule
   */
  server.put('/approval-matrix/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { companyId, userId } = request.user!;
      const body = request.body as {
        min_amount?: number;
        max_amount?: number | null;
        approver_role_id?: string;
        approval_level?: number;
        is_mandatory?: boolean;
        is_active?: boolean;
      };

      const updated = await approvalMatrixService.updateRule(id, companyId, body, userId);
      return { success: true, data: updated };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/approval-matrix/:id
   * Soft-delete an approval rule
   */
  server.delete('/approval-matrix/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { companyId, userId } = request.user!;
      await approvalMatrixService.deleteRule(id, companyId, userId);
      return { success: true, message: 'Approval rule deleted' };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // APPROVAL ENGINE — Runtime Workflow
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/approvals/submit
   * Submit a document for approval. Creates queue entries per applicable rules.
   *
   * Body: { document_type, document_id, document_number?, amount }
   */
  server.post('/approvals/submit', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { companyId, userId } = request.user!;
      const body = request.body as {
        document_type: string;
        document_id: string;
        document_number?: string;
        amount: number;
      };

      if (!body.document_type || !body.document_id || body.amount === undefined) {
        return reply.code(400).send({
          success: false,
          error: 'document_type, document_id, and amount are required',
        });
      }

      if (body.amount < 0) {
        return reply.code(400).send({ success: false, error: 'amount must be >= 0' });
      }

      const entries = await approvalEngineService.submitForApproval(companyId, body, userId);
      return reply.code(201).send({
        success: true,
        data: entries,
        message: `Document submitted for approval (${entries.length} level(s))`,
      });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/approvals/pending
   * Get approval items actionable by the current user's role.
   * Only shows items where all previous levels are approved.
   *
   * Query: ?document_type=&page=&limit=
   */
  server.get('/approvals/pending', { preHandler: [authenticate] }, async (request) => {
    const { companyId, roleId } = request.user!;
    const { document_type, page, limit } = request.query as any;

    const result = await approvalEngineService.getPendingApprovals(companyId, roleId, {
      document_type,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    return { success: true, ...result };
  });

  /**
   * POST /api/approvals/:id/approve
   * Approve a pending queue entry.
   *
   * Body: { comments? }
   */
  server.post('/approvals/:id/approve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { companyId, userId, roleId } = request.user!;
      const body = request.body as { comments?: string } || {};

      const result = await approvalEngineService.approve(id, companyId, userId, roleId, body);
      return {
        success: true,
        data: result.approval,
        is_final_approval: result.is_final_approval,
        message: result.is_final_approval
          ? 'Final approval granted — document is now approved'
          : 'Approval recorded — awaiting next level',
      };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/approvals/:id/reject
   * Reject a pending queue entry. All remaining levels are also rejected.
   *
   * Body: { comments? }
   */
  server.post('/approvals/:id/reject', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { companyId, userId, roleId } = request.user!;
      const body = request.body as { comments?: string } || {};

      const result = await approvalEngineService.reject(id, companyId, userId, roleId, body);
      return {
        success: true,
        data: result.approval,
        message: 'Document rejected — all remaining levels cancelled',
      };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/approvals/history/:documentType/:documentId
   * Full approval audit trail for a specific document.
   */
  server.get('/approvals/history/:documentType/:documentId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { documentType, documentId } = request.params as { documentType: string; documentId: string };
      const history = await approvalEngineService.getApprovalHistory(request.user!.companyId, documentType, documentId);
      return { success: true, data: history };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/approvals/status/:documentType/:documentId
   * Current approval status summary for a document.
   */
  server.get('/approvals/status/:documentType/:documentId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { documentType, documentId } = request.params as { documentType: string; documentId: string };
      const status = await approvalEngineService.getApprovalStatus(request.user!.companyId, documentType, documentId);
      return { success: true, data: status };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/approvals/dashboard
   * Dashboard stats: pending count, today's actions, breakdown by doc type.
   */
  server.get('/approvals/dashboard', { preHandler: [authenticate] }, async (request) => {
    const { companyId, roleId } = request.user!;
    const stats = await approvalEngineService.getDashboardStats(companyId, roleId);
    return { success: true, data: stats };
  });
}