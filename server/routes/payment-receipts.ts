// =============================================================
// File: server/routes/payment-receipts.ts
// Module: Sales Management — Phase 5, Step 20
// Description: REST API routes for Payment Receipts.
//              Endpoints: create, list, get, update, delete,
//              confirm (updates invoice), bounce (reverses
//              payment), cancel, customer payment history,
//              unallocated advances, allocate advance to invoice.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { paymentReceiptService } from '../services/payment-receipt.service';

export async function paymentReceiptRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /payment-receipts — Create payment receipt
  // ──────────────────────────────────────────────────────────
  server.post('/payment-receipts', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      if (!body.receipt_date) {
        return reply.code(400).send({ success: false, error: 'receipt_date is required' });
      }
      if (!body.customer_id) {
        return reply.code(400).send({ success: false, error: 'customer_id is required' });
      }
      if (!body.amount || body.amount <= 0) {
        return reply.code(400).send({ success: false, error: 'amount must be > 0' });
      }
      if (!body.payment_mode) {
        return reply.code(400).send({ success: false, error: 'payment_mode is required' });
      }

      const validModes = ['cash', 'bank_transfer', 'cheque', 'upi', 'card'];
      if (!validModes.includes(body.payment_mode)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid payment_mode. Allowed: ${validModes.join(', ')}`,
        });
      }

      if (body.payment_mode === 'cheque' && !body.cheque_number) {
        return reply.code(400).send({ success: false, error: 'cheque_number is required for cheque payments' });
      }

      if (body.tds_deducted !== undefined && body.tds_deducted < 0) {
        return reply.code(400).send({ success: false, error: 'tds_deducted must be >= 0' });
      }

      const user = request.user!;
      const receipt = await paymentReceiptService.createPaymentReceipt({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        receipt_date: body.receipt_date,
        customer_id: body.customer_id,
        amount: parseFloat(body.amount),
        payment_mode: body.payment_mode,
        bank_account_id: body.bank_account_id,
        cheque_number: body.cheque_number,
        cheque_date: body.cheque_date,
        reference_number: body.reference_number,
        invoice_id: body.invoice_id,
        tds_deducted: body.tds_deducted ? parseFloat(body.tds_deducted) : undefined,
        narration: body.narration,
        metadata: body.metadata,
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: receipt });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /payment-receipts — List receipts (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/payment-receipts', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      customer_id, branch_id, invoice_id, payment_mode,
      from_date, to_date, is_advance,
      sort_by, sort_order,
    } = request.query as any;

    const result = await paymentReceiptService.listPaymentReceipts({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      customer_id,
      branch_id: branch_id || undefined,
      invoice_id,
      payment_mode,
      from_date,
      to_date,
      is_advance: is_advance === 'true' ? true : is_advance === 'false' ? false : undefined,
      sortBy: sort_by || 'receipt_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /payment-receipts/:id — Get receipt with full details
  // ──────────────────────────────────────────────────────────
  server.get('/payment-receipts/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const receipt = await paymentReceiptService.getReceiptWithDetails(id, request.user!.companyId);

    if (!receipt) {
      return reply.code(404).send({ success: false, error: 'Payment receipt not found' });
    }

    return { success: true, data: receipt };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /payment-receipts/:id — Update receipt (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/payment-receipts/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const user = request.user!;

      if (body.amount !== undefined && body.amount <= 0) {
        return reply.code(400).send({ success: false, error: 'amount must be > 0' });
      }

      if (body.payment_mode) {
        const validModes = ['cash', 'bank_transfer', 'cheque', 'upi', 'card'];
        if (!validModes.includes(body.payment_mode)) {
          return reply.code(400).send({
            success: false,
            error: `Invalid payment_mode. Allowed: ${validModes.join(', ')}`,
          });
        }
      }

      const updated = await paymentReceiptService.updatePaymentReceipt(id, user.companyId, {
        receipt_date: body.receipt_date,
        amount: body.amount ? parseFloat(body.amount) : undefined,
        payment_mode: body.payment_mode,
        bank_account_id: body.bank_account_id,
        cheque_number: body.cheque_number,
        cheque_date: body.cheque_date,
        reference_number: body.reference_number,
        invoice_id: body.invoice_id,
        tds_deducted: body.tds_deducted !== undefined ? parseFloat(body.tds_deducted) : undefined,
        narration: body.narration,
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
  // DELETE /payment-receipts/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/payment-receipts/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await paymentReceiptService.deletePaymentReceipt(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Payment receipt deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /payment-receipts/:id/confirm — Confirm receipt
  // (updates invoice amount_paid/amount_due)
  // ──────────────────────────────────────────────────────────
  server.post('/payment-receipts/:id/confirm', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const confirmed = await paymentReceiptService.confirmReceipt(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Payment receipt confirmed. Invoice updated.',
        data: confirmed,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /payment-receipts/:id/bounce — Mark cheque as bounced
  // (reverses invoice payment)
  // ──────────────────────────────────────────────────────────
  server.post('/payment-receipts/:id/bounce', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const bounced = await paymentReceiptService.bounceReceipt(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Cheque bounced. Invoice payment reversed.',
        data: bounced,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /payment-receipts/:id/cancel — Cancel receipt (draft only)
  // ──────────────────────────────────────────────────────────
  server.post('/payment-receipts/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await paymentReceiptService.cancelReceipt(
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
  // GET /payment-receipts/customer-history/:customerId
  // Full payment history with summary
  // ──────────────────────────────────────────────────────────
  server.get('/payment-receipts/customer-history/:customerId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { customerId } = request.params as { customerId: string };
      const { from_date, to_date, limit } = request.query as any;

      const history = await paymentReceiptService.getCustomerPaymentHistory(
        customerId,
        request.user!.companyId,
        {
          from_date,
          to_date,
          limit: limit ? parseInt(limit) : undefined,
        }
      );
      return { success: true, data: history };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /payment-receipts/advances/:customerId
  // Unallocated advance payments for a customer
  // ──────────────────────────────────────────────────────────
  server.get('/payment-receipts/advances/:customerId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { customerId } = request.params as { customerId: string };
      const advances = await paymentReceiptService.getUnallocatedAdvances(
        customerId,
        request.user!.companyId
      );
      return { success: true, data: advances };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /payment-receipts/:id/allocate — Allocate advance to invoice
  // Body: { invoice_id: string }
  // ──────────────────────────────────────────────────────────
  server.post('/payment-receipts/:id/allocate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { invoice_id } = request.body as { invoice_id: string };

      if (!invoice_id) {
        return reply.code(400).send({ success: false, error: 'invoice_id is required' });
      }

      const allocated = await paymentReceiptService.allocateAdvanceToInvoice(
        id,
        invoice_id,
        request.user!.companyId,
        request.user!.userId
      );

      return {
        success: true,
        message: 'Advance payment allocated to invoice',
        data: allocated,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
}