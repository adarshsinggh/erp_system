// =============================================================
// File: server/routes/sales-invoices.ts
// Module: Sales Management — Phase 5, Step 18
// Description: REST API routes for Sales Invoices.
//              Endpoints: create, create from SO, list, get,
//              update, delete, status change, set e-invoice IRN,
//              mark overdue, customer outstanding.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { salesInvoiceService } from '../services/sales-invoice.service';

export async function salesInvoiceRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /sales-invoices — Create standalone invoice
  // ──────────────────────────────────────────────────────────
  server.post('/sales-invoices', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      if (!body.invoice_date) {
        return reply.code(400).send({ success: false, error: 'invoice_date is required' });
      }
      if (!body.customer_id) {
        return reply.code(400).send({ success: false, error: 'customer_id is required' });
      }
      if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        return reply.code(400).send({ success: false, error: 'At least one line item is required' });
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

      const user = request.user!;
      const invoice = await salesInvoiceService.createInvoice({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        invoice_date: body.invoice_date,
        due_date: body.due_date,
        customer_id: body.customer_id,
        sales_order_id: body.sales_order_id,
        billing_address_id: body.billing_address_id,
        shipping_address_id: body.shipping_address_id,
        place_of_supply: body.place_of_supply,
        is_reverse_charge: body.is_reverse_charge,
        currency_code: body.currency_code,
        exchange_rate: body.exchange_rate,
        tcs_rate: body.tcs_rate,
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
          discount_amount: l.discount_amount ? parseFloat(l.discount_amount) : 0,
          hsn_code: l.hsn_code,
          sales_order_line_id: l.sales_order_line_id,
          warehouse_id: l.warehouse_id,
          batch_id: l.batch_id,
        })),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: invoice });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /sales-invoices/from-sales-order/:salesOrderId
  // Create invoice from SO (full or partial)
  // ──────────────────────────────────────────────────────────
  server.post('/sales-invoices/from-sales-order/:salesOrderId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { salesOrderId } = request.params as { salesOrderId: string };
      const body = (request.body as any) || {};
      const user = request.user!;

      const invoice = await salesInvoiceService.createFromSalesOrder(
        salesOrderId,
        user.companyId,
        user.userId,
        {
          invoice_date: body.invoice_date,
          due_date: body.due_date,
          tcs_rate: body.tcs_rate,
          internal_notes: body.internal_notes,
          partial_lines: body.partial_lines,
        }
      );

      return reply.code(201).send({
        success: true,
        message: 'Invoice created from sales order',
        data: invoice,
      });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /sales-invoices — List invoices (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/sales-invoices', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      customer_id, branch_id, sales_order_id,
      from_date, to_date, overdue_only,
      sort_by, sort_order,
    } = request.query as any;

    const result = await salesInvoiceService.listInvoices({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      customer_id,
      branch_id: branch_id || undefined,
      sales_order_id,
      from_date,
      to_date,
      overdue_only: overdue_only === 'true',
      sortBy: sort_by || 'invoice_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /sales-invoices/:id — Get invoice with full details
  // ──────────────────────────────────────────────────────────
  server.get('/sales-invoices/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = await salesInvoiceService.getInvoiceWithDetails(id, request.user!.companyId);

    if (!invoice) {
      return reply.code(404).send({ success: false, error: 'Invoice not found' });
    }

    return { success: true, data: invoice };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /sales-invoices/:id — Update invoice (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/sales-invoices/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

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
      const updated = await salesInvoiceService.updateInvoice(id, user.companyId, {
        ...body,
        lines: body.lines?.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          product_id: l.product_id,
          description: l.description,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          unit_price: parseFloat(l.unit_price),
          discount_amount: l.discount_amount ? parseFloat(l.discount_amount) : 0,
          hsn_code: l.hsn_code,
          sales_order_line_id: l.sales_order_line_id,
          warehouse_id: l.warehouse_id,
          batch_id: l.batch_id,
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
  // DELETE /sales-invoices/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/sales-invoices/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await salesInvoiceService.deleteInvoice(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Invoice deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // PATCH /sales-invoices/:id/status — Status transitions
  // Body: { status: 'approved' | 'sent' | 'cancelled' }
  // ──────────────────────────────────────────────────────────
  server.patch('/sales-invoices/:id/status', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };

      if (!status) {
        return reply.code(400).send({ success: false, error: 'status is required' });
      }

      const validStatuses = ['approved', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid target status. Allowed: ${validStatuses.join(', ')}`,
        });
      }

      const updated = await salesInvoiceService.updateStatus(
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
  // PATCH /sales-invoices/:id/e-invoice — Set e-invoice IRN
  // ──────────────────────────────────────────────────────────
  server.patch('/sales-invoices/:id/e-invoice', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { irn } = request.body as { irn: string };

      if (!irn) {
        return reply.code(400).send({ success: false, error: 'irn is required' });
      }

      const updated = await salesInvoiceService.setEInvoiceIrn(
        id,
        request.user!.companyId,
        irn,
        request.user!.userId
      );

      return { success: true, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /sales-invoices/mark-overdue — Batch mark overdue
  // ──────────────────────────────────────────────────────────
  server.post('/sales-invoices/mark-overdue', { preHandler: [authenticate] }, async (request) => {
    const result = await salesInvoiceService.markOverdueInvoices(request.user!.companyId);
    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /sales-invoices/outstanding/:customerId
  // Customer outstanding summary
  // ──────────────────────────────────────────────────────────
  server.get('/sales-invoices/outstanding/:customerId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { customerId } = request.params as { customerId: string };
      const outstanding = await salesInvoiceService.getCustomerOutstanding(
        customerId,
        request.user!.companyId
      );
      return { success: true, data: outstanding };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
}