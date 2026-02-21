import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { bomService } from '../services/bom.service';

export async function bomRoutes(server: FastifyInstance) {
  server.get('/boms', { preHandler: [authenticate] }, async (request) => {
    const { page, limit, search, status, product_id } = request.query as any;
    const result = await bomService.listBoms({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search, status, product_id,
    });
    return { success: true, ...result };
  });

  server.get('/boms/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const bom = await bomService.getBomWithLines(id, request.user!.companyId);
      if (!bom) return reply.code(404).send({ success: false, error: 'BOM not found' });
      return { success: true, data: bom };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message || 'Failed to load BOM details' });
    }
  });

  server.post('/boms', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const bom = await bomService.createBom({
        ...(request.body as any),
        company_id: request.user!.companyId,
        created_by: request.user!.userId,
      });
      return reply.code(201).send({ success: true, data: bom });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.post('/boms/:id/activate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const activated = await bomService.activateBom(id, request.user!.companyId, request.user!.userId);
      return { success: true, data: activated };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.post('/boms/:id/obsolete', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await bomService.obsoleteBom(id, request.user!.companyId, request.user!.userId);
    return { success: true, data: result };
  });

  server.put('/boms/:id/lines', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { lines } = request.body as { lines: any[] };
      const newLines = await bomService.updateBomLines(id, request.user!.companyId, lines, request.user!.userId);
      return { success: true, data: newLines };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.delete('/boms/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await bomService.softDelete(id, request.user!.companyId, request.user!.userId);
    if (!deleted) return reply.code(404).send({ success: false, error: 'BOM not found' });
    return { success: true, message: 'BOM deleted' };
  });
}