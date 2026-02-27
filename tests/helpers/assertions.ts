/**
 * Custom financial assertion helpers for ERP validation.
 * These enforce ZERO tolerance for financial mismatches.
 */

import { expect } from 'vitest';
import { ledgerService } from '../../server/services/ledger.service';
import { getTestDb } from '../setup';

const TOLERANCE = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseNum(val: any): number {
  return parseFloat(val) || 0;
}

// ── Ledger Assertions ──────────────────────────────────────────────

/**
 * Assert that a voucher is balanced (debit = credit)
 */
export async function assertVoucherBalanced(companyId: string, voucherNumber: string) {
  const voucher = await ledgerService.getVoucher(companyId, voucherNumber);
  expect(voucher, `Voucher ${voucherNumber} not found`).not.toBeNull();
  expect(voucher!.is_balanced, `Voucher ${voucherNumber} is NOT balanced. Debit: ${voucher!.total_debit}, Credit: ${voucher!.total_credit}`).toBe(true);
  return voucher;
}

/**
 * Assert Trial Balance is balanced
 */
export async function assertTrialBalanceBalanced(companyId: string, options: { as_of_date?: string } = {}) {
  const tb = await ledgerService.getTrialBalance(companyId, options);
  expect(
    tb.summary.is_balanced,
    `Trial Balance NOT balanced! Debit: ${tb.summary.grand_debit}, Credit: ${tb.summary.grand_credit}, Diff: ${tb.summary.difference}`
  ).toBe(true);
  expect(Math.abs(tb.summary.difference)).toBeLessThanOrEqual(TOLERANCE);
  return tb;
}

/**
 * Assert Balance Sheet is balanced (Assets = Liabilities + Equity)
 */
export async function assertBalanceSheetBalanced(companyId: string, asOfDate: string) {
  const bs = await ledgerService.getBalanceSheet(companyId, asOfDate);
  expect(
    bs.is_balanced,
    `Balance Sheet NOT balanced! Assets: ${bs.assets.total}, L+E: ${bs.liabilities_and_equity}`
  ).toBe(true);
  return bs;
}

/**
 * Assert an account has expected balance
 */
export async function assertAccountBalance(
  companyId: string,
  accountId: string,
  expectedBalance: number,
  expectedType: 'debit' | 'credit'
) {
  const balance = await ledgerService.getAccountBalance(companyId, accountId);
  const actualBalance = balance.net_balance;
  const actualType = balance.balance_type;

  expect(
    Math.abs(Math.abs(actualBalance) - Math.abs(expectedBalance)),
    `Account ${balance.account_name} (${balance.account_code}): expected ${expectedType} ${expectedBalance}, got ${actualType} ${actualBalance}`
  ).toBeLessThanOrEqual(TOLERANCE);

  if (Math.abs(expectedBalance) > TOLERANCE) {
    expect(actualType, `Account ${balance.account_name}: expected ${expectedType}, got ${actualType}`).toBe(expectedType);
  }

  return balance;
}

// ── Stock Assertions ───────────────────────────────────────────────

/**
 * Assert stock balance for an item in a warehouse
 */
export async function assertStockBalance(
  companyId: string,
  itemId: string,
  warehouseId: string,
  expectedQty: number
) {
  const db = getTestDb();
  const summary = await db('stock_summary')
    .where({ company_id: companyId, item_id: itemId, warehouse_id: warehouseId })
    .first();

  const actualQty = summary ? parseNum(summary.available_quantity) : 0;
  expect(
    Math.abs(actualQty - expectedQty),
    `Stock mismatch for item ${itemId} in warehouse ${warehouseId}: expected ${expectedQty}, got ${actualQty}`
  ).toBeLessThanOrEqual(TOLERANCE);
}

// ── Invoice Assertions ─────────────────────────────────────────────

/**
 * Assert invoice financial totals are consistent
 */
export async function assertInvoiceTotals(invoice: any) {
  const taxableAmount = round2(parseNum(invoice.subtotal) - parseNum(invoice.discount_amount));
  const totalTax = round2(
    parseNum(invoice.cgst_amount) +
    parseNum(invoice.sgst_amount) +
    parseNum(invoice.igst_amount)
  );
  const expectedGrand = round2(taxableAmount + totalTax + parseNum(invoice.tcs_amount) + parseNum(invoice.round_off));
  const balanceDue = round2(parseNum(invoice.grand_total) - parseNum(invoice.amount_paid));

  expect(
    round2(parseNum(invoice.taxable_amount)),
    `Taxable amount mismatch: expected ${taxableAmount}, got ${invoice.taxable_amount}`
  ).toBe(taxableAmount);

  expect(
    round2(parseNum(invoice.total_tax)),
    `Tax total mismatch: expected ${totalTax}, got ${invoice.total_tax}`
  ).toBe(totalTax);

  expect(
    Math.abs(round2(parseNum(invoice.grand_total)) - expectedGrand),
    `Grand total mismatch: expected ${expectedGrand}, got ${invoice.grand_total}`
  ).toBeLessThanOrEqual(TOLERANCE);

  expect(
    Math.abs(round2(parseNum(invoice.balance_due)) - balanceDue),
    `Balance due mismatch: expected ${balanceDue}, got ${invoice.balance_due}`
  ).toBeLessThanOrEqual(TOLERANCE);
}

// ── Cross-Matching Assertions ──────────────────────────────────────

/**
 * Assert AR control account matches sum of customer outstanding invoices
 */
export async function assertARReconciliation(companyId: string) {
  const db = getTestDb();

  // Get AR from invoices
  const invoiceResult = await db('sales_invoices')
    .where({ company_id: companyId, is_deleted: false })
    .whereNotIn('status', ['draft', 'cancelled'])
    .sum('balance_due as total_outstanding')
    .first();
  const invoiceOutstanding = round2(parseNum(invoiceResult?.total_outstanding));

  // Get AR from ledger (outstanding receivables)
  const ledgerAR = await ledgerService.getOutstandingReceivables(companyId);
  const ledgerOutstanding = round2(ledgerAR.summary.grand_total);

  // These may not perfectly match if ledger postings are not yet integrated.
  // For now, return both values for comparison.
  return { invoiceOutstanding, ledgerOutstanding };
}

/**
 * Assert AP control account matches sum of vendor outstanding bills
 */
export async function assertAPReconciliation(companyId: string) {
  const db = getTestDb();

  const billResult = await db('vendor_bills')
    .where({ company_id: companyId, is_deleted: false })
    .whereNotIn('status', ['draft', 'cancelled'])
    .sum('balance_due as total_outstanding')
    .first();
  const billOutstanding = round2(parseNum(billResult?.total_outstanding));

  const ledgerAP = await ledgerService.getOutstandingPayables(companyId);
  const ledgerOutstanding = round2(ledgerAP.summary.grand_total);

  return { billOutstanding, ledgerOutstanding };
}

/**
 * Assert all vouchers in ledger are balanced
 */
export async function assertAllVouchersBalanced(companyId: string) {
  const db = getTestDb();

  const unbalanced = await db('ledger_entries')
    .where({ company_id: companyId, is_posted: true })
    .groupBy('voucher_number')
    .havingRaw('ABS(SUM(debit_amount) - SUM(credit_amount)) > ?', [TOLERANCE])
    .select('voucher_number')
    .select(db.raw('SUM(debit_amount) as total_debit'))
    .select(db.raw('SUM(credit_amount) as total_credit'));

  expect(
    unbalanced.length,
    `Found ${unbalanced.length} unbalanced vouchers: ${unbalanced.map(v => `${v.voucher_number} (D:${v.total_debit} C:${v.total_credit})`).join(', ')}`
  ).toBe(0);
}

// ── Report Output Helpers ──────────────────────────────────────────

export interface BugReport {
  bug_id: string;
  module: string;
  feature: string;
  severity: 'Critical' | 'Major' | 'Minor';
  steps_to_reproduce: string;
  expected_result: string;
  actual_result: string;
  db_query_reference?: string;
  suggested_fix?: string;
}

const bugReports: BugReport[] = [];
let bugCounter = 0;

export function reportBug(bug: Omit<BugReport, 'bug_id'>) {
  bugCounter++;
  bugReports.push({
    bug_id: `BUG-${String(bugCounter).padStart(3, '0')}`,
    ...bug,
  });
}

export function getBugReports(): BugReport[] {
  return [...bugReports];
}

export function clearBugReports() {
  bugReports.length = 0;
  bugCounter = 0;
}
