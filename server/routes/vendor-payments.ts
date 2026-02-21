// =============================================================
// File: server/routes/vendor-payments.ts
// Module: Purchase Management
// Description: REST API routes for Vendor Payments.
//              Endpoints: create, list, get, update, delete,
//              confirm, bounce, cancel.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { vendorPaymentService } from '../services/vendor-payment.service';

export async function vendorPaymentRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /vendor-payments — Create vendor payment
  // ──────────────────────────────────────────────────────────
  server.post('/vendor-payments', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
      if (!body.vendor_id) {
        return reply.code(400).send({ success: false, error: 'vendor_id is required' });
      }
      if (!body.payment_date) {
        return reply.code(400).send({ success: false, error: 'payment_date is required' });
      }
      if (!body.amount || body.amount <= 0) {
        return reply.code(400).send({ success: false, error: 'amount is required and must be > 0' });
      }

      const user = request.user!;

      // Build metadata from frontend fields
      const metadata: Record<string, any> = { ...(body.metadata || {}) };
      if (body.cheque_number) metadata.cheque_number = body.cheque_number;
      if (body.cheque_date) metadata.cheque_date = body.cheque_date;
      if (body.transaction_reference) metadata.transaction_reference = body.transaction_reference;
      if (body.vendor_bill_id) metadata.vendor_bill_id = body.vendor_bill_id;
      if (body.is_advance !== undefined) metadata.is_advance = body.is_advance;

      // Map payment_mode: neft/rtgs → bank_transfer, store original in metadata
      let paymentMode = body.payment_mode;
      if (paymentMode === 'neft' || paymentMode === 'rtgs') {
        metadata.original_payment_mode = paymentMode;
        paymentMode = 'bank_transfer';
      }

      const vendorPayment = await vendorPaymentService.createVendorPayment({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        payment_date: body.payment_date,
        vendor_id: body.vendor_id,
        amount: parseFloat(body.amount),
        payment_mode: paymentMode,
        transaction_reference: body.transaction_reference || body.reference_number,
        bank_account_id: body.bank_account_id || undefined,
        cheque_number: body.cheque_number || undefined,
        cheque_date: body.cheque_date || undefined,
        vendor_bill_id: body.vendor_bill_id || undefined,
        tds_deducted: body.tds_deducted ? parseFloat(body.tds_deducted) : undefined,
        narration: body.narration || body.notes,
        is_advance: body.is_advance || false,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: vendorPayment });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /vendor-payments — List vendor payments (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/vendor-payments', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      vendor_id, payment_mode,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await vendorPaymentService.listVendorPayments({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      vendor_id,
      payment_mode,
      from_date,
      to_date,
      sortBy: sort_by || 'payment_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /vendor-payments/:id — Get vendor payment with details
  // ──────────────────────────────────────────────────────────
  server.get('/vendor-payments/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const vendorPayment = await vendorPaymentService.getVendorPaymentWithDetails(id, request.user!.companyId);

    if (!vendorPayment) {
      return reply.code(404).send({ success: false, error: 'Vendor payment not found' });
    }

    return { success: true, data: vendorPayment };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /vendor-payments/:id — Update vendor payment
  // ──────────────────────────────────────────────────────────
  server.put('/vendor-payments/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const user = request.user!;

      const updated = await vendorPaymentService.updateVendorPayment(id, user.companyId, {
        ...body,
        updated_by: user.userId,
      });

      return { success: true, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // DELETE /vendor-payments/:id — Soft delete vendor payment
  // ──────────────────────────────────────────────────────────
  server.delete('/vendor-payments/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await vendorPaymentService.deleteVendorPayment(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Vendor payment deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /vendor-payments/:id/confirm — Confirm vendor payment
  // ──────────────────────────────────────────────────────────
  server.post('/vendor-payments/:id/confirm', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const confirmed = await vendorPaymentService.confirmVendorPayment(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Vendor payment confirmed',
        data: confirmed,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /vendor-payments/:id/bounce — Bounce vendor payment
  // ──────────────────────────────────────────────────────────
  server.post('/vendor-payments/:id/bounce', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const bounced = await vendorPaymentService.bounceVendorPayment(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Vendor payment bounced',
        data: bounced,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /vendor-payments/:id/cancel — Cancel vendor payment
  // ──────────────────────────────────────────────────────────
  server.post('/vendor-payments/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await vendorPaymentService.cancelVendorPayment(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Vendor payment cancelled',
        data: cancelled,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
}
