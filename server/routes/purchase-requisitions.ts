// =============================================================
// File: server/routes/purchase-requisitions.ts
// Module: Purchase Management
// Description: REST API routes for Purchase Requisitions.
//              Endpoints: create, list, get, update, delete,
//              submit, approve, reject, convert to PO.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { purchaseRequisitionService } from '../services/purchase-requisition.service';
import { purchaseOrderService } from '../services/purchase-order.service';

export async function purchaseRequisitionRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /purchase-requisitions — Create purchase requisition
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-requisitions', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
      if (!body.requisition_date) {
        return reply.code(400).send({ success: false, error: 'requisition_date is required' });
      }
      if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        return reply.code(400).send({ success: false, error: 'At least one line item is required' });
      }

      for (let i = 0; i < body.lines.length; i++) {
        const line = body.lines[i];
        if (!line.item_id) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: item_id is required` });
        }
        if (!line.quantity || line.quantity <= 0) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: quantity must be > 0` });
        }
        if (!line.uom_id) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: uom_id is required` });
        }
      }

      const user = request.user!;
      const requisition = await purchaseRequisitionService.createRequisition({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        requisition_date: body.requisition_date,
        required_by_date: body.required_by_date,
        priority: body.priority,
        purpose: body.purpose || body.justification,
        department: body.department,
        internal_notes: body.internal_notes,
        metadata: {
          ...body.metadata,
          ...(body.source ? { source: body.source } : {}),
        },
        lines: body.lines.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          item_id: l.item_id,
          description: l.description,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          estimated_price: l.estimated_price ? parseFloat(l.estimated_price) : undefined,
          preferred_vendor_id: l.preferred_vendor_id,
          remarks: l.remarks,
        })),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: requisition });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /purchase-requisitions — List requisitions (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/purchase-requisitions', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      priority, branch_id,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await purchaseRequisitionService.listRequisitions({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      priority,
      branch_id: branch_id || undefined,
      from_date,
      to_date,
      sortBy: sort_by || 'requisition_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /purchase-requisitions/:id — Get requisition with details
  // ──────────────────────────────────────────────────────────
  server.get('/purchase-requisitions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const requisition = await purchaseRequisitionService.getRequisitionWithDetails(id, request.user!.companyId);

    if (!requisition) {
      return reply.code(404).send({ success: false, error: 'Purchase requisition not found' });
    }

    return { success: true, data: requisition };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /purchase-requisitions/:id — Update requisition (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/purchase-requisitions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      // Validate lines if provided
      if (body.lines) {
        if (!Array.isArray(body.lines) || body.lines.length === 0) {
          return reply.code(400).send({ success: false, error: 'lines must be a non-empty array if provided' });
        }
        for (let i = 0; i < body.lines.length; i++) {
          const line = body.lines[i];
          if (!line.item_id) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: item_id is required` });
          }
          if (!line.quantity || line.quantity <= 0) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: quantity must be > 0` });
          }
          if (!line.uom_id) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: uom_id is required` });
          }
        }
      }

      const user = request.user!;
      const updated = await purchaseRequisitionService.updateRequisition(id, user.companyId, {
        ...body,
        purpose: body.purpose || body.justification,
        metadata: body.source
          ? { ...body.metadata, source: body.source }
          : body.metadata,
        lines: body.lines?.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          item_id: l.item_id,
          description: l.description,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          estimated_price: l.estimated_price ? parseFloat(l.estimated_price) : undefined,
          preferred_vendor_id: l.preferred_vendor_id,
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
  // DELETE /purchase-requisitions/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/purchase-requisitions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await purchaseRequisitionService.deleteRequisition(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Purchase requisition deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /purchase-requisitions/:id/submit — Submit (draft → submitted)
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-requisitions/:id/submit', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const submitted = await purchaseRequisitionService.submitRequisition(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Purchase requisition submitted',
        data: submitted,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /purchase-requisitions/:id/approve — Approve (submitted → approved)
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-requisitions/:id/approve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const approved = await purchaseRequisitionService.approveRequisition(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Purchase requisition approved',
        data: approved,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /purchase-requisitions/:id/reject — Reject (submitted → rejected)
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-requisitions/:id/reject', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      if (!body.reason) {
        return reply.code(400).send({ success: false, error: 'reason is required for rejection' });
      }

      const rejected = await purchaseRequisitionService.rejectRequisition(
        id,
        request.user!.companyId,
        request.user!.userId,
        body.reason
      );
      return {
        success: true,
        message: 'Purchase requisition rejected',
        data: rejected,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /purchase-requisitions/:id/convert-to-po — Convert
  // an approved requisition to a purchase order
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-requisitions/:id/convert-to-po', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const user = request.user!;

      const po = await purchaseOrderService.createFromRequisition(
        id,
        user.companyId,
        user.userId,
        body
      );

      return reply.code(201).send({ success: true, data: po });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
}
