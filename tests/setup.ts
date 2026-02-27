/**
 * Global test setup — creates test DB, runs migrations, provides cleanup utilities.
 *
 * The ERP services use a singleton Knex instance via getDb(). We override
 * environment variables BEFORE importing any service so the singleton
 * connects to the test database.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load test env BEFORE anything else
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Override process.env to ensure test DB is used
process.env.DB_NAME = 'manufacturing_erp_test';
process.env.NODE_ENV = 'test';

import knexLib from 'knex';
import type { Knex } from 'knex';
import { execSync } from 'child_process';
import { beforeAll, afterAll } from 'vitest';

// knex default export may be the constructor or a module — handle both
const knex = (typeof knexLib === 'function' ? knexLib : (knexLib as any).default) as typeof knexLib;

// ── Admin connection (to create/drop test DB) ───────────────────────

function getAdminDb(): Knex {
  return knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: 'postgres', // connect to default DB for admin ops
      user: process.env.DB_USER || 'adarshsingh',
      password: process.env.DB_PASSWORD || '',
    },
  });
}

// ── Test DB connection ──────────────────────────────────────────────

let testDb: Knex | null = null;

export function getTestDb(): Knex {
  if (!testDb) {
    testDb = knex({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'manufacturing_erp_test',
        user: process.env.DB_USER || 'adarshsingh',
        password: process.env.DB_PASSWORD || '',
      },
      pool: { min: 1, max: 5 },
      migrations: {
        directory: path.resolve(__dirname, '../server/database/migrations'),
        tableName: 'knex_migrations',
        extension: 'ts',
      },
    });
  }
  return testDb;
}

// ── Transaction tables (order matters for truncation) ───────────────

const TRANSACTION_TABLES = [
  // Payments first (FK to invoices/bills)
  'payment_receipt_lines',
  'payment_receipts',
  'payment_made_lines',
  'payment_made',
  // Credit/Debit notes
  'credit_note_lines',
  'credit_notes',
  'debit_note_lines',
  'debit_notes',
  // Invoices/Bills
  'sales_invoice_lines',
  'sales_invoices',
  'vendor_bill_lines',
  'vendor_bills',
  // Delivery/GRN
  'delivery_challan_lines',
  'delivery_challans',
  'grn_lines',
  'goods_receipt_notes',
  // Orders
  'sales_order_lines',
  'sales_orders',
  'sales_quotation_lines',
  'sales_quotations',
  'purchase_order_lines',
  'purchase_orders',
  'purchase_requisition_lines',
  'purchase_requisitions',
  // Stock
  'stock_ledger',
  'stock_summary',
  'stock_batches',
  'stock_reservations',
  'stock_transfer_lines',
  'stock_transfers',
  'stock_adjustment_lines',
  'stock_adjustments',
  // Manufacturing
  'scrap_entries',
  'production_entries',
  'work_order_materials',
  'work_orders',
  // Accounting
  'ledger_entries',
  'bank_reconciliation',
  // Audit & workflow
  'approval_comments',
  'approval_tasks',
  'approval_instances',
  'notification_log',
  'alert_history',
  'alert_instances',
  'audit_logs',
  'data_change_logs',
  'document_tracking',
];

const MASTER_TABLES = [
  'bank_accounts',
  'item_vendor_mapping',
  'item_alternatives',
  'bom_lines',
  'bom_headers',
  'products',
  'items',
  'item_categories',
  'uom_conversions',
  'units_of_measurement',
  'addresses',
  'contact_persons',
  'customers',
  'vendors',
  'manufacturers',
  'brands',
  'tax_masters',
  'document_sequences',
  'chart_of_accounts',
  'location_definitions',
];

const CORE_TABLES = [
  'approval_workflow_steps',
  'approval_workflows',
  'alert_rules',
  'notification_channels',
  'compliance_checks',
  'users',
  'role_permissions',
  'field_permissions',
  'permissions',
  'roles',
  'warehouses',
  'branches',
  'financial_years',
  'companies',
];

// ── Global Setup ────────────────────────────────────────────────────

beforeAll(async () => {
  const adminDb = getAdminDb();

  try {
    // Create test database if it doesn't exist
    const result = await adminDb.raw(
      `SELECT 1 FROM pg_database WHERE datname = ?`,
      [process.env.DB_NAME || 'manufacturing_erp_test']
    );

    if (result.rows.length === 0) {
      await adminDb.raw(`CREATE DATABASE ${process.env.DB_NAME || 'manufacturing_erp_test'}`);
      console.log('[TEST] Created test database');
    }
  } catch (err: any) {
    // Ignore if already exists
    if (!err.message.includes('already exists')) {
      throw err;
    }
  } finally {
    await adminDb.destroy();
  }

  // Connect to test DB and create extensions
  const db = getTestDb();
  await db.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await db.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // Run migrations via CLI to avoid ESM compatibility issues with Knex migrator
  // (Knex's dynamic import() of .ts migration files fails in vitest's ESM environment)
  const projectRoot = path.resolve(__dirname, '..');
  execSync('npx knex migrate:latest --knexfile server/database/knexfile.ts', {
    cwd: projectRoot,
    env: { ...process.env, DB_NAME: 'manufacturing_erp_test' },
    stdio: 'pipe',
  });
  console.log('[TEST] Migrations complete');
}, 120000);

afterAll(async () => {
  if (testDb) {
    await testDb.destroy();
    testDb = null;
    console.log('[TEST] Connection closed');
  }
});

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Truncate all transaction + master tables, leaving only schema.
 * Use between test suites that need a clean slate.
 */
export async function cleanAllData() {
  const db = getTestDb();
  const allTables = [...TRANSACTION_TABLES, ...MASTER_TABLES, ...CORE_TABLES];
  // Use TRUNCATE CASCADE for speed
  for (const table of allTables) {
    try {
      await db.raw(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch {
      // Table may not exist in some migration states — skip
    }
  }
}

/**
 * Truncate only transaction tables, preserving master data.
 */
export async function cleanTransactionData() {
  const db = getTestDb();
  for (const table of TRANSACTION_TABLES) {
    try {
      await db.raw(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch {
      // skip
    }
  }
}
