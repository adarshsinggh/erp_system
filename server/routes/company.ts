import { FastifyInstance } from 'fastify';
import { companyService } from '../services/company.service';
import { authService } from '../services/auth.service';

export async function companyRoutes(server: FastifyInstance) {
  // POST /api/setup - First time company setup (no auth required)
  server.post('/setup', async (request, reply) => {
    try {
      const body = request.body as any;

      if (!body.company?.name) {
        return reply.code(400).send({ success: false, error: 'Company name is required' });
      }
      if (!body.admin?.username || !body.admin?.password || !body.admin?.email || !body.admin?.full_name) {
        return reply.code(400).send({ success: false, error: 'Admin details are required (username, password, email, full_name)' });
      }
      if (!body.branch?.name || !body.branch?.code) {
        return reply.code(400).send({ success: false, error: 'Branch name and code are required' });
      }
      if (!body.financial_year?.year_code || !body.financial_year?.start_date || !body.financial_year?.end_date) {
        return reply.code(400).send({ success: false, error: 'Financial year details are required' });
      }

      const existing = await companyService.listCompanies();
      if (existing.length > 0) {
        return reply.code(409).send({ success: false, error: 'A company already exists. Use login instead.' });
      }

      const result = await companyService.setupCompany(body);
      return reply.code(201).send({ success: true, data: result, message: 'Company setup completed successfully' });
    } catch (error: any) {
      server.log.error(error);
      return reply.code(500).send({ success: false, error: error.message || 'Failed to setup company' });
    }
  });

  // GET /api/companies - List companies (for login dropdown)
  server.get('/companies', async (_request, reply) => {
    try {
      const companies = await companyService.listCompanies();
      return {
        success: true,
        data: companies.map((c: any) => ({
          id: c.id, name: c.name, display_name: c.display_name, license_tier: c.license_tier,
        })),
      };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  // GET /api/companies/:id - Get company details
  server.get('/companies/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const company = await companyService.getCompany(id);
      if (!company) return reply.code(404).send({ success: false, error: 'Company not found' });
      return { success: true, data: company };
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

    // PUT /api/companies/:id - Update company profile
  server.put('/companies/:id', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ success: false, error: 'Authentication required' });
      }
      const { userId } = authService.verifyToken(authHeader.substring(7));
      const { id } = request.params as { id: string };
      const updated = await companyService.updateCompany(id, request.body as any, userId);
      if (!updated) return reply.code(404).send({ success: false, error: 'Company not found' });
      return { success: true, data: updated };
    } catch (error: any) {
      server.log.error(error);
      // Sanitize error message — never expose raw SQL to the client
      const safeMessage = error.message?.includes('sync_status') || error.message?.includes('update "')
        ? 'Failed to update company profile. Please try again.'
        : (error.message || 'Failed to update company');
      return reply.code(400).send({ success: false, error: safeMessage });
    }
  });
}
