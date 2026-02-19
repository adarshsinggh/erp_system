// =============================================================
// File: server/routes/delivery-challans.ts
// Module: Sales Management — Phase 5, Step 17
// Description: REST API routes for Delivery Challans.
//              Endpoints: create, list, get, update, delete,
//              dispatch (stock deduction + SO update), mark
//              delivered, cancel, pending deliveries for SO.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { deliveryChallanService } from '../services/delivery-challan.service';

export async function deliveryChallanRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /delivery-challans — Create new delivery challan
  // ──────────────────────────────────────────────────────────
  server.post('/delivery-challans', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
      if (!body.challan_date) {
        return reply.code(400).send({ success: false, error: 'challan_date is required' });
      }
      if (!body.customer_id) {
        return reply.code(400).send({ success: false, error: 'customer_id is required' });
      }
      if (!body.warehouse_id) {
        return reply.code(400).send({ success: false, error: 'warehouse_id is required' });
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
      }

      const user = request.user!;
      const challan = await deliveryChallanService.createChallan({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        challan_date: body.challan_date,
        customer_id: body.customer_id,
        sales_order_id: body.sales_order_id,
        shipping_address_id: body.shipping_address_id,
        warehouse_id: body.warehouse_id,
        transporter_name: body.transporter_name,
        vehicle_number: body.vehicle_number,
        lr_number: body.lr_number,
        e_way_bill_number: body.e_way_bill_number,
        metadata: body.metadata,
        lines: body.lines.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          product_id: l.product_id,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          sales_order_line_id: l.sales_order_line_id,
          batch_id: l.batch_id,
          serial_numbers: l.serial_numbers,
          remarks: l.remarks,
        })),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: challan });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /delivery-challans — List challans (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/delivery-challans', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      customer_id, branch_id, sales_order_id, warehouse_id,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await deliveryChallanService.listChallans({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      customer_id,
      branch_id: branch_id || undefined,
      sales_order_id,
      warehouse_id,
      from_date,
      to_date,
      sortBy: sort_by || 'challan_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /delivery-challans/:id — Get challan with full details
  // ──────────────────────────────────────────────────────────
  server.get('/delivery-challans/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const challan = await deliveryChallanService.getChallanWithDetails(id, request.user!.companyId);

    if (!challan) {
      return reply.code(404).send({ success: false, error: 'Delivery challan not found' });
    }

    return { success: true, data: challan };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /delivery-challans/:id — Update challan (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/delivery-challans/:id', { preHandler: [authenticate] }, async (request, reply) => {
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
        }
      }

      const user = request.user!;
      const updated = await deliveryChallanService.updateChallan(id, user.companyId, {
        ...body,
        lines: body.lines?.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          product_id: l.product_id,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          sales_order_line_id: l.sales_order_line_id,
          batch_id: l.batch_id,
          serial_numbers: l.serial_numbers,
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
  // DELETE /delivery-challans/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/delivery-challans/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await deliveryChallanService.deleteChallan(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Delivery challan deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /delivery-challans/:id/dispatch — Dispatch challan
  // (deducts stock, updates SO, fulfills reservations)
  // ──────────────────────────────────────────────────────────
  server.post('/delivery-challans/:id/dispatch', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const dispatched = await deliveryChallanService.dispatchChallan(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Challan dispatched. Stock deducted and SO updated.',
        data: dispatched,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /delivery-challans/:id/delivered — Mark as delivered
  // ──────────────────────────────────────────────────────────
  server.post('/delivery-challans/:id/delivered', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const delivered = await deliveryChallanService.markDelivered(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, data: delivered };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /delivery-challans/:id/cancel — Cancel challan (draft only)
  // ──────────────────────────────────────────────────────────
  server.post('/delivery-challans/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await deliveryChallanService.cancelChallan(
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
  // GET /delivery-challans/pending/:salesOrderId
  // Shows remaining deliverable qty per SO line
  // ──────────────────────────────────────────────────────────
  server.get('/delivery-challans/pending/:salesOrderId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { salesOrderId } = request.params as { salesOrderId: string };
      const pending = await deliveryChallanService.getPendingDeliveries(
        salesOrderId,
        request.user!.companyId
      );
      return { success: true, data: pending };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
}