// =============================================================
// File: server/routes/manufacturing.ts
// Module: Manufacturing — Phase 8, Steps 32–35
// Description: REST API routes for Work Orders, Material Issue
//              & Consumption, Production Entries, Scrap Entries.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { workOrderService } from '../services/work-order.service';
import { productionEntryService } from '../services/production-entry.service';
import { scrapEntryService } from '../services/scrap-entry.service';

const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const VALID_SCRAP_REASONS = ['defective', 'damaged', 'expired', 'process_waste'];
const VALID_DISPOSAL_METHODS = ['sell', 'recycle', 'discard'];

export async function manufacturingRoutes(server: FastifyInstance) {

  // ============================================================
  // WORK ORDERS (Step 32)
  // ============================================================

  // POST /manufacturing/work-orders
  server.post('/manufacturing/work-orders', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      const user = request.user!;

      if (!body.work_order_date) return reply.code(400).send({ success: false, error: 'work_order_date is required' });
      if (!body.product_id) return reply.code(400).send({ success: false, error: 'product_id is required' });
      if (!body.bom_header_id) return reply.code(400).send({ success: false, error: 'bom_header_id is required' });
      if (!body.planned_quantity || body.planned_quantity <= 0) return reply.code(400).send({ success: false, error: 'planned_quantity must be > 0' });
      if (!body.uom_id) return reply.code(400).send({ success: false, error: 'uom_id is required' });
      if (!body.source_warehouse_id) return reply.code(400).send({ success: false, error: 'source_warehouse_id is required' });
      if (!body.target_warehouse_id) return reply.code(400).send({ success: false, error: 'target_warehouse_id is required' });
      if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
        return reply.code(400).send({ success: false, error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` });
      }

      const wo = await workOrderService.createWorkOrder({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        work_order_date: body.work_order_date,
        product_id: body.product_id,
        bom_header_id: body.bom_header_id,
        planned_quantity: parseFloat(body.planned_quantity),
        uom_id: body.uom_id,
        planned_start_date: body.planned_start_date,
        planned_end_date: body.planned_end_date,
        source_warehouse_id: body.source_warehouse_id,
        target_warehouse_id: body.target_warehouse_id,
        sales_order_id: body.sales_order_id,
        priority: body.priority,
        internal_notes: body.internal_notes,
        metadata: body.metadata,
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: wo });
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // GET /manufacturing/work-orders
  server.get('/manufacturing/work-orders', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const q = request.query as any;
      return { success: true, ...await workOrderService.listWorkOrders({
        companyId: request.user!.companyId,
        page: parseInt(q.page) || 1, limit: parseInt(q.limit) || 50,
        search: q.search, status: q.status, branch_id: q.branch_id, product_id: q.product_id,
        priority: q.priority, from_date: q.from_date, to_date: q.to_date, sales_order_id: q.sales_order_id,
        sortBy: q.sort_by || 'work_order_date', sortOrder: q.sort_order || 'desc',
      })};
    } catch (error: any) {
      server.log.error(error);
      return reply.code(500).send({ success: false, error: error.message || 'Failed to fetch work orders', data: [], total: 0, page: 1, limit: 50, totalPages: 0 });
    }
  });

  // GET /manufacturing/work-orders/:id
  server.get('/manufacturing/work-orders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const wo = await workOrderService.getWorkOrderWithDetails(id, request.user!.companyId);
    if (!wo) return reply.code(404).send({ success: false, error: 'Work order not found' });
    return { success: true, data: wo };
  });

  // PUT /manufacturing/work-orders/:id (draft only)
  server.put('/manufacturing/work-orders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const updated = await workOrderService.updateWorkOrder(id, request.user!.companyId, {
        ...body,
        planned_quantity: body.planned_quantity ? parseFloat(body.planned_quantity) : undefined,
        updated_by: request.user!.userId,
      });
      return { success: true, data: updated };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // DELETE /manufacturing/work-orders/:id (draft only)
  server.delete('/manufacturing/work-orders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await workOrderService.deleteWorkOrder(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Work order deleted', data: deleted };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // POST /manufacturing/work-orders/:id/approve
  server.post('/manufacturing/work-orders/:id/approve', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const approved = await workOrderService.approveWorkOrder(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Work order approved', data: approved };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // POST /manufacturing/work-orders/:id/start
  server.post('/manufacturing/work-orders/:id/start', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const started = await workOrderService.startProduction(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Production started', data: started };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // POST /manufacturing/work-orders/:id/complete
  server.post('/manufacturing/work-orders/:id/complete', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const completed = await workOrderService.completeWorkOrder(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Work order completed', data: completed };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // POST /manufacturing/work-orders/:id/close
  server.post('/manufacturing/work-orders/:id/close', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const closed = await workOrderService.closeWorkOrder(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Work order closed', data: closed };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // PATCH /manufacturing/work-orders/:id/cancel
  server.patch('/manufacturing/work-orders/:id/cancel', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const cancelled = await workOrderService.cancelWorkOrder(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Work order cancelled', data: cancelled };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // MATERIAL ISSUE & CONSUMPTION (Step 33)
  // ============================================================

  // POST /manufacturing/work-orders/:id/issue-materials
  server.post('/manufacturing/work-orders/:id/issue-materials', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        return reply.code(400).send({ success: false, error: 'lines array is required' });
      }
      for (let i = 0; i < body.lines.length; i++) {
        const l = body.lines[i];
        if (!l.material_id) return reply.code(400).send({ success: false, error: `Line ${i + 1}: material_id is required` });
        if (!l.issue_quantity || l.issue_quantity <= 0) return reply.code(400).send({ success: false, error: `Line ${i + 1}: issue_quantity must be > 0` });
      }

      const result = await workOrderService.issueMaterials(
        id, request.user!.companyId, request.user!.userId,
        body.lines.map((l: any) => ({
          material_id: l.material_id,
          issue_quantity: parseFloat(l.issue_quantity),
          batch_id: l.batch_id,
        }))
      );

      return { success: true, message: 'Materials issued. Stock deducted from source warehouse.', data: result };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : error.message.includes('Insufficient') ? 409 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // POST /manufacturing/work-orders/:id/consume-materials
  server.post('/manufacturing/work-orders/:id/consume-materials', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        return reply.code(400).send({ success: false, error: 'lines array is required' });
      }
      for (let i = 0; i < body.lines.length; i++) {
        const l = body.lines[i];
        if (!l.material_id) return reply.code(400).send({ success: false, error: `Line ${i + 1}: material_id is required` });
        if (!l.consumed_quantity || l.consumed_quantity <= 0) return reply.code(400).send({ success: false, error: `Line ${i + 1}: consumed_quantity must be > 0` });
      }

      const result = await workOrderService.consumeMaterials(
        id, request.user!.companyId, request.user!.userId,
        body.lines.map((l: any) => ({
          material_id: l.material_id,
          consumed_quantity: parseFloat(l.consumed_quantity),
          wastage_quantity: l.wastage_quantity ? parseFloat(l.wastage_quantity) : 0,
        }))
      );

      return { success: true, message: 'Material consumption recorded. Variance calculated.', data: result };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // POST /manufacturing/work-orders/:id/return-materials
  server.post('/manufacturing/work-orders/:id/return-materials', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
        return reply.code(400).send({ success: false, error: 'lines array is required' });
      }
      for (let i = 0; i < body.lines.length; i++) {
        const l = body.lines[i];
        if (!l.material_id) return reply.code(400).send({ success: false, error: `Line ${i + 1}: material_id is required` });
        if (!l.return_quantity || l.return_quantity <= 0) return reply.code(400).send({ success: false, error: `Line ${i + 1}: return_quantity must be > 0` });
      }

      const result = await workOrderService.returnMaterials(
        id, request.user!.companyId, request.user!.userId,
        body.lines.map((l: any) => ({
          material_id: l.material_id,
          return_quantity: parseFloat(l.return_quantity),
          batch_id: l.batch_id,
        }))
      );

      return { success: true, message: 'Materials returned to warehouse.', data: result };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // PRODUCTION ENTRIES (Step 34)
  // ============================================================

  // POST /manufacturing/production-entries
  server.post('/manufacturing/production-entries', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      const user = request.user!;

      if (!body.work_order_id) return reply.code(400).send({ success: false, error: 'work_order_id is required' });
      if (!body.entry_date) return reply.code(400).send({ success: false, error: 'entry_date is required' });
      if (!body.quantity_produced || body.quantity_produced <= 0) return reply.code(400).send({ success: false, error: 'quantity_produced must be > 0' });

      const entry = await productionEntryService.createEntry({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        work_order_id: body.work_order_id,
        entry_date: body.entry_date,
        quantity_produced: parseFloat(body.quantity_produced),
        scrap_quantity: body.scrap_quantity ? parseFloat(body.scrap_quantity) : 0,
        warehouse_id: body.warehouse_id,
        batch_number: body.batch_number,
        serial_numbers: body.serial_numbers,
        remarks: body.remarks,
        metadata: body.metadata,
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, message: 'Production recorded. Finished goods added to warehouse.', data: entry });
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // GET /manufacturing/production-entries
  server.get('/manufacturing/production-entries', { preHandler: [authenticate] }, async (request) => {
    const q = request.query as any;
    return { success: true, ...await productionEntryService.listEntries({
      companyId: request.user!.companyId,
      page: parseInt(q.page) || 1, limit: parseInt(q.limit) || 50,
      search: q.search, work_order_id: q.work_order_id, product_id: q.product_id,
      from_date: q.from_date, to_date: q.to_date,
      sortBy: q.sort_by || 'entry_date', sortOrder: q.sort_order || 'desc',
    })};
  });

  // GET /manufacturing/production-entries/:id
  server.get('/manufacturing/production-entries/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await productionEntryService.getEntryWithDetails(id, request.user!.companyId);
    if (!entry) return reply.code(404).send({ success: false, error: 'Production entry not found' });
    return { success: true, data: entry };
  });

  // ============================================================
  // SCRAP ENTRIES (Step 35)
  // ============================================================

  // POST /manufacturing/scrap-entries
  server.post('/manufacturing/scrap-entries', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      const user = request.user!;

      if (!body.scrap_date) return reply.code(400).send({ success: false, error: 'scrap_date is required' });
      if (!body.item_id && !body.product_id) return reply.code(400).send({ success: false, error: 'Either item_id or product_id is required' });
      if (!body.quantity || body.quantity <= 0) return reply.code(400).send({ success: false, error: 'quantity must be > 0' });
      if (!body.uom_id) return reply.code(400).send({ success: false, error: 'uom_id is required' });
      if (!body.scrap_reason || !VALID_SCRAP_REASONS.includes(body.scrap_reason)) {
        return reply.code(400).send({ success: false, error: `scrap_reason must be one of: ${VALID_SCRAP_REASONS.join(', ')}` });
      }
      if (!body.warehouse_id) return reply.code(400).send({ success: false, error: 'warehouse_id is required' });
      if (body.disposal_method && !VALID_DISPOSAL_METHODS.includes(body.disposal_method)) {
        return reply.code(400).send({ success: false, error: `disposal_method must be one of: ${VALID_DISPOSAL_METHODS.join(', ')}` });
      }

      const entry = await scrapEntryService.createEntry({
        company_id: user.companyId,
        branch_id: body.branch_id || user.branchId,
        scrap_date: body.scrap_date,
        work_order_id: body.work_order_id,
        item_id: body.item_id,
        product_id: body.product_id,
        quantity: parseFloat(body.quantity),
        uom_id: body.uom_id,
        scrap_reason: body.scrap_reason,
        reason_detail: body.reason_detail,
        scrap_value: body.scrap_value ? parseFloat(body.scrap_value) : undefined,
        disposal_method: body.disposal_method,
        warehouse_id: body.warehouse_id,
        metadata: body.metadata,
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, message: 'Scrap recorded. Stock deducted from warehouse.', data: entry });
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : error.message.includes('Insufficient') ? 409 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // GET /manufacturing/scrap-entries
  server.get('/manufacturing/scrap-entries', { preHandler: [authenticate] }, async (request) => {
    const q = request.query as any;
    return { success: true, ...await scrapEntryService.listEntries({
      companyId: request.user!.companyId,
      page: parseInt(q.page) || 1, limit: parseInt(q.limit) || 50,
      search: q.search, status: q.status, branch_id: q.branch_id, work_order_id: q.work_order_id,
      scrap_reason: q.scrap_reason, disposal_method: q.disposal_method,
      from_date: q.from_date, to_date: q.to_date,
      sortBy: q.sort_by || 'scrap_date', sortOrder: q.sort_order || 'desc',
    })};
  });

  // GET /manufacturing/scrap-entries/:id
  server.get('/manufacturing/scrap-entries/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await scrapEntryService.getEntryWithDetails(id, request.user!.companyId);
    if (!entry) return reply.code(404).send({ success: false, error: 'Scrap entry not found' });
    return { success: true, data: entry };
  });

  // PATCH /manufacturing/scrap-entries/:id/dispose
  server.patch('/manufacturing/scrap-entries/:id/dispose', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { disposal_method } = request.body as any;

      if (!disposal_method || !VALID_DISPOSAL_METHODS.includes(disposal_method)) {
        return reply.code(400).send({ success: false, error: `disposal_method must be one of: ${VALID_DISPOSAL_METHODS.join(', ')}` });
      }

      const updated = await scrapEntryService.markDisposed(id, request.user!.companyId, disposal_method, request.user!.userId);
      return { success: true, message: 'Scrap marked as disposed', data: updated };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // GET /manufacturing/scrap-analysis
  server.get('/manufacturing/scrap-analysis', { preHandler: [authenticate] }, async (request) => {
    const q = request.query as any;
    const validGroups = ['reason', 'product', 'work_order'];
    const groupBy = validGroups.includes(q.group_by) ? q.group_by : 'reason';

    const result = await scrapEntryService.getScrapAnalysis(request.user!.companyId, {
      from_date: q.from_date, to_date: q.to_date, branch_id: q.branch_id, group_by: groupBy,
    });

    return { success: true, ...result };
  });
}