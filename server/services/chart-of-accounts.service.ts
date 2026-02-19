// =============================================================
// File: server/services/chart-of-accounts.service.ts
// Module: Financial & Accounting — Phase 9, Step 37
// Description: Chart of Accounts service.
//   - Hierarchical tree with parent-child relationships
//   - System accounts auto-created on company setup
//   - Account types: asset, liability, equity, revenue, expense
//   - Groups: bank, cash, receivable, payable, income, cogs, etc.
//   - Opening balance setup
//   - Path-based hierarchy for fast tree queries
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface CreateAccountInput {
  company_id: string;
  parent_id?: string;
  account_code: string;
  account_name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  account_group: string;
  is_group?: boolean;
  opening_balance?: number;
  opening_balance_type?: 'debit' | 'credit';
  created_by?: string;
}

export interface UpdateAccountInput {
  account_name?: string;
  account_group?: string;
  opening_balance?: number;
  opening_balance_type?: 'debit' | 'credit';
  is_active?: boolean;
  updated_by?: string;
}

export interface ListAccountsOptions extends ListOptions {
  account_type?: string;
  account_group?: string;
  is_group?: boolean;
  is_active?: boolean;
  parent_id?: string;
}

// ────────────────────────────────────────────────────────────
// System Accounts Template
// ────────────────────────────────────────────────────────────

const SYSTEM_ACCOUNTS = [
  // Assets
  { code: '1000', name: 'Assets', type: 'asset', group: 'current_asset', is_group: true, level: 0 },
  { code: '1100', name: 'Current Assets', type: 'asset', group: 'current_asset', is_group: true, level: 1, parent: '1000' },
  { code: '1110', name: 'Cash', type: 'asset', group: 'cash', is_group: false, level: 2, parent: '1100' },
  { code: '1120', name: 'Bank Accounts', type: 'asset', group: 'bank', is_group: true, level: 2, parent: '1100' },
  { code: '1130', name: 'Accounts Receivable', type: 'asset', group: 'receivable', is_group: true, level: 2, parent: '1100' },
  { code: '1140', name: 'Inventory', type: 'asset', group: 'inventory', is_group: true, level: 2, parent: '1100' },
  { code: '1141', name: 'Raw Material Inventory', type: 'asset', group: 'inventory', is_group: false, level: 3, parent: '1140' },
  { code: '1142', name: 'Finished Goods Inventory', type: 'asset', group: 'inventory', is_group: false, level: 3, parent: '1140' },
  { code: '1143', name: 'Work-in-Progress', type: 'asset', group: 'inventory', is_group: false, level: 3, parent: '1140' },
  { code: '1150', name: 'Advance to Vendors', type: 'asset', group: 'current_asset', is_group: false, level: 2, parent: '1100' },
  { code: '1160', name: 'TDS Receivable', type: 'asset', group: 'current_asset', is_group: false, level: 2, parent: '1100' },
  { code: '1170', name: 'Input GST (CGST)', type: 'asset', group: 'duty_tax', is_group: false, level: 2, parent: '1100' },
  { code: '1171', name: 'Input GST (SGST)', type: 'asset', group: 'duty_tax', is_group: false, level: 2, parent: '1100' },
  { code: '1172', name: 'Input GST (IGST)', type: 'asset', group: 'duty_tax', is_group: false, level: 2, parent: '1100' },
  { code: '1200', name: 'Fixed Assets', type: 'asset', group: 'fixed_asset', is_group: true, level: 1, parent: '1000' },
  { code: '1210', name: 'Plant & Machinery', type: 'asset', group: 'fixed_asset', is_group: false, level: 2, parent: '1200' },
  { code: '1220', name: 'Furniture & Fixtures', type: 'asset', group: 'fixed_asset', is_group: false, level: 2, parent: '1200' },

  // Liabilities
  { code: '2000', name: 'Liabilities', type: 'liability', group: 'payable', is_group: true, level: 0 },
  { code: '2100', name: 'Current Liabilities', type: 'liability', group: 'payable', is_group: true, level: 1, parent: '2000' },
  { code: '2110', name: 'Accounts Payable', type: 'liability', group: 'payable', is_group: true, level: 2, parent: '2100' },
  { code: '2120', name: 'Advance from Customers', type: 'liability', group: 'payable', is_group: false, level: 2, parent: '2100' },
  { code: '2130', name: 'Output GST (CGST)', type: 'liability', group: 'duty_tax', is_group: false, level: 2, parent: '2100' },
  { code: '2131', name: 'Output GST (SGST)', type: 'liability', group: 'duty_tax', is_group: false, level: 2, parent: '2100' },
  { code: '2132', name: 'Output GST (IGST)', type: 'liability', group: 'duty_tax', is_group: false, level: 2, parent: '2100' },
  { code: '2140', name: 'TDS Payable', type: 'liability', group: 'duty_tax', is_group: false, level: 2, parent: '2100' },
  { code: '2150', name: 'TCS Payable', type: 'liability', group: 'duty_tax', is_group: false, level: 2, parent: '2100' },
  { code: '2200', name: 'Long Term Liabilities', type: 'liability', group: 'loan', is_group: true, level: 1, parent: '2000' },
  { code: '2210', name: 'Secured Loans', type: 'liability', group: 'loan', is_group: false, level: 2, parent: '2200' },
  { code: '2220', name: 'Unsecured Loans', type: 'liability', group: 'loan', is_group: false, level: 2, parent: '2200' },

  // Equity
  { code: '3000', name: 'Equity', type: 'equity', group: 'capital', is_group: true, level: 0 },
  { code: '3100', name: 'Capital Account', type: 'equity', group: 'capital', is_group: false, level: 1, parent: '3000' },
  { code: '3200', name: 'Retained Earnings', type: 'equity', group: 'reserve', is_group: false, level: 1, parent: '3000' },
  { code: '3300', name: 'Profit & Loss Account', type: 'equity', group: 'reserve', is_group: false, level: 1, parent: '3000' },

  // Revenue
  { code: '4000', name: 'Revenue', type: 'revenue', group: 'income', is_group: true, level: 0 },
  { code: '4100', name: 'Sales Revenue', type: 'revenue', group: 'income', is_group: false, level: 1, parent: '4000' },
  { code: '4200', name: 'Other Income', type: 'revenue', group: 'income', is_group: false, level: 1, parent: '4000' },
  { code: '4300', name: 'Discount Received', type: 'revenue', group: 'income', is_group: false, level: 1, parent: '4000' },
  { code: '4400', name: 'Scrap Sales', type: 'revenue', group: 'income', is_group: false, level: 1, parent: '4000' },

  // Expenses
  { code: '5000', name: 'Expenses', type: 'expense', group: 'direct_expense', is_group: true, level: 0 },
  { code: '5100', name: 'Cost of Goods Sold', type: 'expense', group: 'cogs', is_group: true, level: 1, parent: '5000' },
  { code: '5110', name: 'Raw Material Consumed', type: 'expense', group: 'cogs', is_group: false, level: 2, parent: '5100' },
  { code: '5120', name: 'Manufacturing Expenses', type: 'expense', group: 'cogs', is_group: false, level: 2, parent: '5100' },
  { code: '5200', name: 'Purchase Returns', type: 'expense', group: 'cogs', is_group: false, level: 1, parent: '5000' },
  { code: '5300', name: 'Discount Allowed', type: 'expense', group: 'direct_expense', is_group: false, level: 1, parent: '5000' },
  { code: '5400', name: 'Indirect Expenses', type: 'expense', group: 'indirect_expense', is_group: true, level: 1, parent: '5000' },
  { code: '5410', name: 'Salary & Wages', type: 'expense', group: 'indirect_expense', is_group: false, level: 2, parent: '5400' },
  { code: '5420', name: 'Rent', type: 'expense', group: 'indirect_expense', is_group: false, level: 2, parent: '5400' },
  { code: '5430', name: 'Utilities', type: 'expense', group: 'indirect_expense', is_group: false, level: 2, parent: '5400' },
  { code: '5440', name: 'Depreciation', type: 'expense', group: 'indirect_expense', is_group: false, level: 2, parent: '5400' },
  { code: '5450', name: 'Scrap/Wastage Loss', type: 'expense', group: 'direct_expense', is_group: false, level: 1, parent: '5000' },
  { code: '5500', name: 'Stock Adjustment Loss', type: 'expense', group: 'direct_expense', is_group: false, level: 1, parent: '5000' },
  { code: '5600', name: 'Rounding Off', type: 'expense', group: 'indirect_expense', is_group: false, level: 1, parent: '5000' },
];

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class ChartOfAccountsService extends BaseService {
  constructor() {
    super('chart_of_accounts');
  }

  // ──────── SEED SYSTEM ACCOUNTS ────────
  // Called once during company setup to create default COA.

  async seedSystemAccounts(companyId: string, userId?: string) {
    return await this.db.transaction(async (trx) => {
      // Check if already seeded
      const existing = await trx('chart_of_accounts')
        .where({ company_id: companyId, is_system_account: true })
        .first();
      if (existing) return { seeded: false, message: 'System accounts already exist' };

      // Insert in order — first pass: create all accounts
      const codeToId: Record<string, string> = {};

      for (const acct of SYSTEM_ACCOUNTS) {
        const [inserted] = await trx('chart_of_accounts')
          .insert({
            company_id: companyId,
            parent_id: acct.parent ? codeToId[acct.parent] : null,
            account_code: acct.code,
            account_name: acct.name,
            account_type: acct.type,
            account_group: acct.group,
            is_system_account: true,
            is_group: acct.is_group,
            opening_balance: 0,
            opening_balance_type: 'credit',
            level: acct.level,
            path: null, // set in second pass
            is_active: true,
            created_by: userId || null,
          })
          .returning('*');

        codeToId[acct.code] = inserted.id;
      }

      // Second pass: set paths
      for (const acct of SYSTEM_ACCOUNTS) {
        const id = codeToId[acct.code];
        let path = acct.code;
        if (acct.parent) {
          const parentPath = await trx('chart_of_accounts')
            .where({ id: codeToId[acct.parent] }).select('path').first();
          path = (parentPath?.path || acct.parent) + '/' + acct.code;
        }
        await trx('chart_of_accounts').where({ id }).update({ path });
      }

      return { seeded: true, count: SYSTEM_ACCOUNTS.length };
    });
  }

  // ──────── CREATE ACCOUNT ────────

  async createAccount(input: CreateAccountInput) {
    return await this.db.transaction(async (trx) => {
      // Validate parent if provided
      let parentLevel = -1;
      let parentPath = '';
      if (input.parent_id) {
        const parent = await trx('chart_of_accounts')
          .where({ id: input.parent_id, company_id: input.company_id, is_deleted: false })
          .first();
        if (!parent) throw new Error('Parent account not found');
        if (!parent.is_group) throw new Error('Parent must be a group account');
        parentLevel = parent.level;
        parentPath = parent.path || parent.account_code;
      }

      // Check duplicate code
      const existing = await trx('chart_of_accounts')
        .where({ company_id: input.company_id, account_code: input.account_code, is_deleted: false })
        .first();
      if (existing) throw new Error(`Account code "${input.account_code}" already exists`);

      const level = parentLevel + 1;
      const path = input.parent_id ? parentPath + '/' + input.account_code : input.account_code;

      const [account] = await trx('chart_of_accounts')
        .insert({
          company_id: input.company_id,
          parent_id: input.parent_id || null,
          account_code: input.account_code,
          account_name: input.account_name,
          account_type: input.account_type,
          account_group: input.account_group,
          is_system_account: false,
          is_group: input.is_group || false,
          opening_balance: input.opening_balance || 0,
          opening_balance_type: input.opening_balance_type || 'credit',
          level,
          path,
          is_active: true,
          created_by: input.created_by || null,
        })
        .returning('*');

      return account;
    });
  }

  // ──────── LIST / SEARCH ────────

  async listAccounts(options: ListAccountsOptions) {
    const {
      companyId, page = 1, limit = 100, search,
      account_type, account_group, is_group, is_active, parent_id,
      sortBy = 'account_code', sortOrder = 'asc',
    } = options;
    const offset = (page - 1) * limit;

    let query = this.db('chart_of_accounts as coa')
      .where('coa.company_id', companyId)
      .andWhere('coa.is_deleted', false);

    if (account_type) query = query.where('coa.account_type', account_type);
    if (account_group) query = query.where('coa.account_group', account_group);
    if (is_group !== undefined) query = query.where('coa.is_group', is_group);
    if (is_active !== undefined) query = query.where('coa.is_active', is_active);
    if (parent_id) query = query.where('coa.parent_id', parent_id);
    if (parent_id === 'null') query = query.whereNull('coa.parent_id'); // root accounts
    if (search) {
      query = query.where(function () {
        this.whereILike('coa.account_code', `%${search}%`)
          .orWhereILike('coa.account_name', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('coa.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .leftJoin('chart_of_accounts as p', 'coa.parent_id', 'p.id')
      .select(
        'coa.*',
        'p.account_name as parent_name',
        'p.account_code as parent_code'
      )
      .orderBy(`coa.${sortBy}`, sortOrder)
      .limit(limit).offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── GET FULL TREE ────────
  // Returns hierarchical tree for a company.

  async getAccountTree(companyId: string) {
    const accounts = await this.db('chart_of_accounts')
      .where({ company_id: companyId, is_deleted: false })
      .orderBy('path')
      .orderBy('account_code');

    // Build tree structure
    const idMap: Record<string, any> = {};
    const roots: any[] = [];

    for (const acct of accounts) {
      idMap[acct.id] = { ...acct, children: [] };
    }

    for (const acct of accounts) {
      const node = idMap[acct.id];
      if (acct.parent_id && idMap[acct.parent_id]) {
        idMap[acct.parent_id].children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  // ──────── GET BY ID ────────

  async getAccountWithChildren(id: string, companyId: string) {
    const account = await this.db('chart_of_accounts as coa')
      .leftJoin('chart_of_accounts as p', 'coa.parent_id', 'p.id')
      .where('coa.id', id)
      .andWhere('coa.company_id', companyId)
      .andWhere('coa.is_deleted', false)
      .select('coa.*', 'p.account_name as parent_name', 'p.account_code as parent_code')
      .first();

    if (!account) return null;

    const children = await this.db('chart_of_accounts')
      .where({ parent_id: id, company_id: companyId, is_deleted: false })
      .orderBy('account_code');

    return { ...account, children };
  }

  // ──────── UPDATE ────────

  async updateAccount(id: string, companyId: string, input: UpdateAccountInput) {
    const account = await this.getById(id, companyId);
    if (!account) throw new Error('Account not found');

    // System accounts: only allow opening_balance and is_active changes
    if (account.is_system_account) {
      const allowedFields = ['opening_balance', 'opening_balance_type', 'is_active', 'updated_by'];
      const keys = Object.keys(input).filter((k) => input[k as keyof UpdateAccountInput] !== undefined);
      const disallowed = keys.filter((k) => !allowedFields.includes(k));
      if (disallowed.length > 0) {
        throw new Error(`System accounts: cannot modify ${disallowed.join(', ')}. Only opening_balance and is_active can be changed.`);
      }
    }

    const updateData: Record<string, any> = {};
    if (input.account_name !== undefined) updateData.account_name = input.account_name;
    if (input.account_group !== undefined) updateData.account_group = input.account_group;
    if (input.opening_balance !== undefined) updateData.opening_balance = input.opening_balance;
    if (input.opening_balance_type !== undefined) updateData.opening_balance_type = input.opening_balance_type;
    if (input.is_active !== undefined) updateData.is_active = input.is_active;
    updateData.updated_by = input.updated_by || null;

    const [updated] = await this.db('chart_of_accounts')
      .where({ id, company_id: companyId, is_deleted: false })
      .update(updateData)
      .returning('*');

    return updated;
  }

  // ──────── DELETE (non-system only, no transactions) ────────

  async deleteAccount(id: string, companyId: string, userId: string) {
    const account = await this.getById(id, companyId);
    if (!account) throw new Error('Account not found');
    if (account.is_system_account) throw new Error('System accounts cannot be deleted');

    // Check for children
    const children = await this.db('chart_of_accounts')
      .where({ parent_id: id, company_id: companyId, is_deleted: false }).first();
    if (children) throw new Error('Cannot delete account with child accounts');

    // Check for ledger entries
    const entries = await this.db('ledger_entries')
      .where({ account_id: id, company_id: companyId }).first();
    if (entries) throw new Error('Cannot delete account with ledger entries');

    const [deleted] = await this.db('chart_of_accounts')
      .where({ id, company_id: companyId, is_deleted: false })
      .update({ is_deleted: true, deleted_at: this.db.fn.now(), deleted_by: userId })
      .returning('*');

    return deleted;
  }

  // ──────── FIND BY CODE ────────

  async findByCode(companyId: string, code: string) {
    return await this.db('chart_of_accounts')
      .where({ company_id: companyId, account_code: code, is_deleted: false })
      .first();
  }

  // ──────── FIND BY GROUP ────────

  async findByGroup(companyId: string, group: string) {
    return await this.db('chart_of_accounts')
      .where({ company_id: companyId, account_group: group, is_deleted: false, is_group: false })
      .orderBy('account_code');
  }
}

export const chartOfAccountsService = new ChartOfAccountsService();