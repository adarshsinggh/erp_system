import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import {
  categoryService,
  uomService,
  brandService,
  manufacturerService,
  taxService,
  locationService,
} from '../services/masters.service';

export async function mastersRoutes(server: FastifyInstance) {
  // Categories
  server.get('/categories', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const data = await categoryService.listCategories(request.user!.companyId);
      return { success: true, data };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message || 'Failed to load categories' });
    }
  });

  server.post('/categories', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const cat = await categoryService.createCategory(request.user!.companyId, request.body as any, request.user!.userId);
      return reply.code(201).send({ success: true, data: cat });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/categories/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const updated = await categoryService.update(id, request.user!.companyId, request.body as any, request.user!.userId);
    return { success: true, data: updated };
  });

  server.delete('/categories/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await categoryService.softDelete(id, request.user!.companyId, request.user!.userId);
    return { success: true, message: 'Category deleted' };
  });

  // UOMs
  server.get('/uoms', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const data = await uomService.listUoms(request.user!.companyId);
      return { success: true, data };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message || 'Failed to load UOMs' });
    }
  });

  server.post('/uoms', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const uom = await uomService.createUom(request.user!.companyId, request.body as any, request.user!.userId);
      return reply.code(201).send({ success: true, data: uom });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.get('/uom-conversions', { preHandler: [authenticate] }, async (request) => {
    const data = await uomService.getConversions(request.user!.companyId);
    return { success: true, data };
  });

  server.post('/uom-conversions', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const conv = await uomService.addConversion(request.user!.companyId, request.body as any);
      return reply.code(201).send({ success: true, data: conv });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // Brands
  server.get('/brands', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const data = await brandService.listBrands(request.user!.companyId);
      return { success: true, data };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message || 'Failed to load brands' });
    }
  });

  server.post('/brands', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const brand = await brandService.createBrand(request.user!.companyId, request.body as any, request.user!.userId);
      return reply.code(201).send({ success: true, data: brand });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/brands/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const updated = await brandService.update(id, request.user!.companyId, request.body as any, request.user!.userId);
    return { success: true, data: updated };
  });

  server.delete('/brands/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await brandService.softDelete(id, request.user!.companyId, request.user!.userId);
    return { success: true, message: 'Brand deleted' };
  });

  // Manufacturers
  server.get('/manufacturers', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const data = await manufacturerService.listManufacturers(request.user!.companyId);
      return { success: true, data };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message || 'Failed to load manufacturers' });
    }
  });

  server.post('/manufacturers', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const mfr = await manufacturerService.createManufacturer(request.user!.companyId, request.body as any, request.user!.userId);
      return reply.code(201).send({ success: true, data: mfr });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/manufacturers/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const updated = await manufacturerService.update(id, request.user!.companyId, request.body as any, request.user!.userId);
    return { success: true, data: updated };
  });

  server.delete('/manufacturers/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await manufacturerService.softDelete(id, request.user!.companyId, request.user!.userId);
    return { success: true, message: 'Manufacturer deleted' };
  });

  // Taxes
  server.get('/taxes', { preHandler: [authenticate] }, async (request) => {
    const { tax_type } = request.query as any;
    const data = await taxService.listTaxes(request.user!.companyId, tax_type);
    return { success: true, data };
  });

  server.post('/taxes', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const tax = await taxService.createTax(request.user!.companyId, request.body as any, request.user!.userId);
      return reply.code(201).send({ success: true, data: tax });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/taxes/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const updated = await taxService.update(id, request.user!.companyId, request.body as any, request.user!.userId);
    return { success: true, data: updated };
  });

  // Locations
  server.get('/locations', { preHandler: [authenticate] }, async (request) => {
    const { branch_id } = request.query as any;
    const data = await locationService.listLocations(request.user!.companyId, branch_id);
    return { success: true, data };
  });

  server.post('/locations', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const loc = await locationService.createLocation(request.user!.companyId, request.body as any, request.user!.userId);
      return reply.code(201).send({ success: true, data: loc });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/locations/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const updated = await locationService.update(id, request.user!.companyId, request.body as any, request.user!.userId);
    return { success: true, data: updated };
  });

  server.delete('/locations/:id', { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await locationService.softDelete(id, request.user!.companyId, request.user!.userId);
    return { success: true, message: 'Location deleted' };
  });
}