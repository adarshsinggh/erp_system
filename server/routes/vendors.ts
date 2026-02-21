import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { vendorService } from '../services/vendor.service';

export async function vendorRoutes(server: FastifyInstance) {
  server.get('/vendors', { preHandler: [authenticate] }, async (request) => {
    const { page, limit, search, status } = request.query as any;
    const result = await vendorService.listVendors({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search, status,
    });
    return { success: true, ...result };
  });

  server.get('/vendors/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const vendor = await vendorService.getVendorWithDetails(id, request.user!.companyId);
      if (!vendor) return reply.code(404).send({ success: false, error: 'Vendor not found' });
      return { success: true, data: vendor };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message || 'Failed to load vendor details' });
    }
  });

  server.post('/vendors', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const vendor = await vendorService.createVendor({
        ...(request.body as any),
        company_id: request.user!.companyId,
        created_by: request.user!.userId,
      });
      return reply.code(201).send({ success: true, data: vendor });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/vendors/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const updated = await vendorService.updateVendor(id, request.user!.companyId, request.body, request.user!.userId);
      if (!updated) return reply.code(404).send({ success: false, error: 'Vendor not found' });
      return { success: true, data: updated };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.delete('/vendors/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await vendorService.softDelete(id, request.user!.companyId, request.user!.userId);
    if (!deleted) return reply.code(404).send({ success: false, error: 'Vendor not found' });
    return { success: true, message: 'Vendor deleted' };
  });

  server.post('/vendors/:id/items', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const mapping = await vendorService.mapItemToVendor(request.user!.companyId, {
      ...(request.body as any),
      vendor_id: id,
    });
    return reply.code(201).send({ success: true, data: mapping });
  });

  server.put('/vendors/item-mapping/:mappingId', { preHandler: [authenticate] }, async (request) => {
    const { mappingId } = request.params as { mappingId: string };
    const updated = await vendorService.updateItemVendorMapping(mappingId, request.user!.companyId, request.body);
    return { success: true, data: updated };
  });

  server.delete('/vendors/item-mapping/:mappingId', { preHandler: [authenticate] }, async (request) => {
    const { mappingId } = request.params as { mappingId: string };
    await vendorService.removeItemVendorMapping(mappingId, request.user!.companyId);
    return { success: true, message: 'Mapping removed' };
  });
}