// =============================================================
// File: server/routes/batch-serial.ts
// Module: Inventory Management — Phase 7, Step 31
// Description: REST API routes for Batch & Serial Tracking.
//              Endpoints: create batch, list, get with history,
//              update, batches by item, FEFO selection, expiring
//              batches, status change, serial number search,
//              batch warehouse distribution.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { batchSerialService } from '../services/batch-serial.service';

export async function batchSerialRoutes(server: FastifyInstance) {
  // ──────────────────────────────────────────────────────────
  // POST /inventory/batches — Create batch manually
  // ──────────────────────────────────────────────────────────
  server.post('/inventory/batches', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;

      if (!body.item_id) {
        return reply.code(400).send({ success: false, error: 'item_id is required' });
      }
      if (!body.batch_number || !body.batch_number.trim()) {
        return reply.code(400).send({ success: false, error: 'batch_number is required' });
      }
      if (!body.initial_quantity || body.initial_quantity <= 0) {
        return reply.code(400).send({ success: false, error: 'initial_quantity must be > 0' });
      }

      // Validate expiry_date is after manufacturing_date
      if (body.manufacturing_date && body.expiry_date) {
        if (new Date(body.expiry_date) <= new Date(body.manufacturing_date)) {
          return reply.code(400).send({ success: false, error: 'expiry_date must be after manufacturing_date' });
        }
      }

      const user = request.user!;
      const batch = await batchSerialService.createBatch({
        company_id: user.companyId,
        item_id: body.item_id,
        batch_number: body.batch_number.trim(),
        manufacturing_date: body.manufacturing_date,
        expiry_date: body.expiry_date,
        vendor_id: body.vendor_id,
        grn_id: body.grn_id,
        initial_quantity: parseFloat(body.initial_quantity),
        unit_cost: body.unit_cost ? parseFloat(body.unit_cost) : undefined,
        created_by: user.userId,
      });

      return reply.code(201).send({ success: true, data: batch });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('already exists') ? 409 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/batches — List batches (paginated)
  //
  // Query params: page, limit, search, item_id, vendor_id,
  //   batch_status, expiry_before, expiry_after, sort_by, sort_order
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/batches', { preHandler: [authenticate] }, async (request) => {
    const {
      page, limit, search,
      item_id, vendor_id, batch_status,
      expiry_before, expiry_after,
      sort_by, sort_order,
    } = request.query as any;

    const result = await batchSerialService.listBatches({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search,
      item_id,
      vendor_id,
      batch_status,
      expiry_before,
      expiry_after,
      sortBy: sort_by || 'created_at',
      sortOrder: sort_order || 'desc',
    });

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/batches/expiring — Batches expiring soon
  //
  // Query params: days? (default 30), item_id?,
  //   include_expired? (boolean), page?, limit?
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/batches/expiring', { preHandler: [authenticate] }, async (request) => {
    const { days, item_id, include_expired, page, limit } = request.query as any;

    const result = await batchSerialService.getExpiringBatches(
      request.user!.companyId,
      {
        days: parseInt(days) || 30,
        item_id,
        include_expired: include_expired === 'true' || include_expired === '1',
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      }
    );

    return { success: true, ...result };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/batches/by-item/:itemId — All batches for an item
  //
  // Query params: status?, include_depleted? (boolean)
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/batches/by-item/:itemId', { preHandler: [authenticate] }, async (request) => {
    const { itemId } = request.params as { itemId: string };
    const { status, include_depleted } = request.query as any;

    const batches = await batchSerialService.getBatchesByItem(
      itemId,
      request.user!.companyId,
      {
        status,
        include_depleted: include_depleted === 'true' || include_depleted === '1',
      }
    );

    return { success: true, data: batches, total: batches.length };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/batches/fefo/:itemId — FEFO batch selection
  // Returns batches sorted by expiry for consumption.
  //
  // Query params: quantity (required)
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/batches/fefo/:itemId', { preHandler: [authenticate] }, async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const { quantity } = request.query as any;

    if (!quantity || parseFloat(quantity) <= 0) {
      return reply.code(400).send({ success: false, error: 'quantity is required and must be > 0' });
    }

    const selections = await batchSerialService.getFefoBatches(
      itemId,
      request.user!.companyId,
      parseFloat(quantity)
    );

    const totalAvailable = selections.reduce((sum, s) => sum + s.available, 0);
    const totalAllocated = selections.reduce((sum, s) => sum + s.consume, 0);

    return {
      success: true,
      data: selections,
      summary: {
        requested: parseFloat(quantity),
        allocated: totalAllocated,
        sufficient: totalAllocated >= parseFloat(quantity),
        batches_used: selections.length,
        total_available_across_batches: Math.round(totalAvailable * 1000) / 1000,
      },
    };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/batches/:id — Get batch with movement history
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/batches/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const batch = await batchSerialService.getBatchWithHistory(id, request.user!.companyId);

    if (!batch) {
      return reply.code(404).send({ success: false, error: 'Batch not found' });
    }

    return { success: true, data: batch };
  });

  // ──────────────────────────────────────────────────────────
  // PUT /inventory/batches/:id — Update batch metadata
  // ──────────────────────────────────────────────────────────
  server.put('/inventory/batches/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      if (body.manufacturing_date && body.expiry_date) {
        if (new Date(body.expiry_date) <= new Date(body.manufacturing_date)) {
          return reply.code(400).send({ success: false, error: 'expiry_date must be after manufacturing_date' });
        }
      }

      const updated = await batchSerialService.updateBatch(id, request.user!.companyId, {
        manufacturing_date: body.manufacturing_date,
        expiry_date: body.expiry_date,
        unit_cost: body.unit_cost !== undefined ? parseFloat(body.unit_cost) : undefined,
        updated_by: request.user!.userId,
      });

      return { success: true, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // PATCH /inventory/batches/:id/status — Change batch status
  // Body: { status: 'active' | 'depleted' | 'expired' | 'quarantine' }
  // ──────────────────────────────────────────────────────────
  server.patch('/inventory/batches/:id/status', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };

      const validStatuses = ['active', 'depleted', 'expired', 'quarantine'];
      if (!status || !validStatuses.includes(status)) {
        return reply.code(400).send({
          success: false,
          error: `status is required and must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const updated = await batchSerialService.changeBatchStatus(
        id,
        request.user!.companyId,
        status as any,
        request.user!.userId
      );

      return { success: true, message: `Batch status changed to ${status}`, data: updated };
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, error: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/batches/:id/distribution
  // Batch quantity distribution across warehouses.
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/batches/:id/distribution', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify batch exists
    const batch = await batchSerialService.getById(id, request.user!.companyId);
    if (!batch) {
      return reply.code(404).send({ success: false, error: 'Batch not found' });
    }

    const distribution = await batchSerialService.getBatchWarehouseDistribution(
      id,
      request.user!.companyId
    );

    return { success: true, data: distribution };
  });

  // ──────────────────────────────────────────────────────────
  // GET /inventory/serial-search — Search by serial number
  // Full traceability chain for a serial number.
  //
  // Query params: serial_number (required)
  // ──────────────────────────────────────────────────────────
  server.get('/inventory/serial-search', { preHandler: [authenticate] }, async (request, reply) => {
    const { serial_number } = request.query as any;

    if (!serial_number || !serial_number.trim()) {
      return reply.code(400).send({ success: false, error: 'serial_number query parameter is required' });
    }

    const result = await batchSerialService.searchBySerialNumber(
      request.user!.companyId,
      serial_number.trim()
    );

    return { success: true, ...result };
  });
}