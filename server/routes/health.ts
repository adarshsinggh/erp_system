import { FastifyInstance } from 'fastify';
import { getDb } from '../database/connection';

export async function healthRoutes(server: FastifyInstance) {
  server.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  });

  server.get('/health/db', async () => {
    try {
      const db = getDb();
      await db.raw('SELECT 1');
      return { status: 'ok', database: 'connected' };
    } catch {
      return { status: 'error', database: 'disconnected' };
    }
  });

  server.get('/health/setup-status', async () => {
    try {
      const db = getDb();
      const result = await db('companies')
        .where('is_deleted', false)
        .count('id as count')
        .first();
      const count = parseInt(String(result?.count || '0'), 10);
      return { status: 'ok', hasCompany: count > 0, needsSetup: count === 0 };
    } catch {
      return { status: 'ok', hasCompany: false, needsSetup: true };
    }
  });
}
