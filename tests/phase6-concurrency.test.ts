/**
 * PHASE 6: Concurrency & Stress Testing
 * Tests parallel operations for race conditions, duplicates, and deadlocks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, cleanAllData } from './setup';
import {
  createTestEnvironment, createCustomer, createItem, createProduct,
  TestEnv, resetCounters,
} from './helpers/factory';
import { assertAllVouchersBalanced, assertStockBalance } from './helpers/assertions';

import { salesInvoiceService } from '../server/services/sales-invoice.service';
import { inventoryService } from '../server/services/inventory.service';
import { ledgerService } from '../server/services/ledger.service';

let env: TestEnv;
let db: ReturnType<typeof getTestDb>;
let customer: any;
let product: any;
let item: any;

beforeAll(async () => {
  db = getTestDb();
  await cleanAllData();
  resetCounters();
  env = await createTestEnvironment();

  customer = await createCustomer(env.company.id, { name: 'Concurrent Test Customer' });
  item = await createItem(env.company.id, env.uom.id, { name: 'Concurrent Item' });
  product = await createProduct(env.company.id, env.uom.id, {
    name: 'Concurrent Product',
    selling_price: 1000,
    gst_rate: 18,
  });

  // Opening stock
  await inventoryService.recordMovement({
    company_id: env.company.id,
    branch_id: env.branch.id,
    item_id: item.id,
    warehouse_id: env.warehouse.id,
    transaction_type: 'adjustment',
    transaction_date: '2025-06-01',
    direction: 'in',
    quantity: 10000,
    uom_id: env.uom.id,
    unit_cost: 100,
    reference_type: 'adjustment',
    reference_id: item.id,
    narration: 'opening_stock',
    created_by: env.user.id,
  });
}, 60000);

afterAll(async () => {
  await cleanAllData();
});

describe('Phase 6: Concurrency & Stress Testing', () => {

  describe('6a. Parallel Invoice Creation', () => {
    it('should create 10 invoices concurrently with unique numbers', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        salesInvoiceService.createInvoice({
          company_id: env.company.id,
          branch_id: env.branch.id,
          invoice_date: '2025-06-15',
          customer_id: customer.id,
          lines: [
            { line_number: 1, product_id: product.id, quantity: 1, uom_id: env.uom.id, unit_price: 1000 + i },
          ],
          created_by: env.user.id,
        })
      );

      const results = await Promise.allSettled(promises);
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      console.log(`Parallel invoices: ${successes.length} succeeded, ${failures.length} failed`);

      // All should succeed
      expect(successes.length).toBe(10);

      // Verify unique invoice numbers
      const invoiceNumbers = successes.map((r: any) => r.value.invoice_number);
      const uniqueNumbers = new Set(invoiceNumbers);
      expect(uniqueNumbers.size).toBe(10);
    });
  });

  describe('6b. Parallel Stock Updates', () => {
    it('should handle 10 concurrent stock movements without corruption', async () => {
      const initialBalance = await inventoryService.getStockBalance(
        env.company.id, env.warehouse.id, item.id
      );
      const initialQty = parseFloat(initialBalance.available_quantity);

      const movements = Array.from({ length: 10 }, (_, i) =>
        inventoryService.recordMovement({
          company_id: env.company.id,
          branch_id: env.branch.id,
          item_id: item.id,
          warehouse_id: env.warehouse.id,
          transaction_type: 'adjustment',
          transaction_date: '2025-06-01',
          direction: 'in',
          quantity: 10,
          uom_id: env.uom.id,
          unit_cost: 100,
          reference_type: 'adjustment',
          reference_id: item.id,
          narration: 'concurrent_test',
          created_by: env.user.id,
        })
      );

      const results = await Promise.allSettled(movements);
      const successes = results.filter(r => r.status === 'fulfilled');
      console.log(`Parallel stock updates: ${successes.length}/10 succeeded`);

      // Verify final balance = initial + (successes * 10)
      const finalBalance = await inventoryService.getStockBalance(
        env.company.id, env.warehouse.id, item.id
      );
      const finalQty = parseFloat(finalBalance.available_quantity);
      const expectedQty = initialQty + (successes.length * 10);

      expect(Math.abs(finalQty - expectedQty)).toBeLessThanOrEqual(0.01);
    });
  });

  describe('6c. Parallel Ledger Entries', () => {
    it('should create 5 journal entries concurrently with unique voucher numbers', async () => {
      const cashAccount = await db('chart_of_accounts')
        .where({ company_id: env.company.id, account_code: '1110', is_deleted: false })
        .first();
      const revenueAccount = await db('chart_of_accounts')
        .where({ company_id: env.company.id, account_code: '4100', is_deleted: false })
        .first();

      const promises = Array.from({ length: 5 }, (_, i) =>
        ledgerService.createVoucher({
          company_id: env.company.id,
          branch_id: env.branch.id,
          voucher_type: 'journal',
          voucher_date: '2025-06-15',
          narration: `Concurrent journal ${i}`,
          lines: [
            { account_id: cashAccount.id, debit_amount: 1000 + i, credit_amount: 0 },
            { account_id: revenueAccount.id, debit_amount: 0, credit_amount: 1000 + i },
          ],
          created_by: env.user.id,
        })
      );

      const results = await Promise.allSettled(promises);
      const successes = results.filter(r => r.status === 'fulfilled');
      console.log(`Parallel journals: ${successes.length}/5 succeeded`);

      // Verify unique voucher numbers
      const voucherNumbers = successes.map((r: any) => r.value.voucher_number);
      const uniqueNumbers = new Set(voucherNumbers);
      expect(uniqueNumbers.size).toBe(successes.length);

      // All should be balanced
      for (const vn of voucherNumbers) {
        await assertAllVouchersBalanced(env.company.id);
      }
    });
  });

  describe('6d. No Deadlocks Under Load', () => {
    it('should survive mixed concurrent operations', async () => {
      const cashAccount = await db('chart_of_accounts')
        .where({ company_id: env.company.id, account_code: '1110', is_deleted: false })
        .first();
      const revenueAccount = await db('chart_of_accounts')
        .where({ company_id: env.company.id, account_code: '4100', is_deleted: false })
        .first();

      // Mix of invoices + stock movements + journal entries
      const operations = [
        // 3 invoices
        ...Array.from({ length: 3 }, (_, i) =>
          salesInvoiceService.createInvoice({
            company_id: env.company.id,
            branch_id: env.branch.id,
            invoice_date: '2025-06-20',
            customer_id: customer.id,
            lines: [
              { line_number: 1, product_id: product.id, quantity: 1, uom_id: env.uom.id, unit_price: 500 + i },
            ],
            created_by: env.user.id,
          })
        ),
        // 3 stock movements
        ...Array.from({ length: 3 }, (_, i) =>
          inventoryService.recordMovement({
            company_id: env.company.id,
            branch_id: env.branch.id,
            item_id: item.id,
            warehouse_id: env.warehouse.id,
            transaction_type: 'adjustment',
            transaction_date: '2025-06-01',
            direction: 'in',
            quantity: 5,
            uom_id: env.uom.id,
            unit_cost: 100,
            reference_type: 'adjustment',
            reference_id: item.id,
            narration: 'mixed_test',
            created_by: env.user.id,
          })
        ),
        // 3 journals
        ...Array.from({ length: 3 }, (_, i) =>
          ledgerService.createVoucher({
            company_id: env.company.id,
            branch_id: env.branch.id,
            voucher_type: 'journal',
            voucher_date: '2025-06-20',
            narration: `Mixed concurrent ${i}`,
            lines: [
              { account_id: cashAccount.id, debit_amount: 500 + i, credit_amount: 0 },
              { account_id: revenueAccount.id, debit_amount: 0, credit_amount: 500 + i },
            ],
            created_by: env.user.id,
          })
        ),
      ];

      const results = await Promise.allSettled(operations);
      const successes = results.filter(r => r.status === 'fulfilled');
      const deadlocks = results.filter(r =>
        r.status === 'rejected' && (r.reason?.message || '').includes('deadlock')
      );

      console.log(`Mixed ops: ${successes.length}/9 succeeded, ${deadlocks.length} deadlocks`);
      expect(deadlocks.length).toBe(0);
    });
  });
});
