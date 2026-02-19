// =============================================================
// File: server/routes/sales-quotations.ts
// Module: Sales Management — Phase 5, Step 15
// Description: REST API routes for Sales Quotations.
//              Endpoints: create, list, get, update, delete,
//              status change, duplicate, convert-to-SO,
//              expire overdue.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { salesQuotationService } from '../services/sales-quotation.service';

export async function salesQuotationRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /sales-quotations — Create a new quotation
  // ──────────────────────────────────────────────────────────
  server.post('/sales-quotations', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Basic validation
      if (!body.quotation_date) {
        return reply.code(400).send({ success: false, error: 'quotation_date is required' });
      }
      if (!body.customer_id) {
        return reply.code(400).send({ success: false, error: 'customer_id is required' });
      }
      if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        return reply.code(400).send({ success: false, error: 'At least one line item is required' });
      }

      // Validate each line
      for (let i = 0; i < body.lines.length; i++) {
        const line = body.lines[i];
        if (!line.product_id) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: product_id is required` });
        }
        if (!line.quantity || line.quantity <= 0) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: quantity must be > 0` });
        }
        if (!line.uom_id) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: uom_id is required` });
        }
        if (line.unit_price === undefined || line.unit_price === null || line.unit_price < 0) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: unit_price is required and must be >= 0` });
        }
        if (line.discount_type && !['percentage', 'fixed'].includes(line.discount_type)) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: discount_type must be 'percentage' or 'fixed'` });
        }
        if (line.discount_type === 'percentage' && line.discount_value > 100) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: discount percentage cannot exceed 100%` });
        }
      }

      const user = request.user!;
      const quotation = await salesQuotationService.createQuotation({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        quotation_date: body.quotation_date,
        valid_until: body.valid_until,
        customer_id: body.customer_id,
        contact_person_id: body.contact_person_id,
        billing_address_id: body.billing_address_id,
        shipping_address_id: body.shipping_address_id,
        reference_number: body.reference_number,
        currency_code: body.currency_code,
        exchange_rate: body.exchange_rate,
        terms_and_conditions: body.terms_and_conditions,
        internal_notes: body.internal_notes,
        metadata: body.metadata,
        lines: body.lines.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          product_id: l.product_id,
          description: l.description,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          unit_price: parseFloat(l.unit_price),
          discount_type: l.discount_type,
          discount_value: l.discount_value ? parseFloat(l.discount_value) : undefined,
          hsn_code: l.hsn_code,
        })),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: quotation });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /sales-quotations — List quotations (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/sales-quotations', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      customer_id, branch_id,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await salesQuotationService.listQuotations({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      customer_id,
      branch_id: branch_id || undefined,
      from_date,
      to_date,
      sortBy: sort_by || 'quotation_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /sales-quotations/:id — Get quotation with full details
  // ──────────────────────────────────────────────────────────
  server.get('/sales-quotations/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const quotation = await salesQuotationService.getQuotationWithDetails(id, request.user!.companyId);

    if (!quotation) {
      return reply.code(404).send({ success: false, error: 'Quotation not found' });
    }

    return { success: true, data: quotation };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /sales-quotations/:id — Update quotation (draft/sent only)
  // ──────────────────────────────────────────────────────────
  server.put('/sales-quotations/:id', { preHandler: [authenticate] }, async (request, reply) => {
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
          if (!line.product_id) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: product_id is required` });
          }
          if (!line.quantity || line.quantity <= 0) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: quantity must be > 0` });
          }
          if (!line.uom_id) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: uom_id is required` });
          }
          if (line.unit_price === undefined || line.unit_price === null || line.unit_price < 0) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: unit_price is required and must be >= 0` });
          }
        }
      }

      const user = request.user!;
      const updated = await salesQuotationService.updateQuotation(id, user.companyId, {
        ...body,
        lines: body.lines?.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          product_id: l.product_id,
          description: l.description,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          unit_price: parseFloat(l.unit_price),
          discount_type: l.discount_type,
          discount_value: l.discount_value ? parseFloat(l.discount_value) : undefined,
          hsn_code: l.hsn_code,
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
  // DELETE /sales-quotations/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/sales-quotations/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await salesQuotationService.deleteQuotation(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Quotation deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // PATCH /sales-quotations/:id/status — Change status
  // Body: { status: 'sent' | 'accepted' | 'rejected' | 'expired' }
  // ──────────────────────────────────────────────────────────
  server.patch('/sales-quotations/:id/status', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };

      if (!status) {
        return reply.code(400).send({ success: false, error: 'status is required' });
      }

      const validStatuses = ['sent', 'accepted', 'rejected', 'expired'];
      if (!validStatuses.includes(status)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid target status. Allowed: ${validStatuses.join(', ')}`,
        });
      }

      const updated = await salesQuotationService.updateStatus(
        id,
        request.user!.companyId,
        status,
        request.user!.userId
      );

      return { success: true, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /sales-quotations/:id/revert — Revert to draft
  // (from sent / rejected / expired)
  // ──────────────────────────────────────────────────────────
  server.post('/sales-quotations/:id/revert', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const updated = await salesQuotationService.revertToDraft(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /sales-quotations/:id/duplicate — Clone quotation
  // ──────────────────────────────────────────────────────────
  server.post('/sales-quotations/:id/duplicate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const body = request.body as any;

      const duplicate = await salesQuotationService.duplicateQuotation(
        id,
        user.companyId,
        body?.branch_id || user.branchId,
        user.userId
      );

      return reply.code(201).send({ success: true, data: duplicate });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /sales-quotations/:id/convert — Convert to Sales Order
  // (Placeholder — actual SO creation is in Step 16.
  //  For now, validates readiness and returns quotation data
  //  formatted for SO creation.)
  // ──────────────────────────────────────────────────────────
  server.post('/sales-quotations/:id/convert', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const user = request.user!;

      // Fetch full quotation
      const quotation = await salesQuotationService.getQuotationWithDetails(id, user.companyId);
      if (!quotation) {
        return reply.code(404).send({ success: false, error: 'Quotation not found' });
      }

      if (quotation.status !== 'accepted') {
        return reply.code(400).send({
          success: false,
          error: `Only accepted quotations can be converted. Current status: "${quotation.status}"`,
        });
      }

      // Check validity
      if (quotation.valid_until) {
        const today = new Date().toISOString().split('T')[0];
        if (quotation.valid_until < today) {
          return reply.code(400).send({
            success: false,
            error: `Quotation expired on ${quotation.valid_until}. Revert to draft and re-send, or create a new quotation.`,
          });
        }
      }

      // Return conversion-ready payload
      // (SalesOrderService in Step 16 will consume this)
      return {
        success: true,
        message: 'Quotation is ready for conversion. Sales Order creation will be available in the next phase.',
        data: {
          source_quotation_id: quotation.id,
          quotation_number: quotation.quotation_number,
          customer_id: quotation.customer_id,
          branch_id: quotation.branch_id,
          billing_address_id: quotation.billing_address_id,
          shipping_address_id: quotation.shipping_address_id,
          contact_person_id: quotation.contact_person_id,
          currency_code: quotation.currency_code,
          exchange_rate: quotation.exchange_rate,
          terms_and_conditions: quotation.terms_and_conditions,
          lines: quotation.lines.map((l: any) => ({
            product_id: l.product_id,
            description: l.description,
            quantity: l.quantity,
            uom_id: l.uom_id,
            unit_price: l.unit_price,
            discount_type: l.discount_type,
            discount_value: l.discount_value,
            hsn_code: l.hsn_code,
          })),
        },
      };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /sales-quotations/expire-overdue — Batch expire
  // (Utility endpoint, can also be triggered by cron)
  // ──────────────────────────────────────────────────────────
  server.post('/sales-quotations/expire-overdue', { preHandler: [authenticate] }, async (request) => {
    const result = await salesQuotationService.expireOverdueQuotations(request.user!.companyId);
    return { success: true, ...result };
  });
}