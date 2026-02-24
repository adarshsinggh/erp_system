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
import { getDb } from '../database/connection';

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

  // ─── Warehouses ─────────────────────────────────────────────────

  server.get('/warehouses', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const db = getDb();
      const { branch_id } = request.query as { branch_id?: string };
      let query = db('warehouses')
        .where({ company_id: request.user!.companyId, is_deleted: false });
      if (branch_id) query = query.where('branch_id', branch_id);
      const warehouses = await query.orderBy('name');

      // Enrich with branch name
      if (warehouses.length > 0) {
        const branchIds = [...new Set(warehouses.map((w: any) => w.branch_id))];
        const branches = await db('branches').whereIn('id', branchIds).select('id', 'name');
        const branchMap = new Map(branches.map((b: any) => [b.id, b.name]));
        for (const wh of warehouses) {
          (wh as any).branch_name = branchMap.get(wh.branch_id) || '';
          (wh as any).status = wh.is_active ? 'active' : 'inactive';
        }
      }

      return { success: true, data: warehouses };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message || 'Failed to load warehouses' });
    }
  });

  server.get('/warehouses/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const wh = await db('warehouses')
      .where({ id, company_id: request.user!.companyId, is_deleted: false })
      .first();
    if (!wh) return reply.code(404).send({ success: false, error: 'Warehouse not found' });
    return { success: true, data: wh };
  });

  server.post('/warehouses', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const db = getDb();
      const body = request.body as any;
      const [wh] = await db('warehouses')
        .insert({
          company_id: request.user!.companyId,
          branch_id: body.branch_id,
          code: body.code,
          name: body.name,
          address: body.address || null,
          warehouse_type: body.warehouse_type || 'main',
          is_default: body.is_default || false,
          created_by: request.user!.userId,
        })
        .returning('*');
      return reply.code(201).send({ success: true, data: wh });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/warehouses/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const [updated] = await db('warehouses')
      .where({ id, company_id: request.user!.companyId })
      .update({
        name: body.name,
        code: body.code,
        address: body.address,
        warehouse_type: body.warehouse_type,
        is_active: body.status === 'active',
        updated_by: request.user!.userId,
      })
      .returning('*');
    if (!updated) return reply.code(404).send({ success: false, error: 'Warehouse not found' });
    return { success: true, data: updated };
  });

  server.delete('/warehouses/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const db = getDb();
    const { id } = request.params as { id: string };
    const [deleted] = await db('warehouses')
      .where({ id, company_id: request.user!.companyId })
      .update({ is_deleted: true, deleted_at: db.fn.now(), deleted_by: request.user!.userId })
      .returning('*');
    if (!deleted) return reply.code(404).send({ success: false, error: 'Warehouse not found' });
    return { success: true, message: 'Warehouse deleted' };
  });
}