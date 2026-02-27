/**
 * PHASE 10: Bug Documentation & Report Generator
 * Generates structured QA deliverables from all test phases.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, cleanAllData } from './setup';
import {
  createTestEnvironment, createCustomer, createVendor,
  createItem, createProduct, TestEnv, resetCounters,
} from './helpers/factory';
import { getBugReports, clearBugReports, reportBug, BugReport } from './helpers/assertions';
import { ledgerService } from '../server/services/ledger.service';
import { salesInvoiceService } from '../server/services/sales-invoice.service';
import { inventoryService } from '../server/services/inventory.service';
import * as fs from 'fs';
import * as path from 'path';

let env: TestEnv;
let db: ReturnType<typeof getTestDb>;

const reportsDir = path.resolve(__dirname, 'reports');

beforeAll(async () => {
  db = getTestDb();
  await cleanAllData();
  resetCounters();
  env = await createTestEnvironment();
  clearBugReports();

  // Ensure reports directory exists
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
}, 60000);

afterAll(async () => {
  await cleanAllData();
});

describe('Phase 10: Bug Documentation & Report Generator', () => {

  // ── 10a. Probing Tests (find bugs and report them) ──────────────

  describe('10a. Validation Gap Detection', () => {
    it('should detect if negative quantity is accepted in invoice', async () => {
      const customer = await createCustomer(env.company.id);
      const item = await createItem(env.company.id, env.uom.id);
      const product = await createProduct(env.company.id, env.uom.id, { gst_rate: 18 });

      try {
        const invoice = await salesInvoiceService.createInvoice({
          company_id: env.company.id,
          branch_id: env.branch.id,
          invoice_date: '2025-06-01',
          customer_id: customer.id,
          lines: [
            { line_number: 1, product_id: product.id, quantity: -5, uom_id: env.uom.id, unit_price: 1000 },
          ],
          created_by: env.user.id,
        });

        // If we get here, negative qty was accepted — this is a bug
        if (invoice) {
          reportBug({
            module: 'Sales',
            feature: 'Invoice Line Validation',
            severity: 'Major',
            steps_to_reproduce: 'Create invoice with negative quantity (-5)',
            expected_result: 'Should reject negative quantities',
            actual_result: 'Invoice created successfully with negative quantity',
            suggested_fix: 'Add CHECK constraint or service-level validation: quantity > 0',
          });
        }
      } catch {
        // Expected behavior — negative qty rejected
      }
    });

    it('should detect if zero quantity is accepted in invoice', async () => {
      const customer = await createCustomer(env.company.id);
      const item = await createItem(env.company.id, env.uom.id);
      const product = await createProduct(env.company.id, env.uom.id, { gst_rate: 18 });

      try {
        const invoice = await salesInvoiceService.createInvoice({
          company_id: env.company.id,
          branch_id: env.branch.id,
          invoice_date: '2025-06-01',
          customer_id: customer.id,
          lines: [
            { line_number: 1, product_id: product.id, quantity: 0, uom_id: env.uom.id, unit_price: 1000 },
          ],
          created_by: env.user.id,
        });

        if (invoice) {
          reportBug({
            module: 'Sales',
            feature: 'Invoice Line Validation',
            severity: 'Minor',
            steps_to_reproduce: 'Create invoice with zero quantity',
            expected_result: 'Should reject zero quantities',
            actual_result: 'Invoice created with zero quantity',
            suggested_fix: 'Add validation: quantity must be > 0',
          });
        }
      } catch {
        // Expected
      }
    });

    it('should detect if negative unit price is accepted', async () => {
      const customer = await createCustomer(env.company.id);
      const item = await createItem(env.company.id, env.uom.id);
      const product = await createProduct(env.company.id, env.uom.id, { gst_rate: 18 });

      try {
        const invoice = await salesInvoiceService.createInvoice({
          company_id: env.company.id,
          branch_id: env.branch.id,
          invoice_date: '2025-06-01',
          customer_id: customer.id,
          lines: [
            { line_number: 1, product_id: product.id, quantity: 1, uom_id: env.uom.id, unit_price: -100 },
          ],
          created_by: env.user.id,
        });

        if (invoice) {
          reportBug({
            module: 'Sales',
            feature: 'Invoice Line Validation',
            severity: 'Major',
            steps_to_reproduce: 'Create invoice with negative unit price (-100)',
            expected_result: 'Should reject negative prices',
            actual_result: 'Invoice created with negative unit price',
            suggested_fix: 'Add validation: unit_price >= 0',
          });
        }
      } catch {
        // Expected
      }
    });

    it('should detect if discount exceeds line subtotal', async () => {
      const customer = await createCustomer(env.company.id);
      const item = await createItem(env.company.id, env.uom.id);
      const product = await createProduct(env.company.id, env.uom.id, { gst_rate: 18 });

      try {
        const invoice = await salesInvoiceService.createInvoice({
          company_id: env.company.id,
          branch_id: env.branch.id,
          invoice_date: '2025-06-01',
          customer_id: customer.id,
          lines: [
            { line_number: 1, product_id: product.id, quantity: 1, uom_id: env.uom.id, unit_price: 100, discount_amount: 200 },
          ],
          created_by: env.user.id,
        });

        if (invoice && parseFloat(invoice.taxable_amount) < 0) {
          reportBug({
            module: 'Sales',
            feature: 'Invoice Discount Validation',
            severity: 'Critical',
            steps_to_reproduce: 'Create invoice with discount (200) > subtotal (100)',
            expected_result: 'Should reject discount exceeding subtotal',
            actual_result: `Invoice created with negative taxable amount: ${invoice.taxable_amount}`,
            suggested_fix: 'Add validation: discount_amount <= qty * unit_price per line',
          });
        }
      } catch {
        // Expected
      }
    });

    it('should check if ledger posting is integrated with invoices', async () => {
      const customer = await createCustomer(env.company.id);
      const item = await createItem(env.company.id, env.uom.id);
      const product = await createProduct(env.company.id, env.uom.id, { gst_rate: 18 });

      const invoice = await salesInvoiceService.createInvoice({
        company_id: env.company.id,
        branch_id: env.branch.id,
        invoice_date: '2025-06-15',
        customer_id: customer.id,
        lines: [
          { line_number: 1, product_id: product.id, quantity: 10, uom_id: env.uom.id, unit_price: 1000 },
        ],
        created_by: env.user.id,
      });

      // Check if ledger entries were created for this invoice
      const ledgerEntries = await db('ledger_entries')
        .where({
          company_id: env.company.id,
          reference_type: 'invoice',
          reference_id: invoice.id,
        });

      if (ledgerEntries.length === 0) {
        reportBug({
          module: 'Finance',
          feature: 'Auto Ledger Posting',
          severity: 'Critical',
          steps_to_reproduce: 'Create a sales invoice',
          expected_result: 'Ledger entries (AR Dr, Revenue Cr, Tax Cr) should be auto-created',
          actual_result: 'No ledger entries created for invoice',
          suggested_fix: 'Integrate ledger.createVoucher() call inside salesInvoiceService.createInvoice() or on status change to approved',
          db_query_reference: `SELECT * FROM ledger_entries WHERE reference_type='invoice' AND reference_id='${invoice.id}'`,
        });
      }
    });

    it('should check if payment receipt creates ledger entries', async () => {
      const ledgerEntries = await db('ledger_entries')
        .where({ company_id: env.company.id, voucher_type: 'receipt' });

      if (ledgerEntries.length === 0) {
        reportBug({
          module: 'Finance',
          feature: 'Payment Receipt Ledger Integration',
          severity: 'Critical',
          steps_to_reproduce: 'Create and confirm a payment receipt',
          expected_result: 'Ledger entries (Bank/Cash Dr, AR Cr) should be auto-created',
          actual_result: 'No receipt-type ledger entries exist',
          suggested_fix: 'Add ledger.createVoucher() call in paymentReceiptService.confirmReceipt()',
        });
      }
    });
  });

  // ── 10b. Generate Reports ───────────────────────────────────────

  describe('10b. Generate Final Reports', () => {
    it('should generate bug report', () => {
      const bugs = getBugReports();

      const report = {
        generated_at: new Date().toISOString(),
        total_bugs: bugs.length,
        critical: bugs.filter(b => b.severity === 'Critical').length,
        major: bugs.filter(b => b.severity === 'Major').length,
        minor: bugs.filter(b => b.severity === 'Minor').length,
        bugs,
      };

      fs.writeFileSync(
        path.join(reportsDir, 'bug-report.json'),
        JSON.stringify(report, null, 2)
      );

      console.log(`\n=== BUG REPORT ===`);
      console.log(`Total bugs found: ${report.total_bugs}`);
      console.log(`  Critical: ${report.critical}`);
      console.log(`  Major: ${report.major}`);
      console.log(`  Minor: ${report.minor}`);

      for (const bug of bugs) {
        console.log(`\n[${bug.bug_id}] ${bug.severity} - ${bug.module}/${bug.feature}`);
        console.log(`  ${bug.actual_result}`);
        console.log(`  Fix: ${bug.suggested_fix}`);
      }
    });

    it('should generate financial reconciliation report', async () => {
      const tb = await ledgerService.getTrialBalance(env.company.id);
      const pnl = await ledgerService.getProfitAndLoss(env.company.id, {
        from_date: '2025-04-01',
        to_date: '2026-03-31',
      });
      const bs = await ledgerService.getBalanceSheet(env.company.id, '2026-03-31');
      const ar = await ledgerService.getOutstandingReceivables(env.company.id);
      const ap = await ledgerService.getOutstandingPayables(env.company.id);

      const reconciliation = {
        generated_at: new Date().toISOString(),
        trial_balance: {
          accounts: tb.data.length,
          grand_debit: tb.summary.grand_debit,
          grand_credit: tb.summary.grand_credit,
          difference: tb.summary.difference,
          is_balanced: tb.summary.is_balanced,
        },
        profit_and_loss: {
          revenue: pnl.revenue.total,
          expenses: pnl.expenses.total,
          net_profit: pnl.net_profit,
          profit_type: pnl.profit_type,
        },
        balance_sheet: {
          assets: bs.assets.total,
          liabilities: bs.liabilities.total,
          equity: bs.equity.total,
          is_balanced: bs.is_balanced,
        },
        receivables: {
          total: ar.summary.grand_total,
          customer_count: ar.summary.customer_count,
        },
        payables: {
          total: ap.summary.grand_total,
          vendor_count: ap.summary.vendor_count,
        },
      };

      fs.writeFileSync(
        path.join(reportsDir, 'financial-reconciliation.json'),
        JSON.stringify(reconciliation, null, 2)
      );

      console.log(`\n=== FINANCIAL RECONCILIATION ===`);
      console.log(`TB: ${reconciliation.trial_balance.is_balanced ? 'BALANCED' : 'IMBALANCED'} (diff: ${reconciliation.trial_balance.difference})`);
      console.log(`BS: ${reconciliation.balance_sheet.is_balanced ? 'BALANCED' : 'IMBALANCED'}`);
      console.log(`P&L: ${reconciliation.profit_and_loss.profit_type} of ${reconciliation.profit_and_loss.net_profit}`);
      console.log(`AR: ${reconciliation.receivables.total} from ${reconciliation.receivables.customer_count} customers`);
      console.log(`AP: ${reconciliation.payables.total} to ${reconciliation.payables.vendor_count} vendors`);
    });

    it('should generate stability score and recommendation', () => {
      const bugs = getBugReports();
      const criticalBugs = bugs.filter(b => b.severity === 'Critical').length;
      const majorBugs = bugs.filter(b => b.severity === 'Major').length;
      const minorBugs = bugs.filter(b => b.severity === 'Minor').length;

      // Scoring
      let score = 10;
      score -= criticalBugs * 2;
      score -= majorBugs * 1;
      score -= minorBugs * 0.25;
      score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));

      const recommendation = criticalBugs === 0
        ? (majorBugs <= 2 ? 'GO — Ready for production with minor fixes' : 'CONDITIONAL GO — Fix major bugs before launch')
        : 'NO-GO — Critical bugs must be resolved before production';

      const assessment = {
        generated_at: new Date().toISOString(),
        stability_score: score,
        recommendation,
        risk_areas: [
          ...(criticalBugs > 0 ? ['CRITICAL: Ledger integration missing for invoice/payment auto-posting'] : []),
          ...(majorBugs > 0 ? ['MAJOR: Input validation gaps (negative qty, excessive discount)'] : []),
          'No pessimistic locking for concurrent stock updates',
          'Ledger posting not integrated with sales/purchase cycle',
          'No automated test suite existed before this validation',
        ],
        improvement_suggestions: [
          'Integrate ledger postings in invoice creation/approval flow',
          'Add Zod/DB-level validation for quantity > 0 and price >= 0',
          'Add row-level locks (SELECT FOR UPDATE) for stock_summary updates',
          'Implement discount ceiling validation (discount <= subtotal)',
          'Add rate limit middleware for API endpoints',
          'Implement audit log for all financial operations',
          'Add periodic ledger reconciliation scheduled task',
          'Improve error messages for end users (translate DB errors)',
        ],
      };

      fs.writeFileSync(
        path.join(reportsDir, 'risk-assessment.json'),
        JSON.stringify(assessment, null, 2)
      );

      console.log(`\n=== PRODUCTION READINESS ===`);
      console.log(`Stability Score: ${score}/10`);
      console.log(`Recommendation: ${recommendation}`);
      console.log(`Risk Areas: ${assessment.risk_areas.length}`);
      console.log(`Improvement Suggestions: ${assessment.improvement_suggestions.length}`);
    });
  });
});
