import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { productService } from '../services/product.service';

export async function productRoutes(server: FastifyInstance) {
  server.get('/products', { preHandler: [authenticate] }, async (request) => {
    const { page, limit, search, status, product_type, category_id } = request.query as any;
    const result = await productService.listProducts({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search, status, product_type, category_id,
    });
    return { success: true, ...result };
  });

  server.get('/products/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await productService.getProductWithDetails(id, request.user!.companyId);
    if (!product) return reply.code(404).send({ success: false, error: 'Product not found' });
    return { success: true, data: product };
  });

  server.post('/products', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const product = await productService.createProduct({
        ...(request.body as any),
        company_id: request.user!.companyId,
        created_by: request.user!.userId,
      });
      return reply.code(201).send({ success: true, data: product });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/products/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const updated = await productService.updateProduct(id, request.user!.companyId, request.body as any, request.user!.userId);
      if (!updated) return reply.code(404).send({ success: false, error: 'Product not found' });
      return { success: true, data: updated };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.delete('/products/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await productService.softDelete(id, request.user!.companyId, request.user!.userId);
    if (!deleted) return reply.code(404).send({ success: false, error: 'Product not found' });
    return { success: true, message: 'Product deleted' };
  });
}