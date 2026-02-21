import { FastifyInstance } from 'fastify';
import { authService } from '../services/auth.service';

export async function authRoutes(server: FastifyInstance) {
  // POST /api/auth/login
  server.post('/auth/login', async (request, reply) => {
    try {
      const { username, password, company_id } = request.body as {
        username: string; password: string; company_id: string;
      };

      if (!username || !password || !company_id) {
        return reply.code(400).send({ success: false, error: 'Username, password, and company_id are required' });
      }

      const result = await authService.login({ username, password, company_id });
      return { success: true, data: result };
    } catch (error: any) {
      return reply.code(401).send({ success: false, error: error.message || 'Authentication failed' });
    }
  });

  // POST /api/auth/verify
  server.post('/auth/verify', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ success: false, error: 'No token provided' });
      }
      const payload = authService.verifyToken(authHeader.substring(7));
      return { success: true, data: payload };
    } catch (error: any) {
      return reply.code(401).send({ success: false, error: 'Invalid or expired token' });
    }
  });

  // GET /api/auth/verify — alternative verify endpoint
  server.get('/auth/verify', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ success: false, error: 'No token provided' });
      }
      const payload = authService.verifyToken(authHeader.substring(7));
      return { success: true, data: payload };
    } catch (error: any) {
      return reply.code(401).send({ success: false, error: 'Invalid or expired token' });
    }
  });

  // POST /api/auth/change-password
  server.post('/auth/change-password', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ success: false, error: 'Authentication required' });
      }
      const payload = authService.verifyToken(authHeader.substring(7));

      const { current_password, new_password } = request.body as {
        current_password: string; new_password: string;
      };

      if (!current_password || !new_password) {
        return reply.code(400).send({ success: false, error: 'Both passwords are required' });
      }
      if (new_password.length < 8) {
        return reply.code(400).send({ success: false, error: 'New password must be at least 8 characters' });
      }

      await authService.changePassword(payload.userId, current_password, new_password);
      return { success: true, message: 'Password changed successfully' };
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });
}
