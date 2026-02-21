// =============================================================
// File: server/routes/purchase-orders.ts
// Module: Purchase Management
// Description: REST API routes for Purchase Orders.
//              Endpoints: create, list, get, update, delete,
//              approve, send, cancel, close,
//              create from requisition.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { purchaseOrderService } from '../services/purchase-order.service';

export async function purchaseOrderRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /purchase-orders — Create standalone purchase order
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-orders', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
      if (!body.vendor_id) {
        return reply.code(400).send({ success: false, error: 'vendor_id is required' });
      }
      if (!body.po_date) {
        return reply.code(400).send({ success: false, error: 'po_date is required' });
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
        if (line.unit_price === undefined || line.unit_price === null || line.unit_price < 0) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: unit_price is required and must be >= 0` });
        }
      }

      const user = request.user!;
      const purchaseOrder = await purchaseOrderService.createPurchaseOrder({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        po_date: body.po_date,
        expected_delivery_date: body.expected_delivery_date,
        vendor_id: body.vendor_id,
        requisition_id: body.requisition_id,
        vendor_quotation_ref: body.vendor_quotation_ref,
        currency_code: body.currency_code,
        exchange_rate: body.exchange_rate,
        payment_terms_days: body.payment_terms_days,
        terms_and_conditions: body.terms_and_conditions,
        internal_notes: body.internal_notes,
        delivery_warehouse_id: body.delivery_warehouse_id,
        metadata: body.metadata,
        lines: body.lines.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          item_id: l.item_id,
          description: l.description,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          unit_price: parseFloat(l.unit_price),
          discount_amount: l.discount_amount ? parseFloat(l.discount_amount) : undefined,
          hsn_code: l.hsn_code,
          warehouse_id: l.warehouse_id,
        })),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: purchaseOrder });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /purchase-orders/from-requisition — Create PO from
  // an approved purchase requisition
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-orders/from-requisition', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      if (!body.requisition_id) {
        return reply.code(400).send({ success: false, error: 'requisition_id is required' });
      }

      const user = request.user!;

      const purchaseOrder = await purchaseOrderService.createFromRequisition(
        body.requisition_id,
        user.companyId,
        user.userId,
        {
          branch_id: body.branch_id,
          vendor_id: body.vendor_id,
          po_date: body.po_date,
          expected_delivery_date: body.expected_delivery_date,
          vendor_quotation_ref: body.vendor_quotation_ref,
          payment_terms_days: body.payment_terms_days,
          delivery_warehouse_id: body.delivery_warehouse_id,
          internal_notes: body.internal_notes,
          line_overrides: body.line_overrides,
        }
      );

      return reply.code(201).send({
        success: true,
        message: 'Purchase order created from requisition',
        data: purchaseOrder,
      });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /purchase-orders — List purchase orders (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/purchase-orders', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      vendor_id, branch_id,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await purchaseOrderService.listPurchaseOrders({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      vendor_id,
      branch_id: branch_id || undefined,
      from_date,
      to_date,
      sortBy: sort_by || 'po_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /purchase-orders/:id — Get PO with full details
  // ──────────────────────────────────────────────────────────
  server.get('/purchase-orders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const purchaseOrder = await purchaseOrderService.getPurchaseOrderWithDetails(id, request.user!.companyId);

    if (!purchaseOrder) {
      return reply.code(404).send({ success: false, error: 'Purchase order not found' });
    }

    return { success: true, data: purchaseOrder };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /purchase-orders/:id — Update PO (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/purchase-orders/:id', { preHandler: [authenticate] }, async (request, reply) => {
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
          if (line.unit_price === undefined || line.unit_price === null || line.unit_price < 0) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: unit_price is required and must be >= 0` });
          }
        }
      }

      const user = request.user!;
      const updated = await purchaseOrderService.updatePurchaseOrder(id, user.companyId, {
        ...body,
        lines: body.lines?.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          item_id: l.item_id,
          description: l.description,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          unit_price: parseFloat(l.unit_price),
          discount_amount: l.discount_amount ? parseFloat(l.discount_amount) : undefined,
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
  // DELETE /purchase-orders/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/purchase-orders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await purchaseOrderService.deletePurchaseOrder(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Purchase order deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /purchase-orders/:id/approve — Approve (draft → approved)
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-orders/:id/approve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const approved = await purchaseOrderService.approvePurchaseOrder(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Purchase order approved',
        data: approved,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /purchase-orders/:id/send — Send to vendor (approved → sent)
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-orders/:id/send', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const sent = await purchaseOrderService.sendPurchaseOrder(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Purchase order sent to vendor',
        data: sent,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /purchase-orders/:id/cancel — Cancel PO
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-orders/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await purchaseOrderService.cancelPurchaseOrder(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Purchase order cancelled',
        data: cancelled,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /purchase-orders/:id/close — Close PO
  // ──────────────────────────────────────────────────────────
  server.post('/purchase-orders/:id/close', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const closed = await purchaseOrderService.closePurchaseOrder(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Purchase order closed',
        data: closed,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
}
