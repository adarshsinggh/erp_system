// =============================================================
// File: server/services/payment-receipt.service.ts
// Module: Sales Management — Phase 5, Step 20
// Description: Payment Receipt service for customer payments.
//              Supports invoice allocation (partial/full),
//              advance payments (no invoice), multiple payment
//              modes (cash, bank, cheque, UPI, card), TDS
//              deduction tracking, cheque bounce handling,
//              and customer payment history.
//
// Note: Auto ledger posting (double-entry) will integrate
//       when the Financial Module (Phase 9) is built.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { salesInvoiceService } from './sales-invoice.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export type PaymentMode = 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'card';

export interface CreatePaymentReceiptInput {
  company_id: string;
  branch_id: string;
  receipt_date: string;
  customer_id: string;
  amount: number;
  payment_mode: PaymentMode;
  bank_account_id?: string;
  cheque_number?: string;
  cheque_date?: string;
  reference_number?: string;
  invoice_id?: string;          // null = advance payment
  tds_deducted?: number;
  narration?: string;
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface UpdatePaymentReceiptInput {
  receipt_date?: string;
  amount?: number;
  payment_mode?: PaymentMode;
  bank_account_id?: string;
  cheque_number?: string;
  cheque_date?: string;
  reference_number?: string;
  invoice_id?: string;
  tds_deducted?: number;
  narration?: string;
  metadata?: Record<string, any>;
  updated_by?: string;
}

export interface ListPaymentReceiptsOptions extends ListOptions {
  customer_id?: string;
  branch_id?: string;
  invoice_id?: string;
  payment_mode?: PaymentMode;
  from_date?: string;
  to_date?: string;
  is_advance?: boolean;
}

// ────────────────────────────────────────────────────────────
// DB Row Types
// ────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: string;
  company_id: string;
  customer_id: string;
  invoice_number: string;
  grand_total: string;
  amount_paid: string;
  balance_due: string;
  status: string;
  [key: string]: any;
}

// ────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class PaymentReceiptService extends BaseService {
  constructor() {
    super('payment_receipts');
  }

  // ──────── CREATE ────────

  async createPaymentReceipt(input: CreatePaymentReceiptInput) {
    return await this.db.transaction(async (trx) => {
      // Validate customer
      const customer = await trx('customers')
        .where({ id: input.customer_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!customer) throw new Error('Customer not found');

      // Validate branch
      const branch = await trx('branches')
        .where({ id: input.branch_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!branch) throw new Error('Branch not found');

      // Validate invoice if provided
      if (input.invoice_id) {
        const invoice = await trx('sales_invoices')
          .where({ id: input.invoice_id, company_id: input.company_id, is_deleted: false })
          .first() as InvoiceRow | undefined;

        if (!invoice) throw new Error('Invoice not found');
        if (invoice.customer_id !== input.customer_id) {
          throw new Error('Invoice does not belong to the specified customer');
        }
        if (['draft', 'cancelled'].includes(invoice.status)) {
          throw new Error(`Cannot receive payment against a ${invoice.status} invoice`);
        }

        // Validate payment amount doesn't exceed balance_due (including TDS)
        const effectivePayment = round2(input.amount + (input.tds_deducted || 0));
        const amountDue = parseFloat(invoice.balance_due);
        if (effectivePayment > round2(amountDue + 0.01)) { // small tolerance for rounding
          throw new Error(
            `Payment amount (${input.amount}) plus TDS (${input.tds_deducted || 0}) = ${effectivePayment} ` +
            `exceeds invoice amount due (${amountDue})`
          );
        }
      }

      // Validate bank_account_id for non-cash payments
      if (input.bank_account_id) {
        const bankAccount = await trx('bank_accounts')
          .where({ id: input.bank_account_id, company_id: input.company_id, is_deleted: false })
          .first();
        if (!bankAccount) throw new Error('Bank account not found');
      }

      // Validate cheque details for cheque payments
      if (input.payment_mode === 'cheque') {
        if (!input.cheque_number) {
          throw new Error('cheque_number is required for cheque payments');
        }
      }

      // Auto-generate receipt number
      // Must query ALL records (including soft-deleted) because the
      // unique constraint on (company_id, receipt_number) includes deleted rows.
      const lastReceipt = await trx('payment_receipts')
        .where({ company_id: input.company_id })
        .orderBy('created_at', 'desc')
        .first();

      let receiptNumber: string;
      if (lastReceipt) {
        const match = lastReceipt.receipt_number.match(/(\d+)$/);
        const nextNum = match ? parseInt(match[1]) + 1 : 1;
        receiptNumber = `REC-${String(nextNum).padStart(5, '0')}`;
      } else {
        receiptNumber = 'REC-00001';
      }

      // Insert receipt
      const [receipt] = await trx('payment_receipts')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          receipt_number: receiptNumber,
          receipt_date: input.receipt_date,
          customer_id: input.customer_id,
          amount: input.amount,
          payment_mode: input.payment_mode,
          bank_account_id: input.bank_account_id || null,
          cheque_number: input.cheque_number || null,
          cheque_date: input.cheque_date || null,
          reference_number: input.reference_number || null,
          invoice_id: input.invoice_id || null,
          tds_deducted: input.tds_deducted || null,
          notes: input.narration || null,
          status: 'draft',
          metadata: input.metadata || {},
          created_by: input.created_by,
        })
        .returning('*');

      return receipt;
    });
  }

  // ──────── CONFIRM (draft → confirmed) ────────
  // This is the key action: updates invoice amount_paid/amount_due

  async confirmReceipt(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const receipt = await trx('payment_receipts')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!receipt) throw new Error('Payment receipt not found');
      if (receipt.status !== 'draft') {
        throw new Error(`Cannot confirm. Current status: "${receipt.status}"`);
      }

      // If linked to invoice, update invoice amount_paid/amount_due
      if (receipt.invoice_id) {
        const paymentAmount = parseFloat(receipt.amount);
        const tdsAmount = parseFloat(receipt.tds_deducted || '0');
        const totalSettlement = round2(paymentAmount + tdsAmount);

        await salesInvoiceService.recordPayment(
          receipt.invoice_id,
          companyId,
          totalSettlement,
          userId,
          trx
        );
      }

      // Confirm the receipt
      const [confirmed] = await trx('payment_receipts')
        .where({ id })
        .update({
          status: 'confirmed',
          updated_by: userId,
        })
        .returning('*');

      return confirmed;
    });
  }

  // ──────── BOUNCE (confirmed → bounced, for cheque payments) ────────
  // Reverses the invoice payment

  async bounceReceipt(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const receipt = await trx('payment_receipts')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!receipt) throw new Error('Payment receipt not found');
      if (receipt.status !== 'confirmed') {
        throw new Error(`Cannot bounce. Current status: "${receipt.status}". Only confirmed receipts can bounce.`);
      }
      if (receipt.payment_mode !== 'cheque') {
        throw new Error('Bounce is only applicable to cheque payments');
      }

      // Reverse invoice payment if linked
      if (receipt.invoice_id) {
        const invoice = await trx('sales_invoices')
          .where({ id: receipt.invoice_id, company_id: companyId, is_deleted: false })
          .first() as InvoiceRow | undefined;

        if (invoice) {
          const paymentAmount = parseFloat(receipt.amount);
          const tdsAmount = parseFloat(receipt.tds_deducted || '0');
          const totalSettlement = round2(paymentAmount + tdsAmount);

          const newAmountPaid = round2(Math.max(0, parseFloat(invoice.amount_paid) - totalSettlement));
          const newAmountDue = round2(parseFloat(invoice.grand_total) - newAmountPaid);

          let newStatus = invoice.status;
          if (newAmountDue >= parseFloat(invoice.grand_total)) {
            // Check if overdue
            const today = new Date().toISOString().split('T')[0];
            if (invoice.due_date && invoice.due_date < today) {
              newStatus = 'overdue';
            } else {
              newStatus = 'sent'; // revert to sent
            }
          } else if (newAmountPaid > 0) {
            newStatus = 'partially_paid';
          }

          await trx('sales_invoices')
            .where({ id: receipt.invoice_id })
            .update({
              amount_paid: newAmountPaid,
              balance_due: newAmountDue,
              status: newStatus,
              updated_by: userId,
            });
        }
      }

      // Mark receipt as bounced
      const [bounced] = await trx('payment_receipts')
        .where({ id })
        .update({
          status: 'bounced',
          updated_by: userId,
        })
        .returning('*');

      return bounced;
    });
  }

  // ──────── CANCEL (draft only) ────────

  async cancelReceipt(id: string, companyId: string, userId: string) {
    const receipt = await this.getById(id, companyId);
    if (!receipt) throw new Error('Payment receipt not found');

    if (receipt.status !== 'draft') {
      throw new Error(
        `Cannot cancel. Current status: "${receipt.status}". Only draft receipts can be cancelled. ` +
        `For confirmed cheque receipts, use the bounce action.`
      );
    }

    const [cancelled] = await this.db('payment_receipts')
      .where({ id, company_id: companyId })
      .update({ status: 'cancelled', updated_by: userId })
      .returning('*');

    return cancelled;
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getReceiptWithDetails(id: string, companyId: string) {
    const receipt = await this.getById(id, companyId);
    if (!receipt) return null;

    // Customer
    const customer = await this.db('customers')
      .where({ id: receipt.customer_id })
      .select('id', 'customer_code', 'name', 'display_name', 'gstin')
      .first();

    // Branch
    const branch = await this.db('branches')
      .where({ id: receipt.branch_id })
      .select('id', 'code', 'name')
      .first();

    // Invoice (if linked)
    let invoice = null;
    if (receipt.invoice_id) {
      invoice = await this.db('sales_invoices')
        .where({ id: receipt.invoice_id })
        .select(
          'id', 'invoice_number', 'invoice_date', 'grand_total',
          'amount_paid', 'balance_due', 'status'
        )
        .first();
    }

    // Bank account (if linked)
    let bankAccount = null;
    if (receipt.bank_account_id) {
      bankAccount = await this.db('bank_accounts')
        .where({ id: receipt.bank_account_id })
        .select('id', 'account_name', 'bank_name', 'account_number')
        .first();
    }

    return {
      ...receipt,
      customer,
      branch,
      invoice,
      bank_account: bankAccount,
      is_advance: !receipt.invoice_id,
    };
  }

  // ──────── LIST ────────

  async listPaymentReceipts(options: ListPaymentReceiptsOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'receipt_date',
      sortOrder = 'desc',
      customer_id,
      branch_id,
      invoice_id,
      payment_mode,
      from_date,
      to_date,
      is_advance,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('payment_receipts')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (customer_id) query = query.where('customer_id', customer_id);
    if (branch_id) query = query.where('branch_id', branch_id);
    if (invoice_id) query = query.where('invoice_id', invoice_id);
    if (payment_mode) query = query.where('payment_mode', payment_mode);
    if (from_date) query = query.where('receipt_date', '>=', from_date);
    if (to_date) query = query.where('receipt_date', '<=', to_date);

    if (is_advance === true) {
      query = query.whereNull('invoice_id');
    } else if (is_advance === false) {
      query = query.whereNotNull('invoice_id');
    }

    if (search) {
      query = query.where(function () {
        this.orWhereILike('receipt_number', `%${search}%`);
        this.orWhereILike('cheque_number', `%${search}%`);
        this.orWhereILike('reference_number', `%${search}%`);
        this.orWhereILike('notes', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);

    // Enrich
    if (data.length > 0) {
      const customerIds = [...new Set(data.map((r: any) => r.customer_id))];
      const customers = await this.db('customers')
        .whereIn('id', customerIds)
        .select('id', 'customer_code', 'name', 'display_name');
      const customerMap = new Map(customers.map((c: any) => [c.id, c]));

      const invoiceIds = [...new Set(data.filter((r: any) => r.invoice_id).map((r: any) => r.invoice_id))];
      let invoiceMap = new Map<string, any>();
      if (invoiceIds.length > 0) {
        const invoices = await this.db('sales_invoices')
          .whereIn('id', invoiceIds)
          .select('id', 'invoice_number', 'grand_total', 'balance_due');
        invoiceMap = new Map(invoices.map((inv: any) => [inv.id, inv]));
      }

      for (const r of data) {
        (r as any).customer = customerMap.get(r.customer_id);
        (r as any).invoice = r.invoice_id ? invoiceMap.get(r.invoice_id) : null;
        (r as any).is_advance = !r.invoice_id;
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updatePaymentReceipt(id: string, companyId: string, input: UpdatePaymentReceiptInput) {
    const existing = await this.getById(id, companyId);
    if (!existing) throw new Error('Payment receipt not found');

    if (existing.status !== 'draft') {
      throw new Error(`Cannot edit receipt in "${existing.status}" status`);
    }

    // If changing invoice, validate the new invoice
    if (input.invoice_id && input.invoice_id !== existing.invoice_id) {
      const invoice = await this.db('sales_invoices')
        .where({ id: input.invoice_id, company_id: companyId, is_deleted: false })
        .first() as InvoiceRow | undefined;

      if (!invoice) throw new Error('Invoice not found');

      if (invoice.customer_id !== existing.customer_id) {
        throw new Error('Invoice does not belong to the specified customer');
      }
    }

    // Validate cheque fields
    const paymentMode = input.payment_mode || existing.payment_mode;
    if (paymentMode === 'cheque' && !input.cheque_number && !existing.cheque_number) {
      throw new Error('cheque_number is required for cheque payments');
    }

    const updateData: Record<string, any> = {};
    if (input.receipt_date !== undefined) updateData.receipt_date = input.receipt_date;
    if (input.amount !== undefined) updateData.amount = input.amount;
    if (input.payment_mode !== undefined) updateData.payment_mode = input.payment_mode;
    if (input.bank_account_id !== undefined) updateData.bank_account_id = input.bank_account_id || null;
    if (input.cheque_number !== undefined) updateData.cheque_number = input.cheque_number || null;
    if (input.cheque_date !== undefined) updateData.cheque_date = input.cheque_date || null;
    if (input.reference_number !== undefined) updateData.reference_number = input.reference_number || null;
    if (input.invoice_id !== undefined) updateData.invoice_id = input.invoice_id || null;
    if (input.tds_deducted !== undefined) updateData.tds_deducted = input.tds_deducted || null;
    if (input.narration !== undefined) updateData.notes = input.narration || null;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;

    const [updated] = await this.db('payment_receipts')
      .where({ id, company_id: companyId })
      .update({ ...updateData, updated_by: input.updated_by })
      .returning('*');

    return updated;
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deletePaymentReceipt(id: string, companyId: string, userId: string) {
    const receipt = await this.getById(id, companyId);
    if (!receipt) throw new Error('Payment receipt not found');

    if (receipt.status !== 'draft') {
      throw new Error('Only draft payment receipts can be deleted');
    }

    const [deleted] = await this.db('payment_receipts')
      .where({ id, company_id: companyId, is_deleted: false })
      .update({
        is_deleted: true,
        deleted_at: this.db.fn.now(),
        deleted_by: userId,
      })
      .returning('*');

    return deleted;
  }

  // ──────── CUSTOMER PAYMENT HISTORY ────────

  async getCustomerPaymentHistory(customerId: string, companyId: string, options?: {
    from_date?: string;
    to_date?: string;
    limit?: number;
  }) {
    let query = this.db('payment_receipts')
      .where({ customer_id: customerId, company_id: companyId, is_deleted: false })
      .whereNot('status', 'cancelled');

    if (options?.from_date) query = query.where('receipt_date', '>=', options.from_date);
    if (options?.to_date) query = query.where('receipt_date', '<=', options.to_date);

    const receipts = await query
      .orderBy('receipt_date', 'desc')
      .limit(options?.limit || 100);

    // Summary
    const summary = await this.db('payment_receipts')
      .where({ customer_id: customerId, company_id: companyId, is_deleted: false })
      .whereNot('status', 'cancelled')
      .select(
        this.db.raw('COUNT(*) as total_receipts'),
        this.db.raw(`COALESCE(SUM(amount), 0) as total_received`),
        this.db.raw(`COALESCE(SUM(tds_deducted), 0) as total_tds`),
        this.db.raw(`COUNT(*) FILTER (WHERE status = 'bounced') as bounced_count`),
        this.db.raw(`COALESCE(SUM(amount) FILTER (WHERE status = 'bounced'), 0) as bounced_amount`),
        this.db.raw(`COUNT(*) FILTER (WHERE invoice_id IS NULL AND status = 'confirmed') as advance_count`),
        this.db.raw(`COALESCE(SUM(amount) FILTER (WHERE invoice_id IS NULL AND status = 'confirmed'), 0) as advance_amount`)
      )
      .first();

    return { receipts, summary };
  }

  // ──────── UNALLOCATED ADVANCE PAYMENTS ────────
  // Returns confirmed advance payments (no invoice) for a customer

  async getUnallocatedAdvances(customerId: string, companyId: string) {
    const advances = await this.db('payment_receipts')
      .where({
        customer_id: customerId,
        company_id: companyId,
        status: 'confirmed',
        is_deleted: false,
      })
      .whereNull('invoice_id')
      .orderBy('receipt_date', 'asc');

    const total = advances.reduce(
      (sum: number, r: any) => sum + parseFloat(r.amount),
      0
    );

    return { advances, total_unallocated: round2(total) };
  }

  // ──────── ALLOCATE ADVANCE TO INVOICE ────────
  // Links an unallocated advance payment to an invoice

  async allocateAdvanceToInvoice(
    receiptId: string,
    invoiceId: string,
    companyId: string,
    userId: string
  ) {
    return await this.db.transaction(async (trx) => {
      const receipt = await trx('payment_receipts')
        .where({ id: receiptId, company_id: companyId, is_deleted: false })
        .first();

      if (!receipt) throw new Error('Payment receipt not found');
      if (receipt.status !== 'confirmed') {
        throw new Error('Only confirmed receipts can be allocated');
      }
      if (receipt.invoice_id) {
        throw new Error('Receipt is already allocated to an invoice');
      }

      const invoice = await trx('sales_invoices')
        .where({ id: invoiceId, company_id: companyId, is_deleted: false })
        .first() as InvoiceRow | undefined;

      if (!invoice) throw new Error('Invoice not found');
      if (invoice.customer_id !== receipt.customer_id) {
        throw new Error('Invoice does not belong to the same customer');
      }
      if (['draft', 'cancelled', 'paid'].includes(invoice.status)) {
        throw new Error(`Cannot allocate to a ${invoice.status} invoice`);
      }

      // Check amount doesn't exceed due
      const paymentAmount = parseFloat(receipt.amount);
      const tdsAmount = parseFloat(receipt.tds_deducted || '0');
      const totalSettlement = round2(paymentAmount + tdsAmount);
      const amountDue = parseFloat(invoice.balance_due);

      if (totalSettlement > round2(amountDue + 0.01)) {
        throw new Error(
          `Payment (${totalSettlement}) exceeds invoice amount due (${amountDue}). ` +
          `Consider a partial allocation or creating a credit note for the excess.`
        );
      }

      // Link receipt to invoice
      await trx('payment_receipts')
        .where({ id: receiptId })
        .update({
          invoice_id: invoiceId,
          updated_by: userId,
        });

      // Update invoice amounts
      await salesInvoiceService.recordPayment(
        invoiceId,
        companyId,
        totalSettlement,
        userId,
        trx
      );

      const updatedReceipt = await trx('payment_receipts')
        .where({ id: receiptId })
        .first();

      return updatedReceipt;
    });
  }
}

export const paymentReceiptService = new PaymentReceiptService();