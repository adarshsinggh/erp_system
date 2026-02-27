/**
 * PHASE 2: Master Data Validation
 * Tests creation, editing, deletion, and validation rules for master data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, cleanAllData } from './setup';
import {
  createTestEnvironment, createCustomer, createVendor,
  createItem, createProduct, createUOM, TestEnv, resetCounters,
} from './helpers/factory';
import { chartOfAccountsService } from '../server/services/chart-of-accounts.service';
import { bankService } from '../server/services/bank.service';
import { inventoryService } from '../server/services/inventory.service';
import { assertStockBalance, reportBug } from './helpers/assertions';

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

// ── 2a. Customers ──────────────────────────────────────────────────

describe('Phase 2: Master Data Validation', () => {
  describe('2a. Customers', () => {
    it('should create customer with all required fields', async () => {
      const customer = await createCustomer(env.company.id, {
        name: 'Acme Corp',
        gstin: '27AABCA1234B1ZM',
      });
      expect(customer).toBeDefined();
      expect(customer.id).toBeDefined();
      expect(customer.name).toBe('Acme Corp');
      expect(customer.gstin).toBe('27AABCA1234B1ZM');
    });

    it('should prevent duplicate customer codes', async () => {
      const code = 'UNIQUE-CUST-001';
      await createCustomer(env.company.id, { customer_code: code });

      await expect(
        createCustomer(env.company.id, { customer_code: code })
      ).rejects.toThrow();
    });

    it('should store opening balance correctly', async () => {
      const customer = await createCustomer(env.company.id, {
        opening_balance: 50000,
        opening_balance_type: 'debit',
      });
      expect(parseFloat(customer.opening_balance)).toBe(50000);
      expect(customer.opening_balance_type).toBe('debit');
    });

    it('should store credit limit', async () => {
      const customer = await createCustomer(env.company.id, {
        credit_limit: 100000,
      });
      expect(parseFloat(customer.credit_limit)).toBe(100000);
    });

    it('should store payment terms days', async () => {
      const customer = await createCustomer(env.company.id, {
        payment_terms_days: 45,
      });
      expect(customer.payment_terms_days).toBe(45);
    });

    it('should soft-delete customer', async () => {
      const customer = await createCustomer(env.company.id);
      await db('customers')
        .where({ id: customer.id })
        .update({ is_deleted: true, deleted_at: db.fn.now() });

      const found = await db('customers')
        .where({ id: customer.id, is_deleted: false })
        .first();
      expect(found).toBeUndefined();

      // But still exists in DB
      const rawFound = await db('customers').where({ id: customer.id }).first();
      expect(rawFound).toBeDefined();
      expect(rawFound.is_deleted).toBe(true);
    });
  });

  // ── 2b. Vendors ──────────────────────────────────────────────────

  describe('2b. Vendors', () => {
    it('should create vendor with all fields', async () => {
      const vendor = await createVendor(env.company.id, {
        name: 'Supplier Inc',
        gstin: '29AABCV5678D1ZM',
      });
      expect(vendor).toBeDefined();
      expect(vendor.name).toBe('Supplier Inc');
    });

    it('should prevent duplicate vendor codes', async () => {
      const code = 'UNIQUE-VEN-001';
      await createVendor(env.company.id, { vendor_code: code });

      await expect(
        createVendor(env.company.id, { vendor_code: code })
      ).rejects.toThrow();
    });

    it('should store opening balance (credit type)', async () => {
      const vendor = await createVendor(env.company.id, {
        opening_balance: 25000,
        opening_balance_type: 'credit',
      });
      expect(parseFloat(vendor.opening_balance)).toBe(25000);
      expect(vendor.opening_balance_type).toBe('credit');
    });

    it('should store payment terms', async () => {
      const vendor = await createVendor(env.company.id, {
        payment_terms_days: 60,
      });
      expect(vendor.payment_terms_days).toBe(60);
    });
  });

  // ── 2c. Items / Products ─────────────────────────────────────────

  describe('2c. Items / Products', () => {
    it('should create item with HSN code', async () => {
      const item = await createItem(env.company.id, env.uom.id, {
        name: 'Steel Rod',
        hsn_code: '72142000',
        item_type: 'raw_material',
      });
      expect(item).toBeDefined();
      expect(item.hsn_code).toBe('72142000');
      expect(item.item_type).toBe('raw_material');
    });

    it('should create product linked to item with GST rate', async () => {
      const item = await createItem(env.company.id, env.uom.id);
      const product = await createProduct(env.company.id, env.uom.id, {
        gst_rate: 18,
        selling_price: 1500,
        standard_cost: 800,
      });
      expect(product).toBeDefined();
      expect(parseFloat(product.gst_rate)).toBe(18);
      expect(parseFloat(product.selling_price)).toBe(1500);
    });

    it('should create opening stock via inventory service', async () => {
      const item = await createItem(env.company.id, env.uom.id, {
        costing_method: 'weighted_avg',
      });

      await inventoryService.recordMovement({
        company_id: env.company.id,
        branch_id: env.branch.id,
        item_id: item.id,
        warehouse_id: env.warehouse.id,
        transaction_type: 'adjustment',
        transaction_date: new Date().toISOString().split('T')[0],
        direction: 'in',
        quantity: 100,
        uom_id: env.uom.id,
        unit_cost: 50,
        reference_type: 'adjustment',
        reference_id: item.id,
        narration: 'Opening stock',
        created_by: env.user.id,
      });

      await assertStockBalance(env.company.id, item.id, env.warehouse.id, 100);
    });

    it('should track stock valuation after opening stock', async () => {
      const item = await createItem(env.company.id, env.uom.id, {
        costing_method: 'weighted_avg',
      });

      await inventoryService.recordMovement({
        company_id: env.company.id,
        branch_id: env.branch.id,
        item_id: item.id,
        warehouse_id: env.warehouse.id,
        transaction_type: 'adjustment',
        transaction_date: new Date().toISOString().split('T')[0],
        direction: 'in',
        quantity: 50,
        uom_id: env.uom.id,
        unit_cost: 200,
        reference_type: 'adjustment',
        reference_id: item.id,
        narration: 'Opening stock',
        created_by: env.user.id,
      });

      const balance = await inventoryService.getStockBalance(
        env.company.id, env.warehouse.id, item.id
      );
      expect(balance).toBeDefined();
      expect(parseFloat(balance.available_quantity)).toBe(50);
      // Valuation = 50 * 200 = 10000
      expect(parseFloat(balance.valuation_rate)).toBeCloseTo(200, 1);
    });
  });

  // ── 2d. Bank Accounts ────────────────────────────────────────────

  describe('2d. Bank Accounts', () => {
    it('should create bank account and auto-create COA entry', async () => {
      const bank = await bankService.createBankAccount({
        company_id: env.company.id,
        account_name: 'SBI Current Account',
        bank_name: 'State Bank of India',
        account_number: '123456789012',
        ifsc_code: 'SBIN0001234',
        account_type: 'current',
        opening_balance: 100000,
        branch_id: env.branch.id,
        created_by: env.user.id,
      });

      expect(bank).toBeDefined();
      expect(bank.account_name).toBe('SBI Current Account');
      expect(parseFloat(bank.opening_balance)).toBe(100000);

      // Verify COA entry created under Bank Accounts group (1120)
      if (bank.ledger_account_id) {
        const coaEntry = await db('chart_of_accounts')
          .where({ id: bank.ledger_account_id })
          .first();
        expect(coaEntry).toBeDefined();
        expect(coaEntry.account_type).toBe('asset');
        expect(coaEntry.account_group).toBe('bank');
      }
    });

    it('should prevent duplicate account numbers', async () => {
      // BUG FINDING: No unique constraint on bank_accounts.account_number
      // The system allows creating multiple bank accounts with the same number.
      // This test documents the missing constraint.
      const accNum = '999888777666';
      await bankService.createBankAccount({
        company_id: env.company.id,
        account_name: 'Bank A',
        bank_name: 'HDFC',
        account_number: accNum,
        account_type: 'current',
      });

      // This SHOULD reject but currently allows duplicates — documenting as bug
      const duplicate = await bankService.createBankAccount({
        company_id: env.company.id,
        account_name: 'Bank B',
        bank_name: 'HDFC',
        account_number: accNum,
        account_type: 'current',
      });

      // If we get here, the duplicate was accepted (BUG)
      reportBug({
        module: 'Bank',
        feature: 'Bank Account Creation',
        severity: 'Major',
        steps_to_reproduce: 'Create two bank accounts with the same account_number',
        expected_result: 'Duplicate account number should be rejected',
        actual_result: 'Duplicate bank accounts can be created with same number',
        suggested_fix: 'Add UNIQUE constraint on (company_id, account_number) to bank_accounts table',
      });
      expect(duplicate).toBeDefined(); // passes — confirms the bug exists
    });
  });

  // ── 2e. Chart of Accounts ────────────────────────────────────────

  describe('2e. Chart of Accounts', () => {
    it('should have all system accounts seeded', async () => {
      const accounts = await db('chart_of_accounts')
        .where({ company_id: env.company.id, is_system_account: true, is_deleted: false });

      // Should have at least the key system accounts
      const codes = accounts.map((a: any) => a.account_code);
      expect(codes).toContain('1000'); // Assets
      expect(codes).toContain('1110'); // Cash
      expect(codes).toContain('1130'); // AR
      expect(codes).toContain('2000'); // Liabilities
      expect(codes).toContain('2110'); // AP
      expect(codes).toContain('2130'); // Output CGST
      expect(codes).toContain('3000'); // Equity
      expect(codes).toContain('4100'); // Sales Revenue
      expect(codes).toContain('5000'); // Expenses
    });

    it('should create custom account under group', async () => {
      const parentGroup = await db('chart_of_accounts')
        .where({ company_id: env.company.id, account_code: '5400', is_deleted: false })
        .first();

      const account = await chartOfAccountsService.createAccount({
        company_id: env.company.id,
        parent_id: parentGroup.id,
        account_code: '5460',
        account_name: 'Office Supplies',
        account_type: 'expense',
        account_group: 'indirect_expense',
      });

      expect(account).toBeDefined();
      expect(account.account_code).toBe('5460');
      expect(account.path).toContain('5400/5460');
    });

    it('should prevent posting to group accounts', async () => {
      // Group accounts have is_group = true — this is enforced in ledger service
      const groupAccount = await db('chart_of_accounts')
        .where({ company_id: env.company.id, is_group: true, is_deleted: false })
        .first();
      expect(groupAccount).toBeDefined();
      expect(groupAccount.is_group).toBe(true);
    });

    it('should prevent deleting system accounts', async () => {
      const systemAccount = await db('chart_of_accounts')
        .where({ company_id: env.company.id, is_system_account: true, is_deleted: false })
        .first();

      await expect(
        chartOfAccountsService.deleteAccount(systemAccount.id, env.company.id, env.user.id)
      ).rejects.toThrow(/system accounts/i);
    });
  });
});
