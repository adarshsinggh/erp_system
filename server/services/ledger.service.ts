// =============================================================
// File: server/services/ledger.service.ts
// Module: Financial & Accounting — Phase 9, Step 38
// Description: Double-Entry Ledger Engine.
//   - Every voucher creates debit AND credit entries
//   - System enforces debit = credit balance per voucher
//   - Party-wise tracking (customer/vendor)
//   - Financial year awareness + period locking
//   - Account balance queries (single account, trial balance,
//     P&L, balance sheet)
//   - Voucher posting and reversal
//
// Voucher types: sales, purchase, receipt, payment, journal, contra
// =============================================================

import { Knex } from 'knex';
import { BaseService } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface LedgerLine {
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  narration?: string;
  party_type?: 'customer' | 'vendor';
  party_id?: string;
  cost_center?: string;
}

export interface CreateVoucherInput {
  company_id: string;
  branch_id: string;
  voucher_type: 'sales' | 'purchase' | 'receipt' | 'payment' | 'journal' | 'contra';
  voucher_date: string;
  narration?: string;
  reference_type?: string;
  reference_id?: string;
  reference_number?: string;
  lines: LedgerLine[];
  auto_post?: boolean;
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

class LedgerService extends BaseService {
  constructor() {
    super('ledger_entries');
  }

  // ──────── Resolve financial year ────────

  private async resolveFinancialYear(db: Knex, companyId: string, date: string): Promise<string> {
    const fy = await db('financial_years')
      .where({ company_id: companyId, is_deleted: false })
      .andWhere('start_date', '<=', date)
      .andWhere('end_date', '>=', date)
      .first();

    if (!fy) throw new Error(`No financial year found for date ${date}`);
    if (fy.is_locked) throw new Error(`Financial year ${fy.year_label} is locked. Cannot post entries.`);
    return fy.id;
  }

  // ──────── CREATE VOUCHER (multi-line double-entry) ────────
  // All lines for a voucher are created atomically.
  // Total debits MUST equal total credits.

  async createVoucher(input: CreateVoucherInput) {
    if (!input.lines || input.lines.length < 2) {
      throw new Error('At least 2 ledger lines required for double-entry');
    }

    // Validate debit = credit
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of input.lines) {
      totalDebit += round2(line.debit_amount || 0);
      totalCredit += round2(line.credit_amount || 0);
      if (line.debit_amount > 0 && line.credit_amount > 0) {
        throw new Error('A single line cannot have both debit and credit amounts');
      }
      if (line.debit_amount === 0 && line.credit_amount === 0) {
        throw new Error('Each line must have either a debit or credit amount');
      }
    }

    totalDebit = round2(totalDebit);
    totalCredit = round2(totalCredit);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(
        `Debit (${totalDebit}) does not equal Credit (${totalCredit}). ` +
        `Difference: ${round2(totalDebit - totalCredit)}`
      );
    }

    return await this.db.transaction(async (trx) => {
      // Resolve financial year
      const fyId = await this.resolveFinancialYear(trx, input.company_id, input.voucher_date);

      // Generate voucher number
      const docType = `voucher_${input.voucher_type}`;
      const [numResult] = await trx.raw(
        `SELECT get_next_document_number(?, ?, ?) as doc_number`,
        [input.company_id, input.branch_id, docType]
      );
      const voucherNumber = numResult?.rows?.[0]?.doc_number || numResult?.[0]?.doc_number || numResult?.doc_number;
      if (!voucherNumber) throw new Error('Failed to generate voucher number.');

      // Validate all accounts exist
      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const account = await trx('chart_of_accounts')
          .where({ id: line.account_id, company_id: input.company_id, is_deleted: false })
          .first();
        if (!account) throw new Error(`Line ${i + 1}: Account not found: ${line.account_id}`);
        if (account.is_group) throw new Error(`Line ${i + 1}: Cannot post to group account "${account.account_name}"`);
        if (!account.is_active) throw new Error(`Line ${i + 1}: Account "${account.account_name}" is inactive`);
      }

      // Insert all lines
      const isPosted = input.auto_post !== false; // default: post immediately

      const lineInserts = input.lines.map((line) => ({
        company_id: input.company_id,
        branch_id: input.branch_id,
        financial_year_id: fyId,
        voucher_type: input.voucher_type,
        voucher_number: voucherNumber,
        voucher_date: input.voucher_date,
        account_id: line.account_id,
        debit_amount: round2(line.debit_amount || 0),
        credit_amount: round2(line.credit_amount || 0),
        narration: line.narration || input.narration || null,
        reference_type: input.reference_type || null,
        reference_id: input.reference_id || null,
        reference_number: input.reference_number || null,
        party_type: line.party_type || null,
        party_id: line.party_id || null,
        cost_center: line.cost_center || null,
        is_posted: isPosted,
        created_by: input.created_by || null,
      }));

      const inserted = await trx('ledger_entries').insert(lineInserts).returning('*');

      return {
        voucher_number: voucherNumber,
        voucher_type: input.voucher_type,
        voucher_date: input.voucher_date,
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_posted: isPosted,
        lines: inserted,
      };
    });
  }

  // ──────── GET VOUCHER ────────

  async getVoucher(companyId: string, voucherNumber: string) {
    const entries = await this.db('ledger_entries as le')
      .join('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .leftJoin('customers as c', function () {
        this.on('le.party_id', 'c.id').andOnVal('le.party_type', 'customer');
      })
      .leftJoin('vendors as v', function () {
        this.on('le.party_id', 'v.id').andOnVal('le.party_type', 'vendor');
      })
      .where('le.company_id', companyId)
      .andWhere('le.voucher_number', voucherNumber)
      .select(
        'le.*',
        'coa.account_code', 'coa.account_name', 'coa.account_type',
        'c.name as customer_name',
        'v.name as vendor_name'
      )
      .orderBy('le.debit_amount', 'desc');

    if (entries.length === 0) return null;

    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of entries) {
      totalDebit += parseNum(e.debit_amount);
      totalCredit += parseNum(e.credit_amount);
    }

    return {
      voucher_number: voucherNumber,
      voucher_type: entries[0].voucher_type,
      voucher_date: entries[0].voucher_date,
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
      is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      is_posted: entries[0].is_posted,
      lines: entries,
    };
  }

  // ──────── REVERSE VOUCHER ────────
  // Creates mirror entries with swapped debit/credit.

  async reverseVoucher(companyId: string, voucherNumber: string, reversalDate: string, userId: string) {
    const voucher = await this.getVoucher(companyId, voucherNumber);
    if (!voucher) throw new Error('Voucher not found');
    if (!voucher.is_posted) throw new Error('Cannot reverse an unposted voucher');

    const reversalLines: LedgerLine[] = voucher.lines.map((l: any) => ({
      account_id: l.account_id,
      debit_amount: parseNum(l.credit_amount), // swap
      credit_amount: parseNum(l.debit_amount), // swap
      narration: `Reversal of ${voucherNumber}`,
      party_type: l.party_type,
      party_id: l.party_id,
      cost_center: l.cost_center,
    }));

    return await this.createVoucher({
      company_id: companyId,
      branch_id: voucher.lines[0].branch_id,
      voucher_type: voucher.voucher_type,
      voucher_date: reversalDate,
      narration: `Reversal of ${voucherNumber}`,
      reference_type: 'reversal',
      reference_number: voucherNumber,
      lines: reversalLines,
      auto_post: true,
      created_by: userId,
    });
  }

  // ──────── ACCOUNT BALANCE ────────
  // Returns debit total, credit total, and net balance for an account.

  async getAccountBalance(companyId: string, accountId: string, options: {
    from_date?: string;
    to_date?: string;
    financial_year_id?: string;
  } = {}) {
    let query = this.db('ledger_entries')
      .where({ company_id: companyId, account_id: accountId, is_posted: true });

    if (options.from_date) query = query.where('voucher_date', '>=', options.from_date);
    if (options.to_date) query = query.where('voucher_date', '<=', options.to_date);
    if (options.financial_year_id) query = query.where('financial_year_id', options.financial_year_id);

    const result = await query
      .sum('debit_amount as total_debit')
      .sum('credit_amount as total_credit')
      .count('id as entry_count')
      .first();

    const totalDebit = parseNum(result?.total_debit);
    const totalCredit = parseNum(result?.total_credit);

    // Get opening balance from chart_of_accounts
    const account = await this.db('chart_of_accounts')
      .where({ id: accountId, company_id: companyId }).first();

    const openingBal = parseNum(account?.opening_balance);
    const obType = account?.opening_balance_type || 'credit';
    const obDebit = obType === 'debit' ? openingBal : 0;
    const obCredit = obType === 'credit' ? openingBal : 0;

    const netDebit = round2(totalDebit + obDebit);
    const netCredit = round2(totalCredit + obCredit);

    return {
      account_id: accountId,
      account_code: account?.account_code,
      account_name: account?.account_name,
      account_type: account?.account_type,
      opening_balance: openingBal,
      opening_balance_type: obType,
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
      net_balance: round2(netDebit - netCredit),
      balance_type: netDebit >= netCredit ? 'debit' : 'credit',
      entry_count: parseInt(String(result?.entry_count || '0'), 10),
    };
  }

  // ──────── ACCOUNT LEDGER (detailed entries for one account) ────────

  async getAccountLedger(companyId: string, accountId: string, options: {
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { from_date, to_date, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('ledger_entries as le')
      .where('le.company_id', companyId)
      .andWhere('le.account_id', accountId)
      .andWhere('le.is_posted', true);

    if (from_date) query = query.where('le.voucher_date', '>=', from_date);
    if (to_date) query = query.where('le.voucher_date', '<=', to_date);

    const countResult = await query.clone().count('le.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .leftJoin('customers as c', function () {
        this.on('le.party_id', 'c.id').andOnVal('le.party_type', 'customer');
      })
      .leftJoin('vendors as v', function () {
        this.on('le.party_id', 'v.id').andOnVal('le.party_type', 'vendor');
      })
      .select(
        'le.id', 'le.voucher_type', 'le.voucher_number', 'le.voucher_date',
        'le.debit_amount', 'le.credit_amount', 'le.narration',
        'le.reference_type', 'le.reference_number',
        'le.party_type', 'le.party_id',
        'c.name as customer_name', 'v.name as vendor_name',
        'le.created_at'
      )
      .orderBy('le.voucher_date', 'asc')
      .orderBy('le.created_at', 'asc')
      .limit(limit).offset(offset);

    // Running balance
    let runningBalance = 0;
    const account = await this.db('chart_of_accounts').where({ id: accountId }).first();
    const obType = account?.opening_balance_type || 'credit';
    const ob = parseNum(account?.opening_balance);
    runningBalance = obType === 'debit' ? ob : -ob;

    // Get pre-period balance if from_date is set
    if (from_date) {
      const prePeriod = await this.db('ledger_entries')
        .where({ company_id: companyId, account_id: accountId, is_posted: true })
        .andWhere('voucher_date', '<', from_date)
        .sum('debit_amount as total_debit')
        .sum('credit_amount as total_credit')
        .first();
      runningBalance += parseNum(prePeriod?.total_debit) - parseNum(prePeriod?.total_credit);
    }

    const enrichedData = data.map((entry: any) => {
      runningBalance += parseNum(entry.debit_amount) - parseNum(entry.credit_amount);
      return { ...entry, running_balance: round2(runningBalance) };
    });

    return { data: enrichedData, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── PARTY LEDGER (customer or vendor) ────────

  async getPartyLedger(companyId: string, partyType: 'customer' | 'vendor', partyId: string, options: {
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { from_date, to_date, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('ledger_entries as le')
      .join('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .where('le.company_id', companyId)
      .andWhere('le.party_type', partyType)
      .andWhere('le.party_id', partyId)
      .andWhere('le.is_posted', true);

    if (from_date) query = query.where('le.voucher_date', '>=', from_date);
    if (to_date) query = query.where('le.voucher_date', '<=', to_date);

    const countResult = await query.clone().count('le.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .select(
        'le.id', 'le.voucher_type', 'le.voucher_number', 'le.voucher_date',
        'le.debit_amount', 'le.credit_amount', 'le.narration',
        'le.reference_type', 'le.reference_number',
        'coa.account_code', 'coa.account_name',
        'le.created_at'
      )
      .orderBy('le.voucher_date', 'asc')
      .orderBy('le.created_at', 'asc')
      .limit(limit).offset(offset);

    // Totals
    const totals = await this.db('ledger_entries')
      .where({ company_id: companyId, party_type: partyType, party_id: partyId, is_posted: true })
      .sum('debit_amount as total_debit')
      .sum('credit_amount as total_credit')
      .first();

    return {
      data, total, page, limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        total_debit: round2(parseNum(totals?.total_debit)),
        total_credit: round2(parseNum(totals?.total_credit)),
        outstanding: round2(parseNum(totals?.total_debit) - parseNum(totals?.total_credit)),
      },
    };
  }

  // ──────── TRIAL BALANCE ────────

  async getTrialBalance(companyId: string, options: {
    as_of_date?: string;
    financial_year_id?: string;
  } = {}) {
    let query = this.db('ledger_entries as le')
      .join('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .where('le.company_id', companyId)
      .andWhere('le.is_posted', true);

    if (options.as_of_date) query = query.where('le.voucher_date', '<=', options.as_of_date);
    if (options.financial_year_id) query = query.where('le.financial_year_id', options.financial_year_id);

    const entries = await query
      .select(
        'coa.id as account_id', 'coa.account_code', 'coa.account_name',
        'coa.account_type', 'coa.account_group',
        'coa.opening_balance', 'coa.opening_balance_type'
      )
      .sum('le.debit_amount as total_debit')
      .sum('le.credit_amount as total_credit')
      .groupBy('coa.id', 'coa.account_code', 'coa.account_name', 'coa.account_type', 'coa.account_group', 'coa.opening_balance', 'coa.opening_balance_type')
      .orderBy('coa.account_code');

    let grandDebit = 0;
    let grandCredit = 0;

    const data = entries.map((row: any) => {
      const ob = parseNum(row.opening_balance);
      const obDebit = row.opening_balance_type === 'debit' ? ob : 0;
      const obCredit = row.opening_balance_type === 'credit' ? ob : 0;
      const totalDebit = round2(parseNum(row.total_debit) + obDebit);
      const totalCredit = round2(parseNum(row.total_credit) + obCredit);
      const closingBalance = round2(totalDebit - totalCredit);

      grandDebit += totalDebit;
      grandCredit += totalCredit;

      return {
        account_id: row.account_id,
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        account_group: row.account_group,
        debit_total: totalDebit,
        credit_total: totalCredit,
        closing_balance: Math.abs(closingBalance),
        closing_type: closingBalance >= 0 ? 'debit' : 'credit',
      };
    });

    return {
      data,
      summary: {
        grand_debit: round2(grandDebit),
        grand_credit: round2(grandCredit),
        is_balanced: Math.abs(grandDebit - grandCredit) < 0.01,
        difference: round2(grandDebit - grandCredit),
      },
    };
  }

  // ──────── PROFIT & LOSS ────────

  async getProfitAndLoss(companyId: string, options: {
    from_date: string;
    to_date: string;
    branch_id?: string;
  }) {
    let query = this.db('ledger_entries as le')
      .join('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .where('le.company_id', companyId)
      .andWhere('le.is_posted', true)
      .andWhere('le.voucher_date', '>=', options.from_date)
      .andWhere('le.voucher_date', '<=', options.to_date)
      .whereIn('coa.account_type', ['revenue', 'expense']);

    if (options.branch_id) query = query.where('le.branch_id', options.branch_id);

    const entries = await query
      .select('coa.account_code', 'coa.account_name', 'coa.account_type', 'coa.account_group')
      .sum('le.debit_amount as total_debit')
      .sum('le.credit_amount as total_credit')
      .groupBy('coa.account_code', 'coa.account_name', 'coa.account_type', 'coa.account_group')
      .orderBy('coa.account_type')
      .orderBy('coa.account_code');

    let totalRevenue = 0;
    let totalExpense = 0;
    const revenue: any[] = [];
    const expenses: any[] = [];

    for (const row of entries) {
      const net = round2(parseNum(row.total_credit) - parseNum(row.total_debit));

      if (row.account_type === 'revenue') {
        revenue.push({ ...row, amount: Math.abs(net) });
        totalRevenue += Math.abs(net);
      } else {
        const expNet = round2(parseNum(row.total_debit) - parseNum(row.total_credit));
        expenses.push({ ...row, amount: Math.abs(expNet) });
        totalExpense += Math.abs(expNet);
      }
    }

    return {
      period: { from_date: options.from_date, to_date: options.to_date },
      revenue: { items: revenue, total: round2(totalRevenue) },
      expenses: { items: expenses, total: round2(totalExpense) },
      net_profit: round2(totalRevenue - totalExpense),
      profit_type: totalRevenue >= totalExpense ? 'profit' : 'loss',
    };
  }

  // ──────── BALANCE SHEET ────────

  async getBalanceSheet(companyId: string, asOfDate: string) {
    let query = this.db('ledger_entries as le')
      .join('chart_of_accounts as coa', 'le.account_id', 'coa.id')
      .where('le.company_id', companyId)
      .andWhere('le.is_posted', true)
      .andWhere('le.voucher_date', '<=', asOfDate)
      .whereIn('coa.account_type', ['asset', 'liability', 'equity']);

    const entries = await query
      .select('coa.account_code', 'coa.account_name', 'coa.account_type', 'coa.account_group',
        'coa.opening_balance', 'coa.opening_balance_type')
      .sum('le.debit_amount as total_debit')
      .sum('le.credit_amount as total_credit')
      .groupBy('coa.account_code', 'coa.account_name', 'coa.account_type', 'coa.account_group',
        'coa.opening_balance', 'coa.opening_balance_type')
      .orderBy('coa.account_type')
      .orderBy('coa.account_code');

    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const row of entries) {
      const ob = parseNum(row.opening_balance);
      const obDebit = row.opening_balance_type === 'debit' ? ob : 0;
      const obCredit = row.opening_balance_type === 'credit' ? ob : 0;
      const netDebit = round2(parseNum(row.total_debit) + obDebit);
      const netCredit = round2(parseNum(row.total_credit) + obCredit);
      const balance = round2(netDebit - netCredit);

      const item = {
        account_code: row.account_code,
        account_name: row.account_name,
        account_group: row.account_group,
        balance: Math.abs(balance),
      };

      if (row.account_type === 'asset') {
        assets.push(item);
        totalAssets += balance; // Assets have debit balance (positive)
      } else if (row.account_type === 'liability') {
        liabilities.push(item);
        totalLiabilities += Math.abs(balance); // Liabilities credit balance
      } else {
        equity.push(item);
        totalEquity += Math.abs(balance); // Equity credit balance
      }
    }

    return {
      as_of_date: asOfDate,
      assets: { items: assets, total: round2(Math.abs(totalAssets)) },
      liabilities: { items: liabilities, total: round2(totalLiabilities) },
      equity: { items: equity, total: round2(totalEquity) },
      liabilities_and_equity: round2(totalLiabilities + totalEquity),
      is_balanced: Math.abs(Math.abs(totalAssets) - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  // ──────── OUTSTANDING RECEIVABLES ────────

  async getOutstandingReceivables(companyId: string) {
    const data = await this.db('ledger_entries as le')
      .join('customers as c', function () {
        this.on('le.party_id', 'c.id').andOnVal('le.party_type', 'customer');
      })
      .where('le.company_id', companyId)
      .andWhere('le.is_posted', true)
      .andWhere('le.party_type', 'customer')
      .select('le.party_id', 'c.name as customer_name', 'c.customer_code')
      .sum('le.debit_amount as total_debit')
      .sum('le.credit_amount as total_credit')
      .groupBy('le.party_id', 'c.name', 'c.customer_code')
      .havingRaw('SUM(le.debit_amount) - SUM(le.credit_amount) > 0.01')
      .orderByRaw('SUM(le.debit_amount) - SUM(le.credit_amount) DESC');

    let grandTotal = 0;
    const enriched = data.map((row: any) => {
      const outstanding = round2(parseNum(row.total_debit) - parseNum(row.total_credit));
      grandTotal += outstanding;
      return { ...row, outstanding };
    });

    return { data: enriched, summary: { grand_total: round2(grandTotal), customer_count: enriched.length } };
  }

  // ──────── OUTSTANDING PAYABLES ────────

  async getOutstandingPayables(companyId: string) {
    const data = await this.db('ledger_entries as le')
      .join('vendors as v', function () {
        this.on('le.party_id', 'v.id').andOnVal('le.party_type', 'vendor');
      })
      .where('le.company_id', companyId)
      .andWhere('le.is_posted', true)
      .andWhere('le.party_type', 'vendor')
      .select('le.party_id', 'v.name as vendor_name', 'v.vendor_code')
      .sum('le.debit_amount as total_debit')
      .sum('le.credit_amount as total_credit')
      .groupBy('le.party_id', 'v.name', 'v.vendor_code')
      .havingRaw('SUM(le.credit_amount) - SUM(le.debit_amount) > 0.01')
      .orderByRaw('SUM(le.credit_amount) - SUM(le.debit_amount) DESC');

    let grandTotal = 0;
    const enriched = data.map((row: any) => {
      const outstanding = round2(parseNum(row.total_credit) - parseNum(row.total_debit));
      grandTotal += outstanding;
      return { ...row, outstanding };
    });

    return { data: enriched, summary: { grand_total: round2(grandTotal), vendor_count: enriched.length } };
  }
}

export const ledgerService = new LedgerService();