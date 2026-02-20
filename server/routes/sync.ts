// =============================================================
// File: server/routes/sync.ts
// Module: Sync & Multi-Device — Phase 15 (Step 50)
//
// DEVICE MANAGEMENT:
//   POST   /api/sync/devices/register     — Register device
//   GET    /api/sync/devices              — List devices
//   PUT    /api/sync/devices/:deviceId/deactivate — Deactivate
//
// SYNC OPERATIONS:
//   POST   /api/sync/pull                 — Delta pull (changed rows)
//   POST   /api/sync/push                 — Push client changes
//   POST   /api/sync/initial              — Full initial sync
//   POST   /api/sync/mark-synced          — Confirm sync receipt
//
// SYNC STATUS:
//   GET    /api/sync/status               — Pending/conflict counts
//   POST   /api/sync/resolve-conflict     — Manual conflict resolution
//   GET    /api/sync/heartbeat            — Connectivity check
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { syncService } from '../services/sync.service';

export async function syncRoutes(server: FastifyInstance) {

  // ═══════════════════════════════════════════════════════════
  // DEVICE MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  server.post('/sync/devices/register', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.device_id || !body.device_name) {
        return reply.code(400).send({ success: false, error: 'device_id and device_name required' });
      }
      const device = await syncService.registerDevice(
        request.user!.companyId, body, request.user!.userId
      );
      return reply.code(201).send({ success: true, data: device });
    } catch (e: any) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  server.get('/sync/devices', { preHandler: [authenticate] }, async (request) => {
    const devices = await syncService.listDevices(request.user!.companyId);
    return { success: true, data: devices };
  });

  server.put('/sync/devices/:deviceId/deactivate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { deviceId } = request.params as any;
      await syncService.deactivateDevice(request.user!.companyId, deviceId);
      return { success: true, message: 'Device deactivated' };
    } catch (e: any) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // SYNC OPERATIONS
  // ═══════════════════════════════════════════════════════════

  /**
   * POST /api/sync/pull
   * Body: { device_id, last_synced_at?, tables?[], page_size? }
   * Returns: changed rows per table since last_synced_at
   */
  server.post('/sync/pull', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.device_id) {
        return reply.code(400).send({ success: false, error: 'device_id required' });
      }
      const result = await syncService.pull(request.user!.companyId, body);
      return { success: true, data: result };
    } catch (e: any) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  /**
   * POST /api/sync/push
   * Body: { device_id, changes: [{ table_name, rows[] }] }
   * Returns: applied count, conflicts
   */
  server.post('/sync/push', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.device_id || !body.changes) {
        return reply.code(400).send({ success: false, error: 'device_id and changes required' });
      }
      const result = await syncService.push(request.user!.companyId, body, request.user!.userId);
      return { success: true, data: result };
    } catch (e: any) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  /**
   * POST /api/sync/initial
   * Body: { device_id, tables?[], batch_size?, offset? }
   * Full data dump for new client machine setup
   */
  server.post('/sync/initial', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.device_id) {
        return reply.code(400).send({ success: false, error: 'device_id required' });
      }
      const result = await syncService.initialSync(request.user!.companyId, body.device_id, body);
      return { success: true, data: result };
    } catch (e: any) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  /**
   * POST /api/sync/mark-synced
   * Body: { confirmations: [{ table_name, record_ids[] }] }
   * Client confirms receipt — server marks rows as synced
   */
  server.post('/sync/mark-synced', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      const result = await syncService.markSynced(request.user!.companyId, body.confirmations || []);
      return { success: true, data: result };
    } catch (e: any) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // SYNC STATUS & CONFLICT RESOLUTION
  // ═══════════════════════════════════════════════════════════

  server.get('/sync/status', { preHandler: [authenticate] }, async (request) => {
    const result = await syncService.getSyncStatus(request.user!.companyId);
    return { success: true, data: result };
  });

  /**
   * POST /api/sync/resolve-conflict
   * Body: { table_name, record_id, resolution: 'keep_server'|'keep_client', client_data? }
   */
  server.post('/sync/resolve-conflict', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.table_name || !body.record_id || !body.resolution) {
        return reply.code(400).send({ success: false, error: 'table_name, record_id, and resolution required' });
      }
      const result = await syncService.resolveConflict(
        request.user!.companyId,
        body.table_name, body.record_id,
        body.resolution, body.client_data,
        request.user!.userId
      );
      return { success: true, data: result };
    } catch (e: any) {
      return reply.code(400).send({ success: false, error: e.message });
    }
  });

  /**
   * GET /api/sync/heartbeat
   * Query: ?device_id=
   * Lightweight connectivity check
   */
  server.get('/sync/heartbeat', { preHandler: [authenticate] }, async (request) => {
    const { device_id } = request.query as any;
    const result = await syncService.heartbeat(request.user!.companyId, device_id || 'unknown');
    return { success: true, data: result };
  });
}