// =============================================================
// File: server/routes/credit-notes.ts
// Module: Sales Management — Phase 5, Step 19
// Description: REST API routes for Credit Notes & Sales Returns.
//              Endpoints: create, create from invoice, list, get,
//              update, delete, approve, apply (reduces invoice
//              amount + stock return), cancel, invoice credit
//              summary.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { creditNoteService } from '../services/credit-note.service';

export async function creditNoteRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /credit-notes — Create credit note manually
  // ──────────────────────────────────────────────────────────
  server.post('/credit-notes', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      if (!body.credit_note_date) {
        return reply.code(400).send({ success: false, error: 'credit_note_date is required' });
      }
      if (!body.customer_id) {
        return reply.code(400).send({ success: false, error: 'customer_id is required' });
      }
      if (!body.reason) {
        return reply.code(400).send({ success: false, error: 'reason is required' });
      }

      const validReasons = ['return', 'pricing_error', 'quality', 'goodwill'];
      if (!validReasons.includes(body.reason)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid reason. Allowed: ${validReasons.join(', ')}`,
        });
      }

      if (body.subtotal === undefined || body.subtotal === null || body.subtotal < 0) {
        return reply.code(400).send({ success: false, error: 'subtotal is required and must be >= 0' });
      }

      const user = request.user!;
      const creditNote = await creditNoteService.createCreditNote({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        credit_note_date: body.credit_note_date,
        customer_id: body.customer_id,
        invoice_id: body.invoice_id,
        reason: body.reason,
        reason_detail: body.reason_detail,
        subtotal: parseFloat(body.subtotal),
        cgst_amount: body.cgst_amount ? parseFloat(body.cgst_amount) : undefined,
        sgst_amount: body.sgst_amount ? parseFloat(body.sgst_amount) : undefined,
        igst_amount: body.igst_amount ? parseFloat(body.igst_amount) : undefined,
        metadata: body.metadata,
        return_items: body.return_items,
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: creditNote });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /credit-notes/from-invoice/:invoiceId
  // Auto-compute GST reversal from invoice
  // ──────────────────────────────────────────────────────────
  server.post('/credit-notes/from-invoice/:invoiceId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { invoiceId } = request.params as { invoiceId: string };
      const body = (request.body as any) || {};
      const user = request.user!;

      if (!body.reason) {
        return reply.code(400).send({ success: false, error: 'reason is required' });
      }

      const validReasons = ['return', 'pricing_error', 'quality', 'goodwill'];
      if (!validReasons.includes(body.reason)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid reason. Allowed: ${validReasons.join(', ')}`,
        });
      }

      // Must provide either credit_percentage or credit_amount (or neither for full credit)
      if (body.credit_percentage !== undefined && body.credit_amount !== undefined) {
        return reply.code(400).send({
          success: false,
          error: 'Provide either credit_percentage or credit_amount, not both',
        });
      }

      const creditNote = await creditNoteService.createFromInvoice(
        invoiceId,
        user.companyId,
        user.userId,
        {
          reason: body.reason,
          reason_detail: body.reason_detail,
          credit_percentage: body.credit_percentage ? parseFloat(body.credit_percentage) : undefined,
          credit_amount: body.credit_amount ? parseFloat(body.credit_amount) : undefined,
          return_to_warehouse_id: body.return_to_warehouse_id,
        }
      );

      return reply.code(201).send({
        success: true,
        message: 'Credit note created from invoice with GST reversal',
        data: creditNote,
      });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /credit-notes — List credit notes (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/credit-notes', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      customer_id, branch_id, invoice_id, reason,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await creditNoteService.listCreditNotes({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      customer_id,
      branch_id: branch_id || undefined,
      invoice_id,
      reason,
      from_date,
      to_date,
      sortBy: sort_by || 'credit_note_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /credit-notes/:id — Get credit note with full details
  // ──────────────────────────────────────────────────────────
  server.get('/credit-notes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const creditNote = await creditNoteService.getCreditNoteWithDetails(id, request.user!.companyId);

    if (!creditNote) {
      return reply.code(404).send({ success: false, error: 'Credit note not found' });
    }

    return { success: true, data: creditNote };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /credit-notes/:id — Update credit note (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/credit-notes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const user = request.user!;

      const updated = await creditNoteService.updateCreditNote(id, user.companyId, {
        reason_detail: body.reason_detail,
        subtotal: body.subtotal !== undefined ? parseFloat(body.subtotal) : undefined,
        cgst_amount: body.cgst_amount !== undefined ? parseFloat(body.cgst_amount) : undefined,
        sgst_amount: body.sgst_amount !== undefined ? parseFloat(body.sgst_amount) : undefined,
        igst_amount: body.igst_amount !== undefined ? parseFloat(body.igst_amount) : undefined,
        metadata: body.metadata,
        updated_by: user.userId,
      });

      return { success: true, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // DELETE /credit-notes/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/credit-notes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await creditNoteService.deleteCreditNote(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Credit note deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /credit-notes/:id/approve — Approve credit note
  // ──────────────────────────────────────────────────────────
  server.post('/credit-notes/:id/approve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const approved = await creditNoteService.approveCreditNote(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, data: approved };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /credit-notes/:id/apply — Apply credit note
  // (reduces invoice amount_due + returns stock for returns)
  // ──────────────────────────────────────────────────────────
  server.post('/credit-notes/:id/apply', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const applied = await creditNoteService.applyCreditNote(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Credit note applied. Invoice amount adjusted and stock returned (if applicable).',
        data: applied,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /credit-notes/:id/cancel — Cancel credit note
  // (draft or approved only)
  // ──────────────────────────────────────────────────────────
  server.post('/credit-notes/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await creditNoteService.cancelCreditNote(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, data: cancelled };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /credit-notes/invoice-summary/:invoiceId
  // Total credits applied against an invoice
  // ──────────────────────────────────────────────────────────
  server.get('/credit-notes/invoice-summary/:invoiceId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { invoiceId } = request.params as { invoiceId: string };
      const summary = await creditNoteService.getInvoiceCreditSummary(
        invoiceId,
        request.user!.companyId
      );
      return { success: true, data: summary };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
}