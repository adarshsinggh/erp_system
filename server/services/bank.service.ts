// =============================================================
// File: server/services/bank.service.ts
// Module: Financial & Accounting — Phase 9, Step 39
// Description: Bank & Cash Management service.
//   - Bank account CRUD with auto-linked COA ledger account
//   - Bank balance calculation from ledger entries
//   - Bank reconciliation: import statements, match with ledger
//   - Reconciliation summary (matched vs unmatched)
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { chartOfAccountsService } from './chart-of-accounts.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface CreateBankAccountInput {
  company_id: string;
  branch_id?: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  ifsc_code?: string;
  branch_name?: string;
  account_type?: 'current' | 'savings' | 'od' | 'cc';
  opening_balance?: number;
  is_default?: boolean;
  created_by?: string;
}

export interface UpdateBankAccountInput {
  account_name?: string;
  bank_name?: string;
  ifsc_code?: string;
  branch_name?: string;
  account_type?: 'current' | 'savings' | 'od' | 'cc';
  is_default?: boolean;
  is_active?: boolean;
  updated_by?: string;
}

export interface CreateReconciliationInput {
  company_id: string;
  bank_account_id: string;
  statement_date: string;
  statement_reference?: string;
  statement_description?: string;
  statement_amount: number;
  created_by?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function round2(n: number): number { return Math.round(n * 100) / 100; }
function parseNum(val: any): number { return parseFloat(val) || 0; }

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class BankService extends BaseService {
  constructor() {
    super('bank_accounts');
  }

  // ──────── CREATE BANK ACCOUNT ────────
  // Auto-creates a corresponding COA ledger account under "Bank Accounts" group.

  async createBankAccount(input: CreateBankAccountInput) {
    return await this.db.transaction(async (trx) => {
      // If setting as default, unset other defaults
      if (input.is_default) {
        await trx('bank_accounts')
          .where({ company_id: input.company_id, is_default: true })
          .update({ is_default: false });
      }

      // Find or create COA ledger account for this bank
      const parentBankGroup = await trx('chart_of_accounts')
        .where({ company_id: input.company_id, account_code: '1120', is_deleted: false })
        .first();

      let ledgerAccountId: string | null = null;

      if (parentBankGroup) {
        // Generate unique account code
        const lastChild = await trx('chart_of_accounts')
          .where({ company_id: input.company_id, parent_id: parentBankGroup.id, is_deleted: false })
          .orderBy('account_code', 'desc')
          .first();

        let nextCode = '1121';
        if (lastChild) {
          const lastNum = parseInt(lastChild.account_code, 10);
          nextCode = String(lastNum + 1);
        }

        const [coaAccount] = await trx('chart_of_accounts')
          .insert({
            company_id: input.company_id,
            parent_id: parentBankGroup.id,
            account_code: nextCode,
            account_name: `${input.bank_name} - ${input.account_number.slice(-4)}`,
            account_type: 'asset',
            account_group: 'bank',
            is_system_account: false,
            is_group: false,
            opening_balance: input.opening_balance || 0,
            opening_balance_type: 'debit',
            level: parentBankGroup.level + 1,
            path: (parentBankGroup.path || '1120') + '/' + nextCode,
            is_active: true,
            created_by: input.created_by || null,
          })
          .returning('*');

        ledgerAccountId = coaAccount.id;
      }

      // Insert bank account
      const [bankAccount] = await trx('bank_accounts')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id || null,
          account_name: input.account_name,
          bank_name: input.bank_name,
          account_number: input.account_number,
          ifsc_code: input.ifsc_code || null,
          branch_name: input.branch_name || null,
          account_type: input.account_type || 'current',
          ledger_account_id: ledgerAccountId,
          opening_balance: input.opening_balance || 0,
          is_default: input.is_default || false,
          is_active: true,
          created_by: input.created_by || null,
        })
        .returning('*');

      return bankAccount;
    });
  }

  // ──────── LIST BANK ACCOUNTS ────────

  async listBankAccounts(companyId: string, options: {
    branch_id?: string;
    account_type?: string;
    is_active?: boolean;
  } = {}) {
    let query = this.db('bank_accounts as ba')
      .leftJoin('branches as b', 'ba.branch_id', 'b.id')
      .leftJoin('chart_of_accounts as coa', 'ba.ledger_account_id', 'coa.id')
      .where('ba.company_id', companyId)
      .andWhere('ba.is_deleted', false);

    if (options.branch_id) query = query.where('ba.branch_id', options.branch_id);
    if (options.account_type) query = query.where('ba.account_type', options.account_type);
    if (options.is_active !== undefined) query = query.where('ba.is_active', options.is_active);

    const data = await query
      .select(
        'ba.*',
        'b.name as branch_name_display',
        'coa.account_code as ledger_code',
        'coa.account_name as ledger_name'
      )
      .orderBy('ba.is_default', 'desc')
      .orderBy('ba.bank_name');

    return data;
  }

  // ──────── GET WITH BALANCE ────────

  async getBankAccountWithBalance(id: string, companyId: string) {
    const account = await this.db('bank_accounts as ba')
      .leftJoin('branches as b', 'ba.branch_id', 'b.id')
      .leftJoin('chart_of_accounts as coa', 'ba.ledger_account_id', 'coa.id')
      .where('ba.id', id).andWhere('ba.company_id', companyId).andWhere('ba.is_deleted', false)
      .select('ba.*', 'b.name as branch_name_display', 'coa.account_code as ledger_code', 'coa.account_name as ledger_name')
      .first();

    if (!account) return null;

    // Calculate current balance from ledger entries
    let currentBalance = parseNum(account.opening_balance);

    if (account.ledger_account_id) {
      const result = await this.db('ledger_entries')
        .where({ company_id: companyId, account_id: account.ledger_account_id, is_posted: true })
        .sum('debit_amount as total_debit')
        .sum('credit_amount as total_credit')
        .first();

      currentBalance += parseNum(result?.total_debit) - parseNum(result?.total_credit);
    }

    // Get reconciliation summary
    const reconSummary = await this.db('bank_reconciliation')
      .where({ bank_account_id: id, company_id: companyId, is_deleted: false })
      .select(
        this.db.raw('COUNT(*) as total_entries'),
        this.db.raw("SUM(CASE WHEN is_matched = TRUE THEN 1 ELSE 0 END) as matched_count"),
        this.db.raw("SUM(CASE WHEN is_matched = FALSE THEN 1 ELSE 0 END) as unmatched_count"),
        this.db.raw("SUM(CASE WHEN is_matched = FALSE THEN statement_amount ELSE 0 END) as unmatched_amount")
      )
      .first();

    return {
      ...account,
      current_balance: round2(currentBalance),
      reconciliation: {
        total_entries: parseInt(String(reconSummary?.total_entries || '0'), 10),
        matched: parseInt(String(reconSummary?.matched_count || '0'), 10),
        unmatched: parseInt(String(reconSummary?.unmatched_count || '0'), 10),
        unmatched_amount: round2(parseNum(reconSummary?.unmatched_amount)),
      },
    };
  }

  // ──────── UPDATE ────────

  async updateBankAccount(id: string, companyId: string, input: UpdateBankAccountInput) {
    const account = await this.getById(id, companyId);
    if (!account) throw new Error('Bank account not found');

    return await this.db.transaction(async (trx) => {
      if (input.is_default) {
        await trx('bank_accounts')
          .where({ company_id: companyId, is_default: true })
          .whereNot({ id })
          .update({ is_default: false });
      }

      const updateData: Record<string, any> = {};
      if (input.account_name !== undefined) updateData.account_name = input.account_name;
      if (input.bank_name !== undefined) updateData.bank_name = input.bank_name;
      if (input.ifsc_code !== undefined) updateData.ifsc_code = input.ifsc_code;
      if (input.branch_name !== undefined) updateData.branch_name = input.branch_name;
      if (input.account_type !== undefined) updateData.account_type = input.account_type;
      if (input.is_default !== undefined) updateData.is_default = input.is_default;
      if (input.is_active !== undefined) updateData.is_active = input.is_active;
      updateData.updated_by = input.updated_by || null;

      const [updated] = await trx('bank_accounts')
        .where({ id, company_id: companyId, is_deleted: false })
        .update(updateData)
        .returning('*');

      return updated;
    });
  }

  // ──────── DELETE ────────

  async deleteBankAccount(id: string, companyId: string, userId: string) {
    const account = await this.getById(id, companyId);
    if (!account) throw new Error('Bank account not found');

    // Check for reconciliation entries
    const recon = await this.db('bank_reconciliation')
      .where({ bank_account_id: id, company_id: companyId, is_deleted: false }).first();
    if (recon) throw new Error('Cannot delete bank account with reconciliation entries');

    const [deleted] = await this.db('bank_accounts')
      .where({ id, company_id: companyId, is_deleted: false })
      .update({ is_deleted: true, deleted_at: this.db.fn.now(), deleted_by: userId })
      .returning('*');

    return deleted;
  }

  // ============================================================
  // BANK RECONCILIATION
  // ============================================================

  // ──────── ADD STATEMENT ENTRY ────────

  async addStatementEntry(input: CreateReconciliationInput) {
    const account = await this.getById(input.bank_account_id, input.company_id);
    if (!account) throw new Error('Bank account not found');

    const [entry] = await this.db('bank_reconciliation')
      .insert({
        company_id: input.company_id,
        bank_account_id: input.bank_account_id,
        statement_date: input.statement_date,
        statement_reference: input.statement_reference || null,
        statement_description: input.statement_description || null,
        statement_amount: input.statement_amount,
        is_matched: false,
        created_by: input.created_by || null,
      })
      .returning('*');

    return entry;
  }

  // ──────── BULK IMPORT STATEMENT ────────

  async bulkImportStatements(companyId: string, bankAccountId: string, entries: {
    statement_date: string;
    statement_reference?: string;
    statement_description?: string;
    statement_amount: number;
  }[], userId?: string) {
    const account = await this.getById(bankAccountId, companyId);
    if (!account) throw new Error('Bank account not found');

    const inserts = entries.map((e) => ({
      company_id: companyId,
      bank_account_id: bankAccountId,
      statement_date: e.statement_date,
      statement_reference: e.statement_reference || null,
      statement_description: e.statement_description || null,
      statement_amount: e.statement_amount,
      is_matched: false,
      created_by: userId || null,
    }));

    const inserted = await this.db('bank_reconciliation').insert(inserts).returning('*');
    return { imported: inserted.length };
  }

  // ──────── MATCH STATEMENT WITH LEDGER ENTRY ────────

  async matchEntry(reconciliationId: string, companyId: string, ledgerEntryId: string, userId: string) {
    const recon = await this.db('bank_reconciliation')
      .where({ id: reconciliationId, company_id: companyId, is_deleted: false }).first();
    if (!recon) throw new Error('Reconciliation entry not found');
    if (recon.is_matched) throw new Error('Entry is already matched');

    const ledgerEntry = await this.db('ledger_entries')
      .where({ id: ledgerEntryId, company_id: companyId }).first();
    if (!ledgerEntry) throw new Error('Ledger entry not found');

    const [updated] = await this.db('bank_reconciliation')
      .where({ id: reconciliationId })
      .update({
        ledger_entry_id: ledgerEntryId,
        is_matched: true,
        matched_at: this.db.fn.now(),
        matched_by: userId,
        reconciliation_date: new Date().toISOString().split('T')[0],
        updated_by: userId,
      })
      .returning('*');

    return updated;
  }

  // ──────── UNMATCH ────────

  async unmatchEntry(reconciliationId: string, companyId: string, userId: string) {
    const recon = await this.db('bank_reconciliation')
      .where({ id: reconciliationId, company_id: companyId, is_deleted: false }).first();
    if (!recon) throw new Error('Reconciliation entry not found');
    if (!recon.is_matched) throw new Error('Entry is not matched');

    const [updated] = await this.db('bank_reconciliation')
      .where({ id: reconciliationId })
      .update({
        ledger_entry_id: null,
        is_matched: false,
        matched_at: null,
        matched_by: null,
        reconciliation_date: null,
        updated_by: userId,
      })
      .returning('*');

    return updated;
  }

  // ──────── LIST RECONCILIATION ENTRIES ────────

  async listReconciliationEntries(companyId: string, bankAccountId: string, options: {
    is_matched?: boolean;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { is_matched, from_date, to_date, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('bank_reconciliation as br')
      .leftJoin('ledger_entries as le', 'br.ledger_entry_id', 'le.id')
      .leftJoin('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .where('br.company_id', companyId)
      .andWhere('br.bank_account_id', bankAccountId)
      .andWhere('br.is_deleted', false);

    if (is_matched !== undefined) query = query.where('br.is_matched', is_matched);
    if (from_date) query = query.where('br.statement_date', '>=', from_date);
    if (to_date) query = query.where('br.statement_date', '<=', to_date);

    const countResult = await query.clone().count('br.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .select(
        'br.*',
        'le.voucher_number', 'le.voucher_type', 'le.voucher_date',
        'le.debit_amount', 'le.credit_amount', 'le.narration as ledger_narration',
        'coa.account_name as ledger_account_name'
      )
      .orderBy('br.statement_date', 'desc')
      .limit(limit).offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── RECONCILIATION SUMMARY ────────

  async getReconciliationSummary(companyId: string, bankAccountId: string) {
    const account = await this.getBankAccountWithBalance(bankAccountId, companyId);
    if (!account) throw new Error('Bank account not found');

    // Statement balance (sum of all statement amounts)
    const stmtResult = await this.db('bank_reconciliation')
      .where({ bank_account_id: bankAccountId, company_id: companyId, is_deleted: false })
      .sum('statement_amount as total_statement')
      .first();

    const statementBalance = round2(parseNum(stmtResult?.total_statement));

    // Unmatched in book (ledger entries not yet matched)
    const unmatchedBook = await this.db('ledger_entries as le')
      .leftJoin('bank_reconciliation as br', 'le.id', 'br.ledger_entry_id')
      .where('le.company_id', companyId)
      .andWhere('le.account_id', account.ledger_account_id)
      .andWhere('le.is_posted', true)
      .whereNull('br.id')
      .sum('le.debit_amount as unmatched_debit')
      .sum('le.credit_amount as unmatched_credit')
      .first();

    return {
      bank_account: { id: bankAccountId, name: account.account_name, bank: account.bank_name },
      book_balance: account.current_balance,
      statement_balance: statementBalance,
      difference: round2(account.current_balance - statementBalance),
      unmatched_in_book: {
        debit: round2(parseNum(unmatchedBook?.unmatched_debit)),
        credit: round2(parseNum(unmatchedBook?.unmatched_credit)),
      },
      reconciliation: account.reconciliation,
    };
  }
}

export const bankService = new BankService();