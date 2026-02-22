// =============================================================
// File: server/routes/finance.ts
// Module: Financial & Accounting — Phase 9, Steps 37–39
// Description: REST API routes for Chart of Accounts,
//              Double-Entry Ledger, Bank & Cash Management.
// =============================================================

import { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.plugin';
import { chartOfAccountsService } from '../services/chart-of-accounts.service';
import { ledgerService } from '../services/ledger.service';
import { bankService } from '../services/bank.service';

const VALID_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const VALID_VOUCHER_TYPES = ['sales', 'purchase', 'receipt', 'payment', 'journal', 'contra'];
const VALID_BANK_TYPES = ['current', 'savings', 'od', 'cc'];

export async function financeRoutes(server: FastifyInstance) {

  // ============================================================
  // CHART OF ACCOUNTS (Step 37)
  // ============================================================

  // POST /finance/accounts/seed — Seed system accounts
  server.post('/finance/accounts/seed', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const result = await chartOfAccountsService.seedSystemAccounts(
        request.user!.companyId, request.user!.userId
      );
      return reply.code(201).send({ success: true, data: result });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // POST /finance/accounts — Create account
  server.post('/finance/accounts', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.account_code) return reply.code(400).send({ success: false, error: 'account_code is required' });
      if (!body.account_name) return reply.code(400).send({ success: false, error: 'account_name is required' });
      if (!body.account_type || !VALID_ACCOUNT_TYPES.includes(body.account_type)) {
        return reply.code(400).send({ success: false, error: `account_type must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}` });
      }
      if (!body.account_group) return reply.code(400).send({ success: false, error: 'account_group is required' });

      const account = await chartOfAccountsService.createAccount({
        company_id: request.user!.companyId,
        parent_id: body.parent_id,
        account_code: body.account_code,
        account_name: body.account_name,
        account_type: body.account_type,
        account_group: body.account_group,
        is_group: body.is_group || false,
        opening_balance: body.opening_balance ? parseFloat(body.opening_balance) : 0,
        opening_balance_type: body.opening_balance_type || 'credit',
        created_by: request.user!.userId,
      });

      return reply.code(201).send({ success: true, data: account });
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : error.message.includes('already exists') ? 409 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // GET /finance/accounts — List
  server.get('/finance/accounts', { preHandler: [authenticate] }, async (request) => {
    const q = request.query as any;
    return { success: true, ...await chartOfAccountsService.listAccounts({
      companyId: request.user!.companyId,
      page: parseInt(q.page) || 1, limit: parseInt(q.limit) || 100,
      search: q.search, account_type: q.account_type, account_group: q.account_group,
      is_group: q.is_group !== undefined ? q.is_group === 'true' : undefined,
      is_active: q.is_active !== undefined ? q.is_active === 'true' : undefined,
      parent_id: q.parent_id,
      sortBy: q.sort_by || 'account_code', sortOrder: q.sort_order || 'asc',
    })};
  });

  // GET /finance/accounts/tree — Full hierarchy
  server.get('/finance/accounts/tree', { preHandler: [authenticate] }, async (request) => {
    const tree = await chartOfAccountsService.getAccountTree(request.user!.companyId);
    return { success: true, data: tree };
  });

  // GET /finance/accounts/:id
  server.get('/finance/accounts/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await chartOfAccountsService.getAccountWithChildren(id, request.user!.companyId);
    if (!account) return reply.code(404).send({ success: false, error: 'Account not found' });
    return { success: true, data: account };
  });

  // PUT /finance/accounts/:id
  server.put('/finance/accounts/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const updated = await chartOfAccountsService.updateAccount(id, request.user!.companyId, {
        ...body,
        opening_balance: body.opening_balance !== undefined ? parseFloat(body.opening_balance) : undefined,
        updated_by: request.user!.userId,
      });
      return { success: true, data: updated };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // DELETE /finance/accounts/:id
  server.delete('/finance/accounts/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await chartOfAccountsService.deleteAccount(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Account deleted', data: deleted };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // ============================================================
  // LEDGER ENTRIES — DOUBLE-ENTRY ENGINE (Step 38)
  // ============================================================

  // POST /finance/vouchers — Create voucher (double-entry)
  server.post('/finance/vouchers', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.voucher_type || !VALID_VOUCHER_TYPES.includes(body.voucher_type)) {
        return reply.code(400).send({ success: false, error: `voucher_type must be one of: ${VALID_VOUCHER_TYPES.join(', ')}` });
      }
      if (!body.voucher_date) return reply.code(400).send({ success: false, error: 'voucher_date is required' });
      if (!body.lines || !Array.isArray(body.lines) || body.lines.length < 2) {
        return reply.code(400).send({ success: false, error: 'At least 2 lines required for double-entry' });
      }

      for (let i = 0; i < body.lines.length; i++) {
        const l = body.lines[i];
        if (!l.account_id) return reply.code(400).send({ success: false, error: `Line ${i + 1}: account_id is required` });
        if (!l.debit_amount && !l.credit_amount) return reply.code(400).send({ success: false, error: `Line ${i + 1}: debit_amount or credit_amount required` });
      }

      const voucher = await ledgerService.createVoucher({
        company_id: request.user!.companyId,
        branch_id: body.branch_id || request.user!.branchId,
        voucher_type: body.voucher_type,
        voucher_date: body.voucher_date,
        narration: body.narration,
        reference_type: body.reference_type,
        reference_id: body.reference_id,
        reference_number: body.reference_number,
        lines: body.lines.map((l: any) => ({
          account_id: l.account_id,
          debit_amount: parseFloat(l.debit_amount) || 0,
          credit_amount: parseFloat(l.credit_amount) || 0,
          narration: l.narration,
          party_type: l.party_type,
          party_id: l.party_id,
          cost_center: l.cost_center,
        })),
        auto_post: body.auto_post !== false,
        created_by: request.user!.userId,
      });

      return reply.code(201).send({ success: true, data: voucher });
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : error.message.includes('locked') ? 423 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // GET /finance/vouchers/:voucherNumber
  server.get('/finance/vouchers/:voucherNumber', { preHandler: [authenticate] }, async (request, reply) => {
    const { voucherNumber } = request.params as { voucherNumber: string };
    const voucher = await ledgerService.getVoucher(request.user!.companyId, voucherNumber);
    if (!voucher) return reply.code(404).send({ success: false, error: 'Voucher not found' });
    return { success: true, data: voucher };
  });

  // POST /finance/vouchers/:voucherNumber/reverse
  server.post('/finance/vouchers/:voucherNumber/reverse', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { voucherNumber } = request.params as { voucherNumber: string };
      const body = request.body as any;
      if (!body.reversal_date) return reply.code(400).send({ success: false, error: 'reversal_date is required' });

      const reversal = await ledgerService.reverseVoucher(
        request.user!.companyId, voucherNumber, body.reversal_date, request.user!.userId
      );
      return { success: true, message: 'Voucher reversed', data: reversal };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // GET /finance/account-balance/:accountId
  server.get('/finance/account-balance/:accountId', { preHandler: [authenticate] }, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const q = request.query as any;
    const balance = await ledgerService.getAccountBalance(request.user!.companyId, accountId, {
      from_date: q.from_date, to_date: q.to_date, financial_year_id: q.financial_year_id,
    });
    return { success: true, data: balance };
  });

  // GET /finance/account-ledger/:accountId
  server.get('/finance/account-ledger/:accountId', { preHandler: [authenticate] }, async (request) => {
    const { accountId } = request.params as { accountId: string };
    const q = request.query as any;
    return { success: true, ...await ledgerService.getAccountLedger(request.user!.companyId, accountId, {
      from_date: q.from_date, to_date: q.to_date,
      page: parseInt(q.page) || 1, limit: parseInt(q.limit) || 50,
    })};
  });

  // GET /finance/party-ledger/:partyType/:partyId
  server.get('/finance/party-ledger/:partyType/:partyId', { preHandler: [authenticate] }, async (request, reply) => {
    const { partyType, partyId } = request.params as { partyType: string; partyId: string };
    if (!['customer', 'vendor'].includes(partyType)) {
      return reply.code(400).send({ success: false, error: "partyType must be 'customer' or 'vendor'" });
    }
    const q = request.query as any;
    return { success: true, ...await ledgerService.getPartyLedger(
      request.user!.companyId, partyType as any, partyId, {
        from_date: q.from_date, to_date: q.to_date,
        page: parseInt(q.page) || 1, limit: parseInt(q.limit) || 50,
      }
    )};
  });

  // GET /finance/trial-balance
  server.get('/finance/trial-balance', { preHandler: [authenticate] }, async (request) => {
    const q = request.query as any;
    const tb = await ledgerService.getTrialBalance(request.user!.companyId, {
      as_of_date: q.as_of_date, financial_year_id: q.financial_year_id,
    });
    return { success: true, ...tb };
  });

  // GET /finance/profit-and-loss
  server.get('/finance/profit-and-loss', { preHandler: [authenticate] }, async (request, reply) => {
    const q = request.query as any;
    if (!q.from_date || !q.to_date) {
      return reply.code(400).send({ success: false, error: 'from_date and to_date are required' });
    }
    const pnl = await ledgerService.getProfitAndLoss(request.user!.companyId, {
      from_date: q.from_date, to_date: q.to_date, branch_id: q.branch_id,
    });
    return {
      success: true,
      data: {
        income: pnl.revenue?.items || [],
        expenses: pnl.expenses?.items || [],
        total_income: pnl.revenue?.total || 0,
        total_expense: pnl.expenses?.total || 0,
        net_profit: pnl.net_profit || 0,
      },
    };
  });

  // GET /finance/balance-sheet
  server.get('/finance/balance-sheet', { preHandler: [authenticate] }, async (request, reply) => {
    const q = request.query as any;
    if (!q.as_of_date) return reply.code(400).send({ success: false, error: 'as_of_date is required' });
    const bs = await ledgerService.getBalanceSheet(request.user!.companyId, q.as_of_date);
    const mapItems = (items: any[]) => items.map((i: any) => ({
      account_code: i.account_code,
      account_name: i.account_name,
      amount: i.balance ?? i.amount ?? 0,
    }));
    return {
      success: true,
      data: {
        assets: mapItems(bs.assets?.items || []),
        liabilities: mapItems(bs.liabilities?.items || []),
        equity: mapItems(bs.equity?.items || []),
        total_assets: bs.assets?.total || 0,
        total_liabilities: bs.liabilities?.total || 0,
        total_equity: bs.equity?.total || 0,
      },
    };
  });

  // GET /finance/outstanding-receivables
  server.get('/finance/outstanding-receivables', { preHandler: [authenticate] }, async (request) => {
    return { success: true, ...await ledgerService.getOutstandingReceivables(request.user!.companyId) };
  });

  // GET /finance/outstanding-payables
  server.get('/finance/outstanding-payables', { preHandler: [authenticate] }, async (request) => {
    return { success: true, ...await ledgerService.getOutstandingPayables(request.user!.companyId) };
  });

  // ============================================================
  // BANK & CASH MANAGEMENT (Step 39)
  // ============================================================

  // POST /finance/bank-accounts
  server.post('/finance/bank-accounts', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.account_name) return reply.code(400).send({ success: false, error: 'account_name is required' });
      if (!body.bank_name) return reply.code(400).send({ success: false, error: 'bank_name is required' });
      if (!body.account_number) return reply.code(400).send({ success: false, error: 'account_number is required' });
      if (body.account_type && !VALID_BANK_TYPES.includes(body.account_type)) {
        return reply.code(400).send({ success: false, error: `account_type must be one of: ${VALID_BANK_TYPES.join(', ')}` });
      }

      const account = await bankService.createBankAccount({
        company_id: request.user!.companyId,
        branch_id: body.branch_id,
        account_name: body.account_name,
        bank_name: body.bank_name,
        account_number: body.account_number,
        ifsc_code: body.ifsc_code,
        branch_name: body.branch_name,
        account_type: body.account_type,
        opening_balance: body.opening_balance ? parseFloat(body.opening_balance) : 0,
        is_default: body.is_default || false,
        created_by: request.user!.userId,
      });

      return reply.code(201).send({ success: true, data: account });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // GET /finance/bank-accounts
  server.get('/finance/bank-accounts', { preHandler: [authenticate] }, async (request) => {
    const q = request.query as any;
    const data = await bankService.listBankAccounts(request.user!.companyId, {
      branch_id: q.branch_id, account_type: q.account_type,
      is_active: q.is_active !== undefined ? q.is_active === 'true' : undefined,
    });
    return { success: true, data, total: data.length };
  });

  // GET /finance/bank-accounts/:id
  server.get('/finance/bank-accounts/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await bankService.getBankAccountWithBalance(id, request.user!.companyId);
    if (!account) return reply.code(404).send({ success: false, error: 'Bank account not found' });
    return { success: true, data: account };
  });

  // PUT /finance/bank-accounts/:id
  server.put('/finance/bank-accounts/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const updated = await bankService.updateBankAccount(id, request.user!.companyId, {
        ...body, updated_by: request.user!.userId,
      });
      return { success: true, data: updated };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // DELETE /finance/bank-accounts/:id
  server.delete('/finance/bank-accounts/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const deleted = await bankService.deleteBankAccount(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Bank account deleted', data: deleted };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // POST /finance/bank-reconciliation — Add statement entry
  server.post('/finance/bank-reconciliation', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.bank_account_id) return reply.code(400).send({ success: false, error: 'bank_account_id is required' });
      if (!body.statement_date) return reply.code(400).send({ success: false, error: 'statement_date is required' });
      if (body.statement_amount === undefined) return reply.code(400).send({ success: false, error: 'statement_amount is required' });

      const entry = await bankService.addStatementEntry({
        company_id: request.user!.companyId,
        bank_account_id: body.bank_account_id,
        statement_date: body.statement_date,
        statement_reference: body.statement_reference,
        statement_description: body.statement_description,
        statement_amount: parseFloat(body.statement_amount),
        created_by: request.user!.userId,
      });

      return reply.code(201).send({ success: true, data: entry });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // POST /finance/bank-reconciliation/bulk-import
  server.post('/finance/bank-reconciliation/bulk-import', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const body = request.body as any;
      if (!body.bank_account_id) return reply.code(400).send({ success: false, error: 'bank_account_id is required' });
      if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) {
        return reply.code(400).send({ success: false, error: 'entries array is required' });
      }

      const result = await bankService.bulkImportStatements(
        request.user!.companyId, body.bank_account_id,
        body.entries.map((e: any) => ({
          statement_date: e.statement_date,
          statement_reference: e.statement_reference,
          statement_description: e.statement_description,
          statement_amount: parseFloat(e.statement_amount),
        })),
        request.user!.userId
      );

      return reply.code(201).send({ success: true, data: result });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  });

  // GET /finance/bank-reconciliation/:bankAccountId
  server.get('/finance/bank-reconciliation/:bankAccountId', { preHandler: [authenticate] }, async (request) => {
    const { bankAccountId } = request.params as { bankAccountId: string };
    const q = request.query as any;
    return { success: true, ...await bankService.listReconciliationEntries(
      request.user!.companyId, bankAccountId, {
        is_matched: q.is_matched !== undefined ? q.is_matched === 'true' : undefined,
        from_date: q.from_date, to_date: q.to_date,
        page: parseInt(q.page) || 1, limit: parseInt(q.limit) || 50,
      }
    )};
  });

  // POST /finance/bank-reconciliation/:id/match
  server.post('/finance/bank-reconciliation/:id/match', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { ledger_entry_id } = request.body as any;
      if (!ledger_entry_id) return reply.code(400).send({ success: false, error: 'ledger_entry_id is required' });

      const matched = await bankService.matchEntry(id, request.user!.companyId, ledger_entry_id, request.user!.userId);
      return { success: true, message: 'Entry matched', data: matched };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // POST /finance/bank-reconciliation/:id/unmatch
  server.post('/finance/bank-reconciliation/:id/unmatch', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const unmatched = await bankService.unmatchEntry(id, request.user!.companyId, request.user!.userId);
      return { success: true, message: 'Entry unmatched', data: unmatched };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });

  // GET /finance/bank-reconciliation/:bankAccountId/summary
  server.get('/finance/bank-reconciliation/:bankAccountId/summary', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { bankAccountId } = request.params as { bankAccountId: string };
      const summary = await bankService.getReconciliationSummary(request.user!.companyId, bankAccountId);
      return { success: true, data: summary };
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      return reply.code(code).send({ success: false, error: error.message });
    }
  });
}