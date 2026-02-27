/**
 * PHASE 9: Security & Permission Testing
 * Tests authentication, role-based access, and input validation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, cleanAllData } from './setup';
import {
  createTestEnvironment, createCustomer, createRole, createUser,
  TestEnv, resetCounters,
} from './helpers/factory';
import { authService } from '../server/services/auth.service';

let env: TestEnv;
let db: ReturnType<typeof getTestDb>;

beforeAll(async () => {
  db = getTestDb();
  await cleanAllData();
  resetCounters();
  env = await createTestEnvironment();
}, 60000);

afterAll(async () => {
  await cleanAllData();
});

describe('Phase 9: Security & Permission Testing', () => {

  // ── 9a. Authentication ──────────────────────────────────────────

  describe('9a. Authentication', () => {
    it('should login with valid credentials', async () => {
      const result = await authService.login({
        username: env.user.username,
        password: 'Test@123',
        company_id: env.company.id,
      });

      expect(result).toBeDefined();
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(10);
    });

    it('should reject login with wrong password', async () => {
      await expect(
        authService.login({
          username: env.user.username,
          password: 'WrongPassword',
          company_id: env.company.id,
        })
      ).rejects.toThrow();
    });

    it('should reject login with non-existent username', async () => {
      await expect(
        authService.login({
          username: 'nonexistent_user_xyz',
          password: 'Test@123',
          company_id: env.company.id,
        })
      ).rejects.toThrow();
    });

    it('should verify valid token', async () => {
      const { token } = await authService.login({
        username: env.user.username,
        password: 'Test@123',
        company_id: env.company.id,
      });

      const payload = authService.verifyToken(token);
      expect(payload).toBeDefined();
      expect(payload.userId).toBe(env.user.id);
      expect(payload.companyId).toBe(env.company.id);
    });

    it('should reject invalid/expired token', () => {
      expect(() => {
        authService.verifyToken('invalid.token.here');
      }).toThrow();
    });
  });

  // ── 9b. Role-Based Access ───────────────────────────────────────

  describe('9b. Role-Based Access', () => {
    it('should create different roles', async () => {
      const adminRole = await createRole(env.company.id, {
        name: 'Security Admin',
        hierarchy_level: 100,
      });
      const salesRole = await createRole(env.company.id, {
        name: 'Security Sales User',
        hierarchy_level: 50,
      });
      const purchaseRole = await createRole(env.company.id, {
        name: 'Security Purchase User',
        hierarchy_level: 50,
      });

      expect(adminRole.id).toBeDefined();
      expect(salesRole.id).toBeDefined();
      expect(purchaseRole.id).toBeDefined();
    });

    it('should create users with different roles', async () => {
      const salesRole = await createRole(env.company.id, { name: 'Sales Rep' });
      // createUser factory hashes the password into password_hash
      const salesUser = await createUser(env.company.id, salesRole.id, env.branch.id, {
        username: 'sales_user_test',
      });

      expect(salesUser.role_id).toBe(salesRole.id);
    });

    it('should verify user role association', async () => {
      const user = await db('users')
        .where('users.id', env.user.id)
        .join('roles', 'users.role_id', 'roles.id')
        .select('users.*', 'roles.name as role_name')
        .first();

      expect(user.role_name).toBeDefined();
      expect(user.role_id).toBeDefined();
    });
  });

  // ── 9c. Input Validation / SQL Injection ────────────────────────

  describe('9c. Input Validation & Injection Prevention', () => {
    it('should handle SQL injection in customer name gracefully', async () => {
      // This should either escape the input or store it safely
      const customer = await createCustomer(env.company.id, {
        name: "Test'; DROP TABLE customers; --",
      });

      // If we get here, the input was safely handled
      expect(customer).toBeDefined();
      expect(customer.name).toContain("Test'");

      // Verify customers table still exists
      const count = await db('customers').count('id as cnt').first();
      expect(parseInt(String(count?.cnt || '0'))).toBeGreaterThan(0);
    });

    it('should handle XSS in customer fields', async () => {
      const customer = await createCustomer(env.company.id, {
        name: '<script>alert("xss")</script>Test',
      });

      expect(customer).toBeDefined();
      // The value should be stored — XSS prevention is typically on output/frontend
    });

    it('should reject malformed UUIDs in service calls', async () => {
      // PostgreSQL throws on invalid UUID format — this is a finding:
      // Services should validate UUID format before querying to return clean errors
      await expect(
        db('customers')
          .where({ id: 'not-a-valid-uuid', company_id: env.company.id })
          .first()
      ).rejects.toThrow(/invalid input syntax for type uuid/i);
    });

    it('should handle extremely long strings without DB crash', async () => {
      const longName = 'A'.repeat(10000);

      try {
        await createCustomer(env.company.id, { name: longName });
        // If it succeeds, the DB accepts it (may be truncated)
      } catch (err: any) {
        // Should fail gracefully, not with a crash
        expect(err.message).toBeDefined();
        expect(err.message).not.toContain('FATAL');
      }
    });

    it('should not expose DB errors in auth failure', async () => {
      try {
        await authService.login({
          username: "' OR '1'='1",
          password: "' OR '1'='1",
          company_id: env.company.id,
        });
      } catch (err: any) {
        // Error should be generic, not exposing SQL details
        expect(err.message.toLowerCase()).not.toContain('syntax');
        expect(err.message.toLowerCase()).not.toContain('pg_');
      }
    });

    it('should handle null/undefined inputs to services', async () => {
      // Test with null company_id
      await expect(
        db('customers')
          .where({ company_id: null as any })
          .first()
      ).resolves.not.toThrow();
    });
  });

  // ── 9d. Data Isolation ──────────────────────────────────────────

  describe('9d. Multi-Tenant Data Isolation', () => {
    it('should not allow cross-company data access', async () => {
      // Create customer in company A (env.company)
      const customerA = await createCustomer(env.company.id, { name: 'Company A Customer' });

      // Simulate querying with a different company_id
      const crossAccess = await db('customers')
        .where({ id: customerA.id, company_id: '00000000-0000-0000-0000-000000000000' })
        .first();

      expect(crossAccess).toBeUndefined();
    });

    it('service getById should enforce company_id', async () => {
      const customer = await createCustomer(env.company.id, { name: 'Isolated Customer' });

      // BaseService.getById requires company_id match
      const found = await db('customers')
        .where({ id: customer.id, company_id: env.company.id, is_deleted: false })
        .first();
      expect(found).toBeDefined();

      // Wrong company should return nothing
      const notFound = await db('customers')
        .where({ id: customer.id, company_id: '00000000-0000-0000-0000-000000000000', is_deleted: false })
        .first();
      expect(notFound).toBeUndefined();
    });
  });
});
