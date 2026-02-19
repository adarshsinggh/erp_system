// =============================================================
// File: server/routes/stock-adjustments.ts
// Module: Inventory Management — Phase 7, Step 30
// Description: REST API routes for Stock Adjustments.
//              Endpoints: create, list, get, update, delete,
//              approve, post (creates ledger entries),
//              cancel (reverses if posted).
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { stockAdjustmentService } from '../services/stock-adjustment.service';

const VALID_REASONS = ['physical_count', 'damage', 'theft', 'correction', 'opening_stock'];

export async function stockAdjustmentRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /inventory/stock-adjustments — Create adjustment
  // ──────────────────────────────────────────────────────────
  server.post('/inventory/stock-adjustments', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
      if (!body.adjustment_date) {
        return reply.code(400).send({ success: false, error: 'adjustment_date is required' });
      }
      if (!body.warehouse_id) {
        return reply.code(400).send({ success: false, error: 'warehouse_id is required' });
      }
      if (!body.reason || !VALID_REASONS.includes(body.reason)) {
        return reply.code(400).send({
          success: false,
          error: `reason is required and must be one of: ${VALID_REASONS.join(', ')}`,
        });
      }
      if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        return reply.code(400).send({ success: false, error: 'At least one line item is required' });
      }

      for (let i = 0; i < body.lines.length; i++) {
        const line = body.lines[i];
        if (!line.item_id && !line.product_id) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: Either item_id or product_id is required` });
        }
        if (line.actual_quantity === undefined || line.actual_quantity === null || line.actual_quantity < 0) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: actual_quantity is required and must be >= 0` });
        }
        if (!line.uom_id) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: uom_id is required` });
        }
      }

      const user = request.user!;
      const adjustment = await stockAdjustmentService.createAdjustment({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        adjustment_date: body.adjustment_date,
        warehouse_id: body.warehouse_id,
        reason: body.reason,
        reason_detail: body.reason_detail,
        metadata: body.metadata,
        lines: body.lines.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          item_id: l.item_id,
          product_id: l.product_id,
          actual_quantity: parseFloat(l.actual_quantity),
          uom_id: l.uom_id,
          unit_cost: l.unit_cost !== undefined ? parseFloat(l.unit_cost) : undefined,
          batch_id: l.batch_id,
          remarks: l.remarks,
        })),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: adjustment });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/stock-adjustments — List (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/stock-adjustments', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      branch_id, warehouse_id, reason,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await stockAdjustmentService.listAdjustments({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      branch_id,
      warehouse_id,
      reason,
      from_date,
      to_date,
      sortBy: sort_by || 'adjustment_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/stock-adjustments/:id — Get with details
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/stock-adjustments/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustment = await stockAdjustmentService.getAdjustmentWithDetails(id, request.user!.companyId);

    if (!adjustment) {
      return reply.code(404).send({ success: false, error: 'Stock adjustment not found' });
    }

    return { success: true, data: adjustment };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /inventory/stock-adjustments/:id — Update (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/inventory/stock-adjustments/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      // Validate reason if provided
      if (body.reason && !VALID_REASONS.includes(body.reason)) {
        return reply.code(400).send({
          success: false,
          error: `reason must be one of: ${VALID_REASONS.join(', ')}`,
        });
      }

      // Validate lines if provided
      if (body.lines) {
        if (!Array.isArray(body.lines) || body.lines.length === 0) {
          return reply.code(400).send({ success: false, error: 'lines must be a non-empty array if provided' });
        }
        for (let i = 0; i < body.lines.length; i++) {
          const line = body.lines[i];
          if (!line.item_id && !line.product_id) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: Either item_id or product_id is required` });
          }
          if (line.actual_quantity === undefined || line.actual_quantity === null || line.actual_quantity < 0) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: actual_quantity is required and must be >= 0` });
          }
          if (!line.uom_id) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: uom_id is required` });
          }
        }
      }

      const user = request.user!;
      const updated = await stockAdjustmentService.updateAdjustment(id, user.companyId, {
        adjustment_date: body.adjustment_date,
        reason: body.reason,
        reason_detail: body.reason_detail,
        metadata: body.metadata,
        lines: body.lines?.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          item_id: l.item_id,
          product_id: l.product_id,
          actual_quantity: parseFloat(l.actual_quantity),
          uom_id: l.uom_id,
          unit_cost: l.unit_cost !== undefined ? parseFloat(l.unit_cost) : undefined,
          batch_id: l.batch_id,
          remarks: l.remarks,
        })),
        updated_by: user.userId,
      });

      return { success: true, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // DELETE /inventory/stock-adjustments/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/inventory/stock-adjustments/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await stockAdjustmentService.deleteAdjustment(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Stock adjustment deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /inventory/stock-adjustments/:id/approve
  // Approve adjustment (draft → approved)
  // ──────────────────────────────────────────────────────────
  server.post('/inventory/stock-adjustments/:id/approve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const approved = await stockAdjustmentService.approveAdjustment(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Stock adjustment approved', data: approved };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /inventory/stock-adjustments/:id/post
  // Post adjustment (approved → posted)
  // Creates stock ledger entries for gains/losses.
  // ──────────────────────────────────────────────────────────
  server.post('/inventory/stock-adjustments/:id/post', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const posted = await stockAdjustmentService.postAdjustment(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Stock adjustment posted. Inventory updated.',
        data: posted,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('Insufficient') ? 409 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // PATCH /inventory/stock-adjustments/:id/cancel
  // Cancel adjustment. Reverses stock if posted.
  // ──────────────────────────────────────────────────────────
  server.patch('/inventory/stock-adjustments/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await stockAdjustmentService.cancelAdjustment(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Stock adjustment cancelled',
        data: cancelled,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
}