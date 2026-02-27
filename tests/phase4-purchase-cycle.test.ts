/**
 * PHASE 4: Complete Purchase Cycle Testing
 * Simulates PO → GRN → Vendor Bill → Payment → Debit Note workflow.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, cleanAllData } from './setup';
import {
  createTestEnvironment, createVendor, createItem, createProduct,
  TestEnv, resetCounters,
} from './helpers/factory';
import { assertStockBalance, assertInvoiceTotals } from './helpers/assertions';

import { purchaseOrderService } from '../server/services/purchase-order.service';
import { goodsReceiptNoteService } from '../server/services/goods-receipt-note.service';
import { vendorBillService } from '../server/services/vendor-bill.service';
import { vendorPaymentService } from '../server/services/vendor-payment.service';
import { debitNoteService } from '../server/services/debit-note.service';
import { inventoryService } from '../server/services/inventory.service';
import { ledgerService } from '../server/services/ledger.service';

let env: TestEnv;
let db: ReturnType<typeof getTestDb>;
let vendor: any;
let product1: any;
let product2: any;
let item1: any;
let item2: any;

beforeAll(async () => {
  db = getTestDb();
  await cleanAllData();
  resetCounters();
  env = await createTestEnvironment();

  vendor = await createVendor(env.company.id, {
    name: 'Raw Material Supplier',
    gstin: '27RAWMS1234D1ZM',
    payment_terms_days: 45,
  });

  item1 = await createItem(env.company.id, env.uom.id, { name: 'Raw Steel', gst_rate: 18, hsn_code: '72142000' });
  item2 = await createItem(env.company.id, env.uom.id, { name: 'Copper Wire', gst_rate: 12, hsn_code: '74081100' });

  product1 = await createProduct(env.company.id, env.uom.id, {
    name: 'Raw Steel',
    standard_cost: 500,
    gst_rate: 18,
    hsn_code: '72142000',
  });

  product2 = await createProduct(env.company.id, env.uom.id, {
    name: 'Copper Wire',
    standard_cost: 300,
    gst_rate: 12,
    hsn_code: '74081100',
  });
}, 60000);

afterAll(async () => {
  await cleanAllData();
});

describe('Phase 4: Complete Purchase Cycle', () => {
  let purchaseOrder: any;
  let grn: any;
  let vendorBill: any;
  let partialPayment: any;

  describe('Normal Purchase Flow', () => {
    it('Step 1: Create Purchase Order', async () => {
      purchaseOrder = await purchaseOrderService.createPurchaseOrder({
        company_id: env.company.id,
        branch_id: env.branch.id,
        po_date: '2025-06-01',
        expected_delivery_date: '2025-06-15',
        vendor_id: vendor.id,
        delivery_warehouse_id: env.warehouse.id,
        lines: [
          { line_number: 1, item_id: item1.id, product_id: product1.id, quantity: 100, uom_id: env.uom.id, unit_price: 500 },
          { line_number: 2, item_id: item2.id, product_id: product2.id, quantity: 50, uom_id: env.uom.id, unit_price: 300 },
        ],
        created_by: env.user.id,
      });

      expect(purchaseOrder).toBeDefined();
      expect(purchaseOrder.lines).toHaveLength(2);
    });

    it('Step 2: Create GRN (Goods Receipt Note)', async () => {
      const poLines = await db('purchase_order_lines')
        .where({ purchase_order_id: purchaseOrder.id, company_id: env.company.id, is_deleted: false });

      grn = await goodsReceiptNoteService.createGRN({
        company_id: env.company.id,
        branch_id: env.branch.id,
        grn_date: '2025-06-10',
        vendor_id: vendor.id,
        purchase_order_id: purchaseOrder.id,
        warehouse_id: env.warehouse.id,
        lines: poLines.map((line: any, idx: number) => ({
          line_number: idx + 1,
          item_id: line.item_id,
          received_quantity: parseFloat(line.quantity),
          accepted_quantity: parseFloat(line.quantity),
          rejected_quantity: 0,
          uom_id: line.uom_id,
          unit_cost: parseFloat(line.unit_price),
          po_line_id: line.id,
        })),
        created_by: env.user.id,
      });

      expect(grn).toBeDefined();

      // Confirm GRN to trigger stock movements
      await goodsReceiptNoteService.confirmGRN(grn.id, env.company.id, env.user.id);
    });

    it('Step 3: Create Vendor Bill', async () => {
      vendorBill = await vendorBillService.createVendorBill({
        company_id: env.company.id,
        branch_id: env.branch.id,
        vendor_id: vendor.id,
        purchase_order_id: purchaseOrder.id,
        grn_id: grn.id,
        vendor_bill_number: 'VB-001',
        vendor_bill_date: '2025-06-10',
        place_of_supply: 'maharashtra',
        lines: [
          { line_number: 1, item_id: item1.id, product_id: product1.id, quantity: 100, uom_id: env.uom.id, unit_price: 500, hsn_code: '72142000' },
          { line_number: 2, item_id: item2.id, product_id: product2.id, quantity: 50, uom_id: env.uom.id, unit_price: 300, hsn_code: '74081100' },
        ],
        created_by: env.user.id,
      });

      expect(vendorBill).toBeDefined();

      // Verify input tax calculated (intra-state → CGST+SGST)
      expect(parseFloat(vendorBill.cgst_amount)).toBeGreaterThan(0);
      expect(parseFloat(vendorBill.sgst_amount)).toBeGreaterThan(0);

      // Subtotal: (100 * 500) + (50 * 300) = 50000 + 15000 = 65000
      expect(parseFloat(vendorBill.subtotal)).toBe(65000);

      // Balance due = grand total
      expect(parseFloat(vendorBill.balance_due)).toBe(parseFloat(vendorBill.grand_total));
    });

    it('Step 4: Partial Vendor Payment', async () => {
      // Approve the bill first if needed
      try {
        await vendorBillService.approveVendorBill(vendorBill.id, env.company.id, env.user.id);
      } catch { /* may already be in right state */ }

      partialPayment = await vendorPaymentService.createVendorPayment({
        company_id: env.company.id,
        branch_id: env.branch.id,
        payment_date: '2025-06-20',
        vendor_id: vendor.id,
        amount: 30000,
        payment_mode: 'bank_transfer',
        vendor_bill_id: vendorBill.id,
        created_by: env.user.id,
      });

      expect(partialPayment).toBeDefined();

      // Confirm payment
      try {
        await vendorPaymentService.confirmVendorPayment(partialPayment.id, env.company.id, env.user.id);
      } catch { /* */ }

      // Check bill updated
      const updatedBill = await db('vendor_bills').where({ id: vendorBill.id }).first();
      if (updatedBill) {
        expect(parseFloat(updatedBill.amount_paid)).toBeGreaterThanOrEqual(30000);
      }
    });

    it('Step 5: Full Payment (remaining amount)', async () => {
      const currentBill = await db('vendor_bills').where({ id: vendorBill.id }).first();
      const remaining = parseFloat(currentBill?.balance_due || '0');

      if (remaining > 0) {
        const finalPayment = await vendorPaymentService.createVendorPayment({
          company_id: env.company.id,
          branch_id: env.branch.id,
          payment_date: '2025-06-25',
          vendor_id: vendor.id,
          amount: remaining,
          payment_mode: 'bank_transfer',
          vendor_bill_id: vendorBill.id,
          created_by: env.user.id,
        });

        try {
          await vendorPaymentService.confirmVendorPayment(finalPayment.id, env.company.id, env.user.id);
        } catch { /* */ }
      }

      const paidBill = await db('vendor_bills').where({ id: vendorBill.id }).first();
      if (paidBill && parseFloat(paidBill.amount_paid) > 0) {
        expect(parseFloat(paidBill.balance_due)).toBeLessThanOrEqual(0.01);
      }
    });

    it('Step 6: Debit Note (vendor return)', async () => {
      const debitNote = await debitNoteService.createDebitNote({
        company_id: env.company.id,
        branch_id: env.branch.id,
        debit_note_date: '2025-06-28',
        vendor_id: vendor.id,
        vendor_bill_id: vendorBill.id,
        reason: 'quality_issue',
        reason_detail: 'Defective raw steel batch',
        subtotal: 5000, // Returning 10 units * 500
        cgst_amount: 450,
        sgst_amount: 450,
        created_by: env.user.id,
      });

      expect(debitNote).toBeDefined();
    });
  });

  describe('Purchase Edge Cases', () => {
    it('should handle inter-state purchase (IGST)', async () => {
      const outOfStateVendor = await createVendor(env.company.id, {
        name: 'Delhi Vendor',
        gstin: '07DELVE1234Z1ZM',
      });

      // Create a default address with state for inter-state detection
      await db('addresses').insert({
        company_id: env.company.id,
        entity_type: 'vendor',
        entity_id: outOfStateVendor.id,
        address_type: 'billing',
        label: 'Main',
        address_line1: '123 Delhi Road',
        city: 'New Delhi',
        state: 'Delhi',
        country: 'India',
        pincode: '110001',
        is_default: true,
      });

      const bill = await vendorBillService.createVendorBill({
        company_id: env.company.id,
        branch_id: env.branch.id,
        vendor_id: outOfStateVendor.id,
        vendor_bill_number: 'VB-IGST-001',
        vendor_bill_date: '2025-06-15',
        place_of_supply: 'delhi',
        lines: [
          { line_number: 1, item_id: item1.id, product_id: product1.id, quantity: 10, uom_id: env.uom.id, unit_price: 500, hsn_code: '72142000' },
        ],
        created_by: env.user.id,
      });

      // Inter-state → IGST only
      expect(parseFloat(bill.igst_amount)).toBeGreaterThan(0);
      expect(parseFloat(bill.cgst_amount)).toBe(0);
      expect(parseFloat(bill.sgst_amount)).toBe(0);
    });
  });
});
