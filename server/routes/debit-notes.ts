// =============================================================
// File: server/routes/debit-notes.ts
// Module: Purchase Management
// Description: REST API routes for Debit Notes.
//              Endpoints: create, list, get, update, delete,
//              approve, apply, cancel.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { debitNoteService } from '../services/debit-note.service';

export async function debitNoteRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /debit-notes — Create debit note
  // ──────────────────────────────────────────────────────────
  server.post('/debit-notes', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
      if (!body.vendor_id) {
        return reply.code(400).send({ success: false, error: 'vendor_id is required' });
      }
      if (!body.debit_note_date) {
        return reply.code(400).send({ success: false, error: 'debit_note_date is required' });
      }

      const user = request.user!;
      const debitNote = await debitNoteService.createDebitNote({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        debit_note_date: body.debit_note_date,
        vendor_id: body.vendor_id,
        vendor_bill_id: body.vendor_bill_id || undefined,
        reason: body.reason,
        reason_detail: body.reason_detail,
        subtotal: parseFloat(body.subtotal) || 0,
        cgst_amount: parseFloat(body.cgst_amount) || 0,
        sgst_amount: parseFloat(body.sgst_amount) || 0,
        igst_amount: parseFloat(body.igst_amount) || 0,
        internal_notes: body.internal_notes,
        metadata: body.metadata,
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: debitNote });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /debit-notes — List debit notes (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/debit-notes', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      vendor_id, reason,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await debitNoteService.listDebitNotes({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      vendor_id,
      reason,
      from_date,
      to_date,
      sortBy: sort_by || 'debit_note_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /debit-notes/:id — Get debit note with full details
  // ──────────────────────────────────────────────────────────
  server.get('/debit-notes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const debitNote = await debitNoteService.getDebitNoteWithDetails(id, request.user!.companyId);

    if (!debitNote) {
      return reply.code(404).send({ success: false, error: 'Debit note not found' });
    }

    return { success: true, data: debitNote };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /debit-notes/:id — Update debit note (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/debit-notes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const user = request.user!;
      const updated = await debitNoteService.updateDebitNote(id, user.companyId, {
        ...body,
        bill_id: body.vendor_bill_id !== undefined ? body.vendor_bill_id : body.bill_id,
        updated_by: user.userId,
      });

      return { success: true, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // DELETE /debit-notes/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/debit-notes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await debitNoteService.deleteDebitNote(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Debit note deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /debit-notes/:id/approve — Approve (draft → approved)
  // ──────────────────────────────────────────────────────────
  server.post('/debit-notes/:id/approve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const approved = await debitNoteService.approveDebitNote(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Debit note approved',
        data: approved,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /debit-notes/:id/apply — Apply debit note
  // ──────────────────────────────────────────────────────────
  server.post('/debit-notes/:id/apply', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const applied = await debitNoteService.applyDebitNote(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Debit note applied',
        data: applied,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /debit-notes/:id/cancel — Cancel debit note
  // ──────────────────────────────────────────────────────────
  server.post('/debit-notes/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await debitNoteService.cancelDebitNote(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Debit note cancelled',
        data: cancelled,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
}
