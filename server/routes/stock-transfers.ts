// =============================================================
// File: server/routes/stock-transfers.ts
// Module: Inventory Management — Phase 7, Step 29
// Description: REST API routes for Stock Transfers.
//              Endpoints: create, list, get, update, delete,
//              approve, dispatch (deducts source stock),
//              receive (adds destination stock, partial support),
//              cancel (reverses if in-transit).
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { stockTransferService } from '../services/stock-transfer.service';

export async function stockTransferRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /inventory/stock-transfers — Create transfer
  // ──────────────────────────────────────────────────────────
  server.post('/inventory/stock-transfers', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
      if (!body.transfer_date) {
        return reply.code(400).send({ success: false, error: 'transfer_date is required' });
      }
      if (!body.from_branch_id) {
        return reply.code(400).send({ success: false, error: 'from_branch_id is required' });
      }
      if (!body.from_warehouse_id) {
        return reply.code(400).send({ success: false, error: 'from_warehouse_id is required' });
      }
      if (!body.to_branch_id) {
        return reply.code(400).send({ success: false, error: 'to_branch_id is required' });
      }
      if (!body.to_warehouse_id) {
        return reply.code(400).send({ success: false, error: 'to_warehouse_id is required' });
      }
      if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        return reply.code(400).send({ success: false, error: 'At least one line item is required' });
      }

      // Validate lines
      for (let i = 0; i < body.lines.length; i++) {
        const line = body.lines[i];
        if (!line.item_id && !line.product_id) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: Either item_id or product_id is required` });
        }
        if (!line.quantity || line.quantity <= 0) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: quantity must be > 0` });
        }
        if (!line.uom_id) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: uom_id is required` });
        }
      }

      if (body.transfer_type && !['inter_warehouse', 'inter_branch'].includes(body.transfer_type)) {
        return reply.code(400).send({ success: false, error: "transfer_type must be 'inter_warehouse' or 'inter_branch'" });
      }

      const user = request.user!;
      const transfer = await stockTransferService.createTransfer({
        company_id: user.companyId,
        transfer_date: body.transfer_date,
        from_branch_id: body.from_branch_id,
        from_warehouse_id: body.from_warehouse_id,
        to_branch_id: body.to_branch_id,
        to_warehouse_id: body.to_warehouse_id,
        transfer_type: body.transfer_type,
        reason: body.reason,
        metadata: body.metadata,
        lines: body.lines.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          item_id: l.item_id,
          product_id: l.product_id,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          batch_id: l.batch_id,
          unit_cost: l.unit_cost ? parseFloat(l.unit_cost) : undefined,
          remarks: l.remarks,
        })),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: transfer });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/stock-transfers — List transfers (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/stock-transfers', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      from_branch_id, to_branch_id,
      from_warehouse_id, to_warehouse_id,
      transfer_type, from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await stockTransferService.listTransfers({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      from_branch_id,
      to_branch_id,
      from_warehouse_id,
      to_warehouse_id,
      transfer_type,
      from_date,
      to_date,
      sortBy: sort_by || 'transfer_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/stock-transfers/:id — Get with full details
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/stock-transfers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const transfer = await stockTransferService.getTransferWithDetails(id, request.user!.companyId);

    if (!transfer) {
      return reply.code(404).send({ success: false, error: 'Stock transfer not found' });
    }

    return { success: true, data: transfer };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /inventory/stock-transfers/:id — Update (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/inventory/stock-transfers/:id', { preHandler: [authenticate] }, async (request, reply) => {
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
          if (!line.item_id && !line.product_id) {
            return reply.code(400).send({ success: false, error: `Line ${i + 1}: Either item_id or product_id is required` });
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
      const updated = await stockTransferService.updateTransfer(id, user.companyId, {
        ...body,
        lines: body.lines?.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          item_id: l.item_id,
          product_id: l.product_id,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          batch_id: l.batch_id,
          unit_cost: l.unit_cost ? parseFloat(l.unit_cost) : undefined,
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
  // DELETE /inventory/stock-transfers/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/inventory/stock-transfers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await stockTransferService.deleteTransfer(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Stock transfer deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /inventory/stock-transfers/:id/approve
  // Approve transfer (draft → approved)
  // ──────────────────────────────────────────────────────────
  server.post('/inventory/stock-transfers/:id/approve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const approved = await stockTransferService.approveTransfer(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Stock transfer approved', data: approved };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /inventory/stock-transfers/:id/dispatch
  // Dispatch transfer (approved → in_transit)
  // Deducts stock from source warehouse via stock ledger engine.
  // ──────────────────────────────────────────────────────────
  server.post('/inventory/stock-transfers/:id/dispatch', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const dispatched = await stockTransferService.dispatchTransfer(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Stock transfer dispatched. Stock deducted from source warehouse.',
        data: dispatched,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('Insufficient') ? 409 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /inventory/stock-transfers/:id/receive
  // Receive transfer (in_transit → received or partial)
  // Adds stock to destination warehouse.
  //
  // Body (optional for full receive):
  //   { lines: [{ line_id, received_quantity, remarks? }] }
  // If body is empty or no lines, all pending quantities are received.
  // ──────────────────────────────────────────────────────────
  server.post('/inventory/stock-transfers/:id/receive', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any || {};

      // Validate receive lines if provided
      let receiveLines: { line_id: string; received_quantity: number; remarks?: string }[] | undefined;
      if (body.lines && Array.isArray(body.lines) && body.lines.length > 0) {
        for (let i = 0; i < body.lines.length; i++) {
          const rl = body.lines[i];
          if (!rl.line_id) {
            return reply.code(400).send({ success: false, error: `Receive line ${i + 1}: line_id is required` });
          }
          if (!rl.received_quantity || rl.received_quantity <= 0) {
            return reply.code(400).send({ success: false, error: `Receive line ${i + 1}: received_quantity must be > 0` });
          }
        }
        receiveLines = body.lines.map((rl: any) => ({
          line_id: rl.line_id,
          received_quantity: parseFloat(rl.received_quantity),
          remarks: rl.remarks,
        }));
      }

      const result = await stockTransferService.receiveTransfer(
        id,
        request.user!.companyId,
        request.user!.userId,
        receiveLines
      );

      return {
        success: true,
        message: result.fully_received
          ? 'Stock transfer fully received. Stock added to destination warehouse.'
          : 'Partial receive recorded. Transfer remains in transit.',
        data: result,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // PATCH /inventory/stock-transfers/:id/cancel
  // Cancel transfer. If in_transit, reverses stock back to source.
  // ──────────────────────────────────────────────────────────
  server.patch('/inventory/stock-transfers/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await stockTransferService.cancelTransfer(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Stock transfer cancelled',
        data: cancelled,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
}