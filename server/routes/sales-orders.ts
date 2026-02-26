// =============================================================
// File: server/routes/sales-orders.ts
// Module: Sales Management — Phase 5, Step 16
// Description: REST API routes for Sales Orders.
//              Endpoints: create, list, get, update, delete,
//              confirm (with stock reservation), status change,
//              create from quotation.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { salesOrderService } from '../services/sales-order.service';

export async function salesOrderRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /sales-orders — Create standalone sales order
  // ──────────────────────────────────────────────────────────
  server.post('/sales-orders', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
      if (!body.order_date) {
        return reply.code(400).send({ success: false, error: 'order_date is required' });
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
        if (line.discount_type && !['percentage', 'fixed'].includes(line.discount_type)) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: discount_type must be 'percentage' or 'fixed'` });
        }
        if (line.discount_type === 'percentage' && line.discount_value > 100) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: discount percentage cannot exceed 100%` });
        }
      }

      const user = request.user!;
      const salesOrder = await salesOrderService.createSalesOrder({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        order_date: body.order_date,
        expected_delivery_date: body.expected_delivery_date,
        customer_id: body.customer_id,
        contact_person_id: body.contact_person_id,
        billing_address_id: body.billing_address_id,
        shipping_address_id: body.shipping_address_id,
        quotation_id: body.quotation_id,
        customer_po_number: body.customer_po_number,
        currency_code: body.currency_code,
        exchange_rate: body.exchange_rate,
        payment_terms_days: body.payment_terms_days,
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
          warehouse_id: l.warehouse_id,
        })),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: salesOrder });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /sales-orders/from-quotation/:quotationId
  // Convert accepted quotation → Sales Order
  // ──────────────────────────────────────────────────────────
  server.post('/sales-orders/from-quotation/:quotationId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { quotationId } = request.params as { quotationId: string };
      const body = request.body as any || {};
      const user = request.user!;

      const salesOrder = await salesOrderService.createFromQuotation(
        quotationId,
        user.companyId,
        user.userId,
        {
          branch_id: body.branch_id,
          order_date: body.order_date,
          expected_delivery_date: body.expected_delivery_date,
          customer_po_number: body.customer_po_number,
          payment_terms_days: body.payment_terms_days,
          internal_notes: body.internal_notes,
          line_warehouse_ids: body.line_warehouse_ids,
        }
      );

      return reply.code(201).send({
        success: true,
        message: 'Sales order created from quotation',
        data: salesOrder,
      });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /sales-orders — List sales orders (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/sales-orders', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      customer_id, branch_id,
      from_date, to_date, quotation_id,
      sort_by, sort_order,
    } = request.query as any;

    const result = await salesOrderService.listSalesOrders({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      customer_id,
      branch_id: branch_id || undefined,
      from_date,
      to_date,
      quotation_id,
      sortBy: sort_by || 'order_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /sales-orders/:id — Get SO with full details
  // ──────────────────────────────────────────────────────────
  server.get('/sales-orders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const salesOrder = await salesOrderService.getSalesOrderWithDetails(id, request.user!.companyId);

    if (!salesOrder) {
      return reply.code(404).send({ success: false, error: 'Sales order not found' });
    }

    return { success: true, data: salesOrder };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /sales-orders/:id — Update SO (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/sales-orders/:id', { preHandler: [authenticate] }, async (request, reply) => {
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
      const updated = await salesOrderService.updateSalesOrder(id, user.companyId, {
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
          warehouse_id: l.warehouse_id,
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
  // DELETE /sales-orders/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/sales-orders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await salesOrderService.deleteSalesOrder(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Sales order deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /sales-orders/:id/confirm — Confirm + stock reservation
  // ──────────────────────────────────────────────────────────
  server.post('/sales-orders/:id/confirm', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const result = await salesOrderService.confirmSalesOrder(
        id,
        request.user!.companyId,
        request.user!.userId
      );

      const { auto_work_orders, ...confirmed } = result;

      const workOrderSummary = auto_work_orders ? {
        created_count: auto_work_orders.created.length,
        skipped_count: auto_work_orders.skipped.length,
        error_count: auto_work_orders.errors.length,
        work_orders: auto_work_orders.created,
        errors: auto_work_orders.errors.length > 0 ? auto_work_orders.errors : undefined,
      } : undefined;

      const woMsg = workOrderSummary?.created_count
        ? ` ${workOrderSummary.created_count} work order(s) auto-created.`
        : '';

      return {
        success: true,
        message: `Sales order confirmed. Stock reservations created.${woMsg}`,
        data: confirmed,
        work_orders: workOrderSummary,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // PATCH /sales-orders/:id/status — General status transitions
  // Body: { status: 'cancelled' | 'closed' | ... }
  // Note: 'confirmed' is NOT allowed here — use POST /confirm
  // ──────────────────────────────────────────────────────────
  server.patch('/sales-orders/:id/status', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };

      if (!status) {
        return reply.code(400).send({ success: false, error: 'status is required' });
      }

      // Confirmation is a separate endpoint with stock reservation logic
      if (status === 'confirmed') {
        return reply.code(400).send({
          success: false,
          error: 'Use POST /sales-orders/:id/confirm to confirm an order (creates stock reservations)',
        });
      }

      const validStatuses = ['partially_delivered', 'delivered', 'invoiced', 'closed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return reply.code(400).send({
          success: false,
          error: `Invalid target status. Allowed: ${validStatuses.join(', ')}`,
        });
      }

      const updated = await salesOrderService.updateStatus(
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
}