// =============================================================
// File: server/routes/vendor-bills.ts
// Module: Purchase Management
// Description: REST API routes for Vendor Bills.
//              Endpoints: create, list, get, update, delete,
//              approve, cancel, vendor outstanding.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { vendorBillService } from '../services/vendor-bill.service';

export async function vendorBillRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /vendor-bills — Create vendor bill
  // ──────────────────────────────────────────────────────────
  server.post('/vendor-bills', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      // Validation
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

      // Map frontend fields to service fields
      const billDate = body.vendor_bill_date || body.bill_date || new Date().toISOString().split('T')[0];

      const metadata = {
        ...body.metadata,
        received_date: body.received_date,
        place_of_supply: body.place_of_supply,
        tds_applicable: body.tds_applicable,
        tds_section: body.tds_section,
      };

      const vendorBill = await vendorBillService.createVendorBill({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        vendor_id: body.vendor_id,
        vendor_bill_number: body.vendor_bill_number || body.vendor_invoice_number,
        vendor_bill_date: billDate,
        received_date: body.received_date,
        due_date: body.due_date,
        purchase_order_id: body.purchase_order_id || undefined,
        grn_id: body.grn_id || undefined,
        place_of_supply: body.place_of_supply,
        currency_code: body.currency_code,
        tds_applicable: body.tds_applicable,
        tds_section: body.tds_section,
        tds_rate: body.tds_rate,
        internal_notes: body.internal_notes,
        metadata,
        lines: body.lines.map((l: any, idx: number) => ({
          line_number: l.line_number || idx + 1,
          item_id: l.item_id,
          description: l.description,
          quantity: parseFloat(l.quantity),
          uom_id: l.uom_id,
          unit_price: parseFloat(l.unit_price),
          discount_amount: l.discount_amount ? parseFloat(l.discount_amount) : undefined,
          hsn_code: l.hsn_code,
          grn_line_id: l.grn_line_id,
        })),
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: vendorBill });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /vendor-bills — List vendor bills (paginated)
  // ──────────────────────────────────────────────────────────
  server.get('/vendor-bills', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search, status,
      vendor_id, purchase_order_id,
      overdue_only,
      from_date, to_date,
      sort_by, sort_order,
    } = request.query as any;

    const result = await vendorBillService.listVendorBills({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      status,
      vendor_id,
      purchase_order_id,
      overdue_only: overdue_only === 'true' || overdue_only === true,
      from_date,
      to_date,
      sortBy: sort_by || 'bill_date',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /vendor-bills/outstanding/:vendorId — Get vendor outstanding
  // (registered before /:id to avoid route conflict)
  // ──────────────────────────────────────────────────────────
  server.get('/vendor-bills/outstanding/:vendorId', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { vendorId } = request.params as { vendorId: string };
      const outstanding = await vendorBillService.getVendorOutstanding(
        vendorId,
        request.user!.companyId
      );
      return { success: true, data: outstanding };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /vendor-bills/:id — Get vendor bill with full details
  // ──────────────────────────────────────────────────────────
  server.get('/vendor-bills/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const vendorBill = await vendorBillService.getVendorBillWithDetails(id, request.user!.companyId);

    if (!vendorBill) {
      return reply.code(404).send({ success: false, error: 'Vendor bill not found' });
    }

    return { success: true, data: vendorBill };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /vendor-bills/:id — Update vendor bill (draft only)
  // ──────────────────────────────────────────────────────────
  server.put('/vendor-bills/:id', { preHandler: [authenticate] }, async (request, reply) => {
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
      const updated = await vendorBillService.updateVendorBill(id, user.companyId, {
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
          grn_line_id: l.grn_line_id,
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
  // DELETE /vendor-bills/:id — Soft delete (draft only)
  // ──────────────────────────────────────────────────────────
  server.delete('/vendor-bills/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await vendorBillService.deleteVendorBill(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return { success: true, message: 'Vendor bill deleted', data: deleted };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /vendor-bills/:id/approve — Approve (draft → approved)
  // ──────────────────────────────────────────────────────────
  server.post('/vendor-bills/:id/approve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const approved = await vendorBillService.approveVendorBill(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Vendor bill approved',
        data: approved,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // POST /vendor-bills/:id/cancel — Cancel vendor bill
  // ──────────────────────────────────────────────────────────
  server.post('/vendor-bills/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await vendorBillService.cancelVendorBill(
        id,
        request.user!.companyId,
        request.user!.userId
      );
      return {
        success: true,
        message: 'Vendor bill cancelled',
        data: cancelled,
      };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });
}
