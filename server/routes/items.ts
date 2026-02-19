import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { itemService } from '../services/item.service';

export async function itemRoutes(server: FastifyInstance) {
  server.get('/items', { preHandler: [authenticate] }, async (request) => {
    const { page, limit, search, status, item_type, category_id } = request.query as any;
    const result = await itemService.listItems({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search, status, item_type, category_id,
    });
    return { success: true, ...result };
  });

  server.get('/items/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await itemService.getItemWithDetails(id, request.user!.companyId);
    if (!item) return reply.code(404).send({ success: false, error: 'Item not found' });
    return { success: true, data: item };
  });

  server.post('/items', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const item = await itemService.createItem({
        ...(request.body as any),
        company_id: request.user!.companyId,
        created_by: request.user!.userId,
      });
      return reply.code(201).send({ success: true, data: item });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/items/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const updated = await itemService.updateItem(id, request.user!.companyId, request.body as any, request.user!.userId);
      if (!updated) return reply.code(404).send({ success: false, error: 'Item not found' });
      return { success: true, data: updated };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.delete('/items/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await itemService.softDelete(id, request.user!.companyId, request.user!.userId);
    if (!deleted) return reply.code(404).send({ success: false, error: 'Item not found' });
    return { success: true, message: 'Item deleted' };
  });

  server.post('/items/:id/alternatives', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const alt = await itemService.addAlternative(request.user!.companyId, {
      ...(request.body as any),
      item_id: id,
    });
    return reply.code(201).send({ success: true, data: alt });
  });

  server.delete('/items/alternatives/:altId', { preHandler: [authenticate] }, async (request) => {
    const { altId } = request.params as { altId: string };
    await itemService.removeAlternative(altId, request.user!.companyId);
    return { success: true, message: 'Alternative removed' };
  });
}