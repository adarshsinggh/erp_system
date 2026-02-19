import { FastifyRequest, FastifyReply } from 'fastify';
import { authService, JwtPayload } from '../services/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * Simple auth middleware - import and use directly in preHandler
 * Usage: { preHandler: [authenticate] }
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: 'Authentication required' });
    }
    const token = authHeader.substring(7);
    request.user = authService.verifyToken(token);
  } catch {
    return reply.code(401).send({ success: false, error: 'Invalid or expired token' });
  }
}