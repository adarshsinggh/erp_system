// src/api/modules/finance.api.ts
import apiClient, { ApiResponse, PaginatedResponse, ListParams } from '../client';

// ─── Types ──────────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type VoucherType = 'sales' | 'purchase' | 'receipt' | 'payment' | 'journal' | 'contra';
export type BankAccountType = 'current' | 'savings' | 'od' | 'cc';

export interface ChartAccount {
  [key: string]: unknown;
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_group: string;
  parent_id?: string;
  is_group: boolean;
  is_system: boolean;
  is_active: boolean;
  opening_balance?: number;
  opening_balance_type?: 'debit' | 'credit';
  depth?: number;
  children?: ChartAccount[];
}

export interface VoucherLine {
  id?: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  debit_amount: number;
  credit_amount: number;
  narration?: string;
  party_type?: string;
  party_id?: string;
  cost_center?: string;
}

export interface Voucher {
  id: string;
  voucher_number: string;
  voucher_type: VoucherType;
  voucher_date: string;
  narration?: string;
  is_posted: boolean;
  is_reversed: boolean;
  reference_type?: string;
  reference_number?: string;
  total_debit: number;
  total_credit: number;
  lines: VoucherLine[];
  created_at?: string;
}

export interface LedgerEntry {
  id: string;
  voucher_number: string;
  voucher_type: string;
  voucher_date: string;
  account_id?: string;
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
  running_balance?: number;
  narration?: string;
  party_type?: string;
  party_id?: string;
  party_name?: string;
  reference_type?: string;
  reference_number?: string;
}

export interface AccountBalance {
  account_id: string;
  account_code: string;
  account_name: string;
  debit_total: number;
  credit_total: number;
  closing_balance: number;
  closing_type: 'debit' | 'credit';
}

export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_group: string;
  debit_total: number;
  credit_total: number;
  closing_balance: number;
  closing_type: 'debit' | 'credit';
}

export interface ProfitAndLossData {
  income: { account_code: string; account_name: string; amount: number }[];
  expenses: { account_code: string; account_name: string; amount: number }[];
  total_income: number;
  total_expense: number;
  net_profit: number;
}

export interface BalanceSheetData {
  assets: { account_code: string; account_name: string; amount: number }[];
  liabilities: { account_code: string; account_name: string; amount: number }[];
  equity: { account_code: string; account_name: string; amount: number }[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
}

export interface OutstandingEntry {
  party_id: string;
  party_name: string;
  document_number: string;
  document_type: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  due_date?: string;
  days_overdue?: number;
}

export interface BankAccount {
  [key: string]: unknown;
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  ifsc_code?: string;
  branch_name?: string;
  account_type: BankAccountType;
  opening_balance: number;
  current_balance?: number;
  is_default: boolean;
  is_active: boolean;
  ledger_account_id?: string;
  created_at?: string;
}

export interface ReconciliationEntry {
  id: string;
  bank_account_id: string;
  statement_date: string;
  statement_reference?: string;
  statement_description?: string;
  statement_amount: number;
  is_matched: boolean;
  matched_ledger_entry_id?: string;
  matched_voucher_number?: string;
  matched_date?: string;
}

export interface ReconciliationSummary {
  book_balance: number;
  statement_balance: number;
  matched_count: number;
  unmatched_count: number;
  difference: number;
}

export interface AccountListParams extends ListParams {
  account_type?: string;
  account_group?: string;
  is_group?: boolean;
  parent_id?: string;
}

export interface LedgerQueryParams {
  [key: string]: unknown;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

export interface ReconciliationListParams {
  [key: string]: unknown;
  is_matched?: boolean;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

// ─── API ────────────────────────────────────────────────────────

export const financeApi = {
  // ── Chart of Accounts ──────────────────────────────────
  accounts: {
    seed: () =>
      apiClient.post<ApiResponse<{ message: string }>>('/finance/accounts/seed'),

    list: (params?: AccountListParams) =>
      apiClient.get<PaginatedResponse<ChartAccount>>('/finance/accounts', params),

    tree: () =>
      apiClient.get<ApiResponse<ChartAccount[]>>('/finance/accounts/tree'),

    getById: (id: string) =>
      apiClient.get<ApiResponse<ChartAccount>>(`/finance/accounts/${id}`),

    create: (data: {
      account_code: string; account_name: string; account_type: AccountType;
      account_group: string; parent_id?: string; is_group?: boolean;
      opening_balance?: number; opening_balance_type?: 'debit' | 'credit';
    }) =>
      apiClient.post<ApiResponse<ChartAccount>>('/finance/accounts', data),

    update: (id: string, data: Partial<ChartAccount>) =>
      apiClient.put<ApiResponse<ChartAccount>>(`/finance/accounts/${id}`, data),

    delete: (id: string) =>
      apiClient.del<ApiResponse<null>>(`/finance/accounts/${id}`),
  },

  // ── Vouchers ───────────────────────────────────────────
  vouchers: {
    create: (data: {
      voucher_type: VoucherType; voucher_date: string; narration?: string;
      lines: Omit<VoucherLine, 'id' | 'account_code' | 'account_name'>[];
    }) =>
      apiClient.post<ApiResponse<Voucher>>('/finance/vouchers', data),

    getByNumber: (voucherNumber: string) =>
      apiClient.get<ApiResponse<Voucher>>(`/finance/vouchers/${voucherNumber}`),

    reverse: (voucherNumber: string, data?: { narration?: string }) =>
      apiClient.post<ApiResponse<Voucher>>(`/finance/vouchers/${voucherNumber}/reverse`, data),
  },

  // ── Ledger Queries ─────────────────────────────────────
  ledger: {
    accountBalance: (accountId: string, params?: { from_date?: string; to_date?: string; [key: string]: unknown }) =>
      apiClient.get<ApiResponse<AccountBalance>>(`/finance/account-balance/${accountId}`, params),

    accountLedger: (accountId: string, params?: LedgerQueryParams) =>
      apiClient.get<PaginatedResponse<LedgerEntry>>(`/finance/account-ledger/${accountId}`, params),

    partyLedger: (partyType: 'customer' | 'vendor', partyId: string, params?: LedgerQueryParams) =>
      apiClient.get<PaginatedResponse<LedgerEntry>>(`/finance/party-ledger/${partyType}/${partyId}`, params),

    trialBalance: (params?: { as_of_date?: string; financial_year_id?: string; [key: string]: unknown }) =>
      apiClient.get<ApiResponse<TrialBalanceRow[]>>('/finance/trial-balance', params),

    profitAndLoss: (params: { from_date: string; to_date: string; branch_id?: string; [key: string]: unknown }) =>
      apiClient.get<ApiResponse<ProfitAndLossData>>('/finance/profit-and-loss', params),

    balanceSheet: (params: { as_of_date: string; [key: string]: unknown }) =>
      apiClient.get<ApiResponse<BalanceSheetData>>('/finance/balance-sheet', params),

    outstandingReceivables: () =>
      apiClient.get<ApiResponse<OutstandingEntry[]>>('/finance/outstanding-receivables'),

    outstandingPayables: () =>
      apiClient.get<ApiResponse<OutstandingEntry[]>>('/finance/outstanding-payables'),
  },

  // ── Bank Accounts ──────────────────────────────────────
  banks: {
    list: (params?: ListParams) =>
      apiClient.get<PaginatedResponse<BankAccount>>('/finance/bank-accounts', params),

    getById: (id: string) =>
      apiClient.get<ApiResponse<BankAccount>>(`/finance/bank-accounts/${id}`),

    create: (data: {
      account_name: string; bank_name: string; account_number: string;
      ifsc_code?: string; branch_name?: string; account_type: BankAccountType;
      opening_balance?: number; is_default?: boolean;
    }) =>
      apiClient.post<ApiResponse<BankAccount>>('/finance/bank-accounts', data),

    update: (id: string, data: Partial<BankAccount>) =>
      apiClient.put<ApiResponse<BankAccount>>(`/finance/bank-accounts/${id}`, data),

    delete: (id: string) =>
      apiClient.del<ApiResponse<null>>(`/finance/bank-accounts/${id}`),
  },

  // ── Bank Reconciliation ────────────────────────────────
  reconciliation: {
    listEntries: (bankAccountId: string, params?: ReconciliationListParams) =>
      apiClient.get<PaginatedResponse<ReconciliationEntry>>(`/finance/bank-reconciliation/${bankAccountId}`, params),

    createEntry: (data: {
      bank_account_id: string; statement_date: string;
      statement_reference?: string; statement_description?: string; statement_amount: number;
    }) =>
      apiClient.post<ApiResponse<ReconciliationEntry>>('/finance/bank-reconciliation', data),

    bulkImport: (data: {
      bank_account_id: string;
      entries: { statement_date: string; statement_reference?: string; statement_description?: string; statement_amount: number }[];
    }) =>
      apiClient.post<ApiResponse<{ imported: number }>>('/finance/bank-reconciliation/bulk-import', data),

    match: (id: string, data: { ledger_entry_id: string }) =>
      apiClient.post<ApiResponse<ReconciliationEntry>>(`/finance/bank-reconciliation/${id}/match`, data),

    unmatch: (id: string) =>
      apiClient.post<ApiResponse<ReconciliationEntry>>(`/finance/bank-reconciliation/${id}/unmatch`),

    summary: (bankAccountId: string) =>
      apiClient.get<ApiResponse<ReconciliationSummary>>(`/finance/bank-reconciliation/${bankAccountId}/summary`),
  },
};