import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { customerService } from '../services/customer.service';

export async function customerRoutes(server: FastifyInstance) {
  server.get('/customers', { preHandler: [authenticate] }, async (request) => {
    const { page, limit, search, status } = request.query as any;
    const result = await customerService.listCustomers({
      companyId: request.user!.companyId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      search, status,
    });
    return { success: true, ...result };
  });

  server.get('/customers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const customer = await customerService.getCustomerWithDetails(id, request.user!.companyId);
    if (!customer) return reply.code(404).send({ success: false, error: 'Customer not found' });
    return { success: true, data: customer };
  });

  server.post('/customers', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const customer = await customerService.createCustomer({
        ...(request.body as any),
        company_id: request.user!.companyId,
        created_by: request.user!.userId,
      });
      return reply.code(201).send({ success: true, data: customer });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.put('/customers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const updated = await customerService.updateCustomer(id, request.user!.companyId, request.body, request.user!.userId);
      if (!updated) return reply.code(404).send({ success: false, error: 'Customer not found' });
      return { success: true, data: updated };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  server.delete('/customers/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await customerService.softDelete(id, request.user!.companyId, request.user!.userId);
    if (!deleted) return reply.code(404).send({ success: false, error: 'Customer not found' });
    return { success: true, message: 'Customer deleted' };
  });

  server.post('/customers/:id/contacts', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const contact = await customerService.addContactPerson(request.user!.companyId, id, request.body as any);
    return reply.code(201).send({ success: true, data: contact });
  });

  server.put('/customers/:id/contacts/:contactId', { preHandler: [authenticate] }, async (request) => {
    const { contactId } = request.params as { id: string; contactId: string };
    const updated = await customerService.updateContactPerson(contactId, request.user!.companyId, request.body as any);
    return { success: true, data: updated };
  });

  server.delete('/customers/:id/contacts/:contactId', { preHandler: [authenticate] }, async (request) => {
    const { contactId } = request.params as { id: string; contactId: string };
    await customerService.deleteContactPerson(contactId, request.user!.companyId);
    return { success: true, message: 'Contact deleted' };
  });

  server.post('/customers/:id/addresses', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const address = await customerService.addAddress(request.user!.companyId, id, request.body as any);
    return reply.code(201).send({ success: true, data: address });
  });

  server.put('/customers/:id/addresses/:addressId', { preHandler: [authenticate] }, async (request) => {
    const { addressId } = request.params as { id: string; addressId: string };
    const updated = await customerService.updateAddress(addressId, request.user!.companyId, request.body as any);
    return { success: true, data: updated };
  });

  server.delete('/customers/:id/addresses/:addressId', { preHandler: [authenticate] }, async (request) => {
    const { addressId } = request.params as { id: string; addressId: string };
    await customerService.deleteAddress(addressId, request.user!.companyId);
    return { success: true, message: 'Address deleted' };
  });
}