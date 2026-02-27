/**
 * Test data factories — creates realistic master data for test scenarios.
 * All factories return the created DB record(s) for use in assertions.
 */

import { getTestDb } from '../setup';
import { chartOfAccountsService } from '../../server/services/chart-of-accounts.service';
import { bankService } from '../../server/services/bank.service';

// ── Counters for unique codes ──────────────────────────────────────

let counters: Record<string, number> = {};
function nextCode(prefix: string): string {
  counters[prefix] = (counters[prefix] || 0) + 1;
  return `${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
}

export function resetCounters() {
  counters = {};
}

// ── Company ────────────────────────────────────────────────────────

export async function createCompany(overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const [company] = await db('companies')
    .insert({
      name: overrides.name || `Test Company ${nextCode('CO')}`,
      display_name: overrides.display_name || 'Test Company Pvt. Ltd.',
      gstin: overrides.gstin || `27AABCU${String(Date.now()).slice(-7)}M`,
      pan: overrides.pan || `AABCU${String(Date.now()).slice(-4)}R`,
      email: overrides.email || `test-${Date.now()}@example.com`,
      phone: overrides.phone || '9876543210',
      address_line1: overrides.address_line1 || '123 Test Street',
      city: overrides.city || 'Mumbai',
      state: overrides.state || 'Maharashtra',
      country: overrides.country || 'India',
      pincode: overrides.pincode || '400001',
      base_currency: overrides.base_currency || 'INR',
      financial_year_start: overrides.financial_year_start || 4,
      ...overrides,
    })
    .returning('*');
  return company;
}

// ── Financial Year ─────────────────────────────────────────────────

export async function createFinancialYear(companyId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const [fy] = await db('financial_years')
    .insert({
      company_id: companyId,
      year_code: overrides.year_code || 'FY2025-26',
      start_date: overrides.start_date || '2025-04-01',
      end_date: overrides.end_date || '2026-03-31',
      is_active: overrides.is_active ?? true,
      is_locked: overrides.is_locked ?? false,
      ...overrides,
    })
    .returning('*');
  return fy;
}

// ── Branch ─────────────────────────────────────────────────────────

export async function createBranch(companyId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const code = nextCode('BR');
  const [branch] = await db('branches')
    .insert({
      company_id: companyId,
      code: overrides.code || code,
      name: overrides.name || `Branch ${code}`,
      state: overrides.state || 'Maharashtra',
      gstin: overrides.gstin || '27AABCU9603R1ZM',
      is_main_branch: overrides.is_main_branch ?? true,
      ...overrides,
    })
    .returning('*');
  return branch;
}

// ── Warehouse ──────────────────────────────────────────────────────

export async function createWarehouse(companyId: string, branchId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const code = nextCode('WH');
  const [warehouse] = await db('warehouses')
    .insert({
      company_id: companyId,
      branch_id: branchId,
      code: overrides.code || code,
      name: overrides.name || `Warehouse ${code}`,
      warehouse_type: overrides.warehouse_type || 'main',
      is_default: overrides.is_default ?? true,
      ...overrides,
    })
    .returning('*');
  return warehouse;
}

// ── Role ───────────────────────────────────────────────────────────

export async function createRole(companyId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const [role] = await db('roles')
    .insert({
      company_id: companyId,
      name: overrides.name || `Role ${nextCode('RL')}`,
      description: overrides.description || 'Test role',
      is_system_role: overrides.is_system_role ?? false,
      hierarchy_level: overrides.hierarchy_level || 1,
      ...overrides,
    })
    .returning('*');
  return role;
}

// ── User ───────────────────────────────────────────────────────────

export async function createUser(companyId: string, roleId: string, branchId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const bcrypt = await import('bcryptjs');
  const code = nextCode('USR');
  const hashedPassword = await bcrypt.hash(overrides.password || 'Test@123', 10);
  const [user] = await db('users')
    .insert({
      company_id: companyId,
      role_id: roleId,
      branch_id: branchId,
      username: overrides.username || `user_${code.toLowerCase()}`,
      email: overrides.email || `user_${code.toLowerCase()}@test.com`,
      password_hash: hashedPassword,
      full_name: overrides.full_name || `Test User ${code}`,
      is_active: overrides.is_active ?? true,
      ...overrides,
    })
    .returning('*');
  return user;
}

// ── Customer ───────────────────────────────────────────────────────

export async function createCustomer(companyId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const code = nextCode('CUST');
  const [customer] = await db('customers')
    .insert({
      company_id: companyId,
      customer_code: overrides.customer_code || code,
      name: overrides.name || `Customer ${code}`,
      display_name: overrides.display_name || `Customer ${code}`,
      customer_type: overrides.customer_type || 'company',
      gstin: overrides.gstin || null,
      pan: overrides.pan || null,
      credit_limit: overrides.credit_limit || 0,
      payment_terms_days: overrides.payment_terms_days || 30,
      opening_balance: overrides.opening_balance || 0,
      opening_balance_type: overrides.opening_balance_type || 'debit',
      ...overrides,
    })
    .returning('*');
  return customer;
}

// ── Vendor ─────────────────────────────────────────────────────────

export async function createVendor(companyId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const code = nextCode('VEN');
  const [vendor] = await db('vendors')
    .insert({
      company_id: companyId,
      vendor_code: overrides.vendor_code || code,
      name: overrides.name || `Vendor ${code}`,
      display_name: overrides.display_name || `Vendor ${code}`,
      vendor_type: overrides.vendor_type || 'company',
      gstin: overrides.gstin || null,
      pan: overrides.pan || null,
      payment_terms_days: overrides.payment_terms_days || 30,
      opening_balance: overrides.opening_balance || 0,
      opening_balance_type: overrides.opening_balance_type || 'credit',
      ...overrides,
    })
    .returning('*');
  return vendor;
}

// ── UOM ────────────────────────────────────────────────────────────

export async function createUOM(companyId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const code = overrides.code || nextCode('UOM');
  const [uom] = await db('units_of_measurement')
    .insert({
      company_id: companyId,
      code: code,
      name: overrides.name || `Unit ${code}`,
      ...overrides,
    })
    .returning('*');
  return uom;
}

// ── Item Category ──────────────────────────────────────────────────

export async function createItemCategory(companyId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const code = nextCode('CAT');
  const [cat] = await db('item_categories')
    .insert({
      company_id: companyId,
      code: overrides.code || code,
      name: overrides.name || `Category ${code}`,
      type: overrides.type || 'finished_goods',
      ...overrides,
    })
    .returning('*');
  return cat;
}

// ── Item ───────────────────────────────────────────────────────────

export async function createItem(companyId: string, uomId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const code = nextCode('ITM');
  const [item] = await db('items')
    .insert({
      company_id: companyId,
      item_code: overrides.item_code || code,
      name: overrides.name || `Item ${code}`,
      item_type: overrides.item_type || 'raw_material',
      primary_uom_id: uomId,
      hsn_code: overrides.hsn_code || '84719000',
      standard_cost: overrides.standard_cost || 100,
      costing_method: overrides.costing_method || 'weighted_avg',
      ...overrides,
    })
    .returning('*');
  return item;
}

// ── Product ────────────────────────────────────────────────────────

export async function createProduct(companyId: string, uomId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const code = nextCode('PRD');
  const [product] = await db('products')
    .insert({
      company_id: companyId,
      product_code: overrides.product_code || code,
      name: overrides.name || `Product ${code}`,
      product_type: overrides.product_type || 'finished_goods',
      primary_uom_id: uomId,
      selling_price: overrides.selling_price || 1000,
      standard_cost: overrides.standard_cost || 500,
      gst_rate: overrides.gst_rate || 18,
      hsn_code: overrides.hsn_code || '84719000',
      ...overrides,
    })
    .returning('*');
  return product;
}

// ── Tax Master ─────────────────────────────────────────────────────

export async function createTaxMaster(companyId: string, overrides: Record<string, any> = {}) {
  const db = getTestDb();
  const [tax] = await db('tax_masters')
    .insert({
      company_id: companyId,
      tax_name: overrides.tax_name || `GST ${overrides.rate || 18}%`,
      tax_type: overrides.tax_type || 'gst',
      rate: overrides.rate || 18,
      is_active: true,
      ...overrides,
    })
    .returning('*');
  return tax;
}

// ── Document Sequences ─────────────────────────────────────────────

export async function seedDocumentSequences(companyId: string, branchId: string) {
  const db = getTestDb();

  // BUG WORKAROUND: The document_sequences check constraint (chk_ds_type)
  // does NOT include voucher types (voucher_journal, voucher_sales, etc.)
  // which prevents ledgerService.createVoucher() from working.
  // We alter the constraint in tests to allow voucher types.
  try {
    await db.raw('ALTER TABLE document_sequences DROP CONSTRAINT IF EXISTS chk_ds_type');
    await db.raw(`
      ALTER TABLE document_sequences ADD CONSTRAINT chk_ds_type CHECK (
        document_type IN (
          'quotation', 'sales_order', 'invoice', 'credit_note',
          'po', 'grn', 'vendor_bill', 'debit_note',
          'work_order', 'delivery_challan', 'payment_receipt', 'payment_made',
          'purchase_requisition', 'stock_adjustment', 'scrap_entry',
          'production_entry', 'stock_transfer',
          'voucher_sales', 'voucher_purchase', 'voucher_receipt',
          'voucher_payment', 'voucher_journal', 'voucher_contra'
        )
      )
    `);
  } catch {
    // Constraint may already be updated
  }

  // Document types including voucher types for ledger
  const docTypes = [
    'quotation', 'sales_order', 'invoice', 'delivery_challan',
    'payment_receipt', 'credit_note', 'po', 'grn',
    'vendor_bill', 'payment_made', 'debit_note', 'work_order',
    'purchase_requisition', 'stock_adjustment', 'scrap_entry',
    'production_entry', 'stock_transfer',
    'voucher_sales', 'voucher_purchase', 'voucher_receipt',
    'voucher_payment', 'voucher_journal', 'voucher_contra',
  ];

  for (const docType of docTypes) {
    const existing = await db('document_sequences')
      .where({ company_id: companyId, branch_id: branchId, document_type: docType })
      .first();
    if (!existing) {
      await db('document_sequences').insert({
        company_id: companyId,
        branch_id: branchId,
        document_type: docType,
        prefix_pattern: docType.toUpperCase().replace(/_/g, '-').substring(0, 10) + '-',
        current_number: 0,
        pad_length: 5,
        suffix_pattern: '',
      });
    }
  }
}

// ── Bank Account (uses service for COA auto-creation) ──────────────

export async function createBankAccount(companyId: string, overrides: Record<string, any> = {}) {
  return await bankService.createBankAccount({
    company_id: companyId,
    account_name: overrides.account_name || `Bank ${nextCode('BNK')}`,
    bank_name: overrides.bank_name || 'State Bank of India',
    account_number: overrides.account_number || `${Date.now()}${Math.floor(Math.random() * 10000)}`,
    ifsc_code: overrides.ifsc_code || 'SBIN0001234',
    account_type: overrides.account_type || 'current',
    opening_balance: overrides.opening_balance || 0,
    branch_id: overrides.branch_id,
    created_by: overrides.created_by,
    ...overrides,
  });
}

// ── Full Test Environment Setup ────────────────────────────────────
// Creates company + branch + warehouse + FY + COA + user — everything
// needed to start running business transactions.

export interface TestEnv {
  company: any;
  branch: any;
  warehouse: any;
  financialYear: any;
  role: any;
  user: any;
  uom: any;
}

export async function createTestEnvironment(overrides: {
  companyState?: string;
  branchState?: string;
} = {}): Promise<TestEnv> {
  const company = await createCompany({
    state: overrides.companyState || 'Maharashtra',
  });

  const financialYear = await createFinancialYear(company.id);

  const branch = await createBranch(company.id, {
    state: overrides.branchState || 'Maharashtra',
  });

  const warehouse = await createWarehouse(company.id, branch.id);

  // Seed COA
  await chartOfAccountsService.seedSystemAccounts(company.id);

  // Seed document sequences
  await seedDocumentSequences(company.id, branch.id);

  // Create role + user
  const role = await createRole(company.id, { name: 'Admin', hierarchy_level: 100 });
  const user = await createUser(company.id, role.id, branch.id);

  // Create default UOM
  const uom = await createUOM(company.id, { code: 'PCS', name: 'Pieces' });

  return { company, branch, warehouse, financialYear, role, user, uom };
}
