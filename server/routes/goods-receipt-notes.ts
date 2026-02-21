// =============================================================
// File: server/routes/goods-receipt-notes.ts
// Module: Purchase Management
// Description: REST API routes for Goods Receipt Notes (GRN).
//              Endpoints: create, list, get, update, delete,
//              confirm, cancel, pending PO lines.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { goodsReceiptNoteService } from '../services/goods-receipt-note.service';

export async function goodsReceiptNoteRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /goods-receipt-notes — Create a new GRN
  // ──────────────────────────────────────────────────────────
  server.post('/goods-receipt-notes', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
      if (!body.grn_date) {
        return reply.code(400).send({ success: false, error: 'grn_date is required' });
      }
      if (!body.vendor_id) {
        return reply.code(400).send({ success: false, error: 'vendor_id is required' });
      }
      if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        return reply.code(400).send({ success: false, error: 'At least one line item is required' });
      }

      for (let i = 0; i < body.lines.length; i++) {
        const line = body.lines[i];
        if (!line.item_id) {
          return reply.code(400).send({ success: false, error: `Line ${i + 1}: item_id is required` });
        }
      }

      const user = request.user!;

      // Build metadata from top-level frontend fields
      const metadata: Record<string, any> = body.metadata || {};
      if (body.vehicle_number) metadata.vehicle_number = body.vehicle_number;
      if (body.inspection_status) metadata.inspection_status = body.inspection_status;

      const grn = await goodsReceiptNoteService.createGRN({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        grn_date: body.grn_date,
        vendor_id: body.vendor_id,
        purchase_order_id: body.purchase_order_id,
        warehouse_id: body.warehouse_id,
        vendor_challan_no: body.vendor_challan_no || body.vendor_challan_number,
        vendor_challan_date: body.vendor_challan_date,
        vehicle_number: body.vehicle_number,
        inspection_status: body.inspection_status,
        remarks: body.remarks || body.internal_notes,
        metadata,
        lines: body.lines.map((l: any, idx: number) => {
          // Build per-line metadata
          const lineMetadata: Record<string, any> = l.metadata || {};
          if (l.batch_number) lineMetadata.batch_number = l.batch_number;
          if (l.expiry_date) lineMetadata.expiry_date = l.expiry_date;
          if (l.rejection_reason) lineMetadata.rejection_reason = l.rejection_reason;

          return {
            line_number: l.line_number || idx + 1,
            item_id: l.item_id,
            po_line_id: l.po_line_id,
            quantity_ordered: l.ordered_quantity !== undefined ? parseFloat(l.ordered_quantity) : (l.quantity_ordered !== undefined ? parseFloat(l.quantity_ordered) : undefined),
            quantity_received: l.received_quantity !== undefined ? parseFloat(l.received_quantity) : (l.quantity_received !== undefined ? parseFloat(l.quantity_received) : undefined),
            quantity_accepted: l.accepted_quantity !== undefined ? parseFloat(l.accepted_quantity) : (l.quantity_accepted !== undefined ? parseFloat(l.quantity_accepted) : undefined),
            quantity_rejected: l.rejected_quantity !== undefined ? parseFloat(l.rejected_quantity) : (l.quantity_rejected !== undefined ? parseFloat(l.quantity_rejected) : undefined),
            uom_id: l.uom_id,
            unit_cost: l.unit_cost !== undefined ? parseFloat(l.unit_cost) : undefined,
            batch_id: l.batch_id,
            serial_numbers: l.serial_numbers,
            remarks: l.remarks,
            metadata: Object.keys(lineMetadata).length > 0 ? lineMetadata : undefined,
          };
        }),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: grn });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /goods-receipt-notes — List GRNs (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/goods-receipt-notes', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      vendor_id, purchase_order_id, warehouse_id,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await goodsReceiptNoteService.listGRNs({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      vendor_id,
      purchase_order_id,
      warehouse_id,
      from_date,
      to_date,
      sortBy: sort_by || 'grn_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /goods-receipt-notes/pending/:poId — Get pending PO lines
  // NOTE: Must be registered BEFORE /:id to avoid route conflict
  // ──────────────────────────────────────────────────────────
  server.get('/goods-receipt-notes/pending/:poId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { poId } = request.params as { poId: string };
      const pendingLines = await goodsReceiptNoteService.getPendingPOLines(poId, request.user!.companyId);
      return { success: true, data: pendingLines };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /goods-receipt-notes/:id — Get GRN with full details
  // ──────────────────────────────────────────────────────────
  server.get('/goods-receipt-notes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const grn = await goodsReceiptNoteService.getGRNWithDetails(id, request.user!.companyId);

    if (!grn) {
      return reply.code(404).send({ success: false, error: 'Goods receipt note not found' });
    }

    return { success: true, data: grn };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /goods-receipt-notes/:id — Update GRN (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/goods-receipt-notes/:id', { preHandler: [authenticate] }, async (request, reply) => {
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
        }
      }

      const user = request.user!;

      // Build metadata from top-level frontend fields
      const metadata: Record<string, any> = body.metadata || {};
      if (body.vehicle_number) metadata.vehicle_number = body.vehicle_number;
      if (body.inspection_status) metadata.inspection_status = body.inspection_status;

      const updated = await goodsReceiptNoteService.updateGRN(id, user.companyId, {
        ...body,
        vendor_challan_no: body.vendor_challan_no || body.vendor_challan_number,
        metadata: Object.keys(metadata).length > 0 ? metadata : body.metadata,
        lines: body.lines?.map((l: any, idx: number) => {
          const lineMetadata: Record<string, any> = l.metadata || {};
          if (l.batch_number) lineMetadata.batch_number = l.batch_number;
          if (l.expiry_date) lineMetadata.expiry_date = l.expiry_date;
          if (l.rejection_reason) lineMetadata.rejection_reason = l.rejection_reason;

          return {
            line_number: l.line_number || idx + 1,
            item_id: l.item_id,
            po_line_id: l.po_line_id,
            quantity_ordered: l.ordered_quantity !== undefined ? parseFloat(l.ordered_quantity) : (l.quantity_ordered !== undefined ? parseFloat(l.quantity_ordered) : undefined),
            quantity_received: l.received_quantity !== undefined ? parseFloat(l.received_quantity) : (l.quantity_received !== undefined ? parseFloat(l.quantity_received) : undefined),
            quantity_accepted: l.accepted_quantity !== undefined ? parseFloat(l.accepted_quantity) : (l.quantity_accepted !== undefined ? parseFloat(l.quantity_accepted) : undefined),
            quantity_rejected: l.rejected_quantity !== undefined ? parseFloat(l.rejected_quantity) : (l.quantity_rejected !== undefined ? parseFloat(l.quantity_rejected) : undefined),
            uom_id: l.uom_id,
            unit_cost: l.unit_cost !== undefined ? parseFloat(l.unit_cost) : undefined,
            batch_id: l.batch_id,
            serial_numbers: l.serial_numbers,
            remarks: l.remarks,
            metadata: Object.keys(lineMetadata).length > 0 ? lineMetadata : undefined,
          };
        }),
        updated_by: user.userId,
      });

      return { success: true, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // DELETE /goods-receipt-notes/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/goods-receipt-notes/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await goodsReceiptNoteService.deleteGRN(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Goods receipt note deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /goods-receipt-notes/:id/confirm — Confirm GRN
  // ──────────────────────────────────────────────────────────
  server.post('/goods-receipt-notes/:id/confirm', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const confirmed = await goodsReceiptNoteService.confirmGRN(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Goods receipt note confirmed',
        data: confirmed,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /goods-receipt-notes/:id/cancel — Cancel GRN
  // ──────────────────────────────────────────────────────────
  server.post('/goods-receipt-notes/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await goodsReceiptNoteService.cancelGRN(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Goods receipt note cancelled',
        data: cancelled,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
}
