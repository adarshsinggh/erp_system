// =============================================================
// File: server/database/migrations/005_financial_accounting.ts
// Module: Financial & Accounting — Phase 9
// Description: Creates 4 tables:
//              chart_of_accounts, ledger_entries,
//              bank_accounts, bank_reconciliation.
//              (payment_receipts & payment_made already exist
//               from Phase 5/6 migrations.)
// =============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // 59. chart_of_accounts
  // Hierarchical chart of accounts. Double-entry backbone.
  // ============================================================
  await knex.schema.createTable('chart_of_accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('parent_id');
    t.string('account_code', 20).notNullable();
    t.string('account_name', 255).notNullable();
    t.string('account_type', 30).notNullable();
    t.string('account_group', 50).notNullable();
    t.boolean('is_system_account').notNullable().defaultTo(false);
    t.boolean('is_group').notNullable().defaultTo(false);
    t.decimal('opening_balance', 15, 2).defaultTo(0);
    t.string('opening_balance_type', 10).defaultTo('credit');
    t.integer('level').notNullable().defaultTo(0);
    t.text('path');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.timestamp('deleted_at', { useTz: true });
    t.uuid('deleted_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);

    t.unique(['company_id', 'account_code']);
    t.check(`account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')`, [], 'chk_coa_type');
    t.check(`account_group IN ('current_asset', 'fixed_asset', 'bank', 'cash', 'receivable', 'payable', 'income', 'cogs', 'direct_expense', 'indirect_expense', 'capital', 'reserve', 'loan', 'duty_tax', 'inventory', 'other')`, [], 'chk_coa_group');
    t.check(`opening_balance_type IN ('debit', 'credit')`, [], 'chk_coa_ob_type');
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_coa_sync');
  });

  // Self-referencing FK for parent
  await knex.schema.raw(`
    ALTER TABLE chart_of_accounts
    ADD CONSTRAINT fk_coa_parent FOREIGN KEY (parent_id) REFERENCES chart_of_accounts(id)
  `);

  await knex.schema.raw('CREATE INDEX idx_coa_company_id ON chart_of_accounts(company_id)');
  await knex.schema.raw('CREATE INDEX idx_coa_parent_id ON chart_of_accounts(parent_id) WHERE parent_id IS NOT NULL');
  await knex.schema.raw('CREATE INDEX idx_coa_type ON chart_of_accounts(company_id, account_type)');
  await knex.schema.raw('CREATE INDEX idx_coa_co ON chart_of_accounts(company_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_coa_upd BEFORE UPDATE ON chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_coa_ver BEFORE UPDATE ON chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 60. ledger_entries
  // Double-entry ledger. Debits = Credits per voucher. Append-only.
  // ============================================================
  await knex.schema.createTable('ledger_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.uuid('financial_year_id').notNullable().references('id').inTable('financial_years');
    t.string('voucher_type', 30).notNullable();
    t.string('voucher_number', 50).notNullable();
    t.date('voucher_date').notNullable();
    t.uuid('account_id').notNullable().references('id').inTable('chart_of_accounts');
    t.decimal('debit_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('credit_amount', 15, 2).notNullable().defaultTo(0);
    t.text('narration');
    t.string('reference_type', 50);
    t.uuid('reference_id');
    t.string('reference_number', 100);
    t.string('party_type', 20);
    t.uuid('party_id');
    t.string('cost_center', 100);
    t.boolean('is_posted').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);

    t.check(`voucher_type IN ('sales', 'purchase', 'receipt', 'payment', 'journal', 'contra')`, [], 'chk_le_voucher_type');
    t.check(`party_type IN ('customer', 'vendor')`, [], 'chk_le_party_type');
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_le_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_le_company_id ON ledger_entries(company_id)');
  await knex.schema.raw('CREATE INDEX idx_le_account_id ON ledger_entries(account_id)');
  await knex.schema.raw('CREATE INDEX idx_le_voucher ON ledger_entries(voucher_type, voucher_number)');
  await knex.schema.raw('CREATE INDEX idx_le_date ON ledger_entries(voucher_date)');
  await knex.schema.raw('CREATE INDEX idx_le_party ON ledger_entries(party_type, party_id) WHERE party_id IS NOT NULL');
  await knex.schema.raw('CREATE INDEX idx_le_reference ON ledger_entries(reference_type, reference_id) WHERE reference_id IS NOT NULL');
  await knex.schema.raw('CREATE INDEX idx_le_fy ON ledger_entries(financial_year_id)');

  await knex.schema.raw(`
    CREATE TRIGGER trg_le_upd BEFORE UPDATE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);

  // ============================================================
  // 63. bank_accounts
  // Company bank accounts for payment tracking & reconciliation.
  // ============================================================
  await knex.schema.createTable('bank_accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').references('id').inTable('branches');
    t.string('account_name', 255).notNullable();
    t.string('bank_name', 255).notNullable();
    t.string('account_number', 50).notNullable();
    t.string('ifsc_code', 11);
    t.string('branch_name', 255);
    t.string('account_type', 30).notNullable().defaultTo('current');
    t.uuid('ledger_account_id').references('id').inTable('chart_of_accounts');
    t.decimal('opening_balance', 15, 2).defaultTo(0);
    t.boolean('is_default').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.timestamp('deleted_at', { useTz: true });
    t.uuid('deleted_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);

    t.check(`account_type IN ('current', 'savings', 'od', 'cc')`, [], 'chk_ba_type');
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_ba_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_ba_company_id ON bank_accounts(company_id)');
  await knex.schema.raw('CREATE INDEX idx_ba_co ON bank_accounts(company_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_ba_upd BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_ba_ver BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 64. bank_reconciliation
  // Match bank statement entries with book entries.
  // ============================================================
  await knex.schema.createTable('bank_reconciliation', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('bank_account_id').notNullable().references('id').inTable('bank_accounts');
    t.date('statement_date').notNullable();
    t.string('statement_reference', 200);
    t.text('statement_description');
    t.decimal('statement_amount', 15, 2).notNullable();
    t.uuid('ledger_entry_id').references('id').inTable('ledger_entries');
    t.boolean('is_matched').notNullable().defaultTo(false);
    t.timestamp('matched_at', { useTz: true });
    t.uuid('matched_by');
    t.date('reconciliation_date');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.timestamp('deleted_at', { useTz: true });
    t.uuid('deleted_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);

    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_br_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_br_company_id ON bank_reconciliation(company_id)');
  await knex.schema.raw('CREATE INDEX idx_br_bank_acct ON bank_reconciliation(bank_account_id)');
  await knex.schema.raw('CREATE INDEX idx_br_unmatched ON bank_reconciliation(bank_account_id) WHERE is_matched = FALSE AND is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_br_upd BEFORE UPDATE ON bank_reconciliation
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_br_ver BEFORE UPDATE ON bank_reconciliation
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bank_reconciliation');
  await knex.schema.dropTableIfExists('bank_accounts');
  await knex.schema.dropTableIfExists('ledger_entries');
  await knex.schema.raw('ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS fk_coa_parent');
  await knex.schema.dropTableIfExists('chart_of_accounts');
}