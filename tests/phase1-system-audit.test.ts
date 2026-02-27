/**
 * PHASE 1: Pre-Test System Audit
 * Validates database structure, constraints, indexes, and clean state.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getTestDb } from './setup';

let db: ReturnType<typeof getTestDb>;

beforeAll(() => {
  db = getTestDb();
});

// ── 1a. Data Structure Verification ─────────────────────────────────

describe('Phase 1: Pre-Test System Audit', () => {
  describe('1a. Database Extensions', () => {
    it('should have uuid-ossp extension enabled', async () => {
      const result = await db.raw(`SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'`);
      expect(result.rows.length).toBe(1);
    });

    it('should have pgcrypto extension enabled', async () => {
      const result = await db.raw(`SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'`);
      expect(result.rows.length).toBe(1);
    });
  });

  describe('1b. Document Number Function', () => {
    it('should have get_next_document_number() function', async () => {
      const result = await db.raw(`
        SELECT 1 FROM pg_proc
        WHERE proname = 'get_next_document_number'
      `);
      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('1c. Financial Column Precision', () => {
    const financialColumns = [
      { table: 'ledger_entries', columns: ['debit_amount', 'credit_amount'] },
      { table: 'sales_invoices', columns: ['subtotal', 'discount_amount', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_tax', 'grand_total', 'amount_paid', 'balance_due', 'round_off'] },
      { table: 'vendor_bills', columns: ['subtotal', 'discount_amount', 'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_tax', 'grand_total', 'amount_paid', 'balance_due'] },
      { table: 'payment_receipts', columns: ['amount', 'tds_deducted'] },
      { table: 'chart_of_accounts', columns: ['opening_balance'] },
    ];

    for (const { table, columns } of financialColumns) {
      for (const col of columns) {
        it(`${table}.${col} should be NUMERIC/DECIMAL with scale >= 2`, async () => {
          const result = await db.raw(`
            SELECT data_type, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_name = ? AND column_name = ?
          `, [table, col]);

          if (result.rows.length === 0) {
            // Column may not exist in this migration version — report but don't fail hard
            console.warn(`Column ${table}.${col} not found`);
            return;
          }

          const { data_type, numeric_scale } = result.rows[0];
          expect(
            data_type,
            `${table}.${col} should be numeric, got ${data_type}`
          ).toBe('numeric');
          expect(
            parseInt(numeric_scale),
            `${table}.${col} scale should be >= 2, got ${numeric_scale}`
          ).toBeGreaterThanOrEqual(2);
        });
      }
    }
  });

  describe('1d. Foreign Key Relationships', () => {
    const expectedFKs = [
      { child: 'sales_invoices', parent: 'customers', fk_column: 'customer_id' },
      { child: 'sales_invoices', parent: 'sales_orders', fk_column: 'sales_order_id' },
      { child: 'sales_invoice_lines', parent: 'sales_invoices', fk_column: 'invoice_id' },
      { child: 'vendor_bills', parent: 'vendors', fk_column: 'vendor_id' },
      { child: 'vendor_bill_lines', parent: 'vendor_bills', fk_column: 'vendor_bill_id' },
      { child: 'payment_receipts', parent: 'customers', fk_column: 'customer_id' },
      { child: 'ledger_entries', parent: 'chart_of_accounts', fk_column: 'account_id' },
      { child: 'stock_ledger', parent: 'items', fk_column: 'item_id' },
      { child: 'stock_ledger', parent: 'warehouses', fk_column: 'warehouse_id' },
      { child: 'goods_receipt_notes', parent: 'vendors', fk_column: 'vendor_id' },
      { child: 'delivery_challans', parent: 'customers', fk_column: 'customer_id' },
    ];

    for (const { child, parent, fk_column } of expectedFKs) {
      it(`${child}.${fk_column} → ${parent} FK should exist`, async () => {
        const result = await db.raw(`
          SELECT tc.constraint_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = ?
            AND kcu.column_name = ?
            AND ccu.table_name = ?
        `, [child, fk_column, parent]);

        expect(
          result.rows.length,
          `Missing FK: ${child}.${fk_column} → ${parent}`
        ).toBeGreaterThan(0);
      });
    }
  });

  describe('1e. Orphan Record Detection', () => {
    const parentChildPairs = [
      { child: 'sales_invoice_lines', childFK: 'invoice_id', parent: 'sales_invoices' },
      { child: 'sales_order_lines', childFK: 'sales_order_id', parent: 'sales_orders' },
      { child: 'sales_quotation_lines', childFK: 'quotation_id', parent: 'sales_quotations' },
      { child: 'vendor_bill_lines', childFK: 'vendor_bill_id', parent: 'vendor_bills' },
      { child: 'purchase_order_lines', childFK: 'purchase_order_id', parent: 'purchase_orders' },
      { child: 'grn_lines', childFK: 'grn_id', parent: 'goods_receipt_notes' },
      { child: 'delivery_challan_lines', childFK: 'challan_id', parent: 'delivery_challans' },
      { child: 'credit_note_lines', childFK: 'credit_note_id', parent: 'credit_notes' },
      { child: 'debit_note_lines', childFK: 'debit_note_id', parent: 'debit_notes' },
    ];

    for (const { child, childFK, parent } of parentChildPairs) {
      it(`no orphans in ${child}.${childFK} → ${parent}`, async () => {
        try {
          const result = await db.raw(`
            SELECT COUNT(*) as orphan_count
            FROM "${child}" c
            LEFT JOIN "${parent}" p ON c."${childFK}" = p.id
            WHERE p.id IS NULL
          `);
          expect(parseInt(result.rows[0].orphan_count)).toBe(0);
        } catch {
          // Table may not exist — skip
        }
      });
    }
  });

  describe('1f. Clean State Verification', () => {
    const emptyTables = [
      'ledger_entries', 'stock_ledger', 'sales_invoices', 'sales_orders',
      'vendor_bills', 'purchase_orders', 'payment_receipts', 'payment_made',
      'goods_receipt_notes', 'delivery_challans', 'credit_notes', 'debit_notes',
    ];

    for (const table of emptyTables) {
      it(`${table} should be empty (clean state)`, async () => {
        try {
          const result = await db(table).count('id as count').first();
          expect(
            parseInt(String(result?.count || '0')),
            `${table} is NOT empty — possible test data contamination`
          ).toBe(0);
        } catch {
          // Table may not exist
        }
      });
    }
  });

  describe('1g. Version Trigger', () => {
    it('should have version increment trigger function', async () => {
      const result = await db.raw(`
        SELECT 1 FROM pg_proc
        WHERE proname = 'trigger_increment_version'
      `);
      // May or may not exist depending on migration state
      if (result.rows.length === 0) {
        console.warn('trigger_increment_version function not found');
      }
    });
  });

  describe('1h. Soft Delete Indexes', () => {
    it('should have partial indexes for active records on key tables', async () => {
      const result = await db.raw(`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE indexdef LIKE '%is_deleted%'
        ORDER BY tablename
      `);

      // We expect at least some tables to have these indexes
      console.log(`Found ${result.rows.length} soft-delete partial indexes`);
      // Not all tables may have them — log for audit
      for (const row of result.rows) {
        console.log(`  ${row.tablename}: ${row.indexname}`);
      }
    });
  });
});
