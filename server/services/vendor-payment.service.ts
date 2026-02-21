// =============================================================
// File: server/services/vendor-payment.service.ts
// Module: Purchase Management
// Description: Vendor Payment service for paying vendors.
//              Supports bill allocation (partial/full),
//              advance payments (no bill), multiple payment
//              modes (cash, bank, cheque, UPI, card), TDS
//              deduction tracking, cheque bounce handling,
//              and vendor payment history.
//
// Note: Auto ledger posting (double-entry) will integrate
//       when the Financial Module is built.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export type PaymentMode = 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'card' | 'other';

export interface CreateVendorPaymentInput {
  company_id: string;
  branch_id: string;
  payment_date: string;
  vendor_id: string;
  amount: number;
  payment_mode: PaymentMode;
  bank_account_id?: string;
  cheque_number?: string;
  cheque_date?: string;
  transaction_reference?: string;
  vendor_bill_id?: string;       // null = advance payment
  tds_deducted?: number;
  narration?: string;
  is_advance?: boolean;
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface UpdateVendorPaymentInput {
  payment_date?: string;
  vendor_id?: string;
  amount?: number;
  payment_mode?: PaymentMode;
  bank_account_id?: string;
  cheque_number?: string;
  cheque_date?: string;
  transaction_reference?: string;
  vendor_bill_id?: string;
  tds_deducted?: number;
  narration?: string;
  is_advance?: boolean;
  metadata?: Record<string, any>;
  updated_by?: string;
}

export interface ListVendorPaymentsOptions extends ListOptions {
  vendor_id?: string;
  branch_id?: string;
  vendor_bill_id?: string;
  payment_mode?: PaymentMode;
  from_date?: string;
  to_date?: string;
  is_advance?: boolean;
}

// ────────────────────────────────────────────────────────────
// DB Row Types
// ────────────────────────────────────────────────────────────

interface VendorBillRow {
  id: string;
  company_id: string;
  vendor_id: string;
  bill_number: string;
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

class VendorPaymentService extends BaseService {
  constructor() {
    super('vendor_payments');
  }

  // ──────── CREATE ────────

  async createVendorPayment(input: CreateVendorPaymentInput) {
    return await this.db.transaction(async (trx) => {
      // Validate vendor
      const vendor = await trx('vendors')
        .where({ id: input.vendor_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!vendor) throw new Error('Vendor not found');

      // Validate branch
      const branch = await trx('branches')
        .where({ id: input.branch_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!branch) throw new Error('Branch not found');

      // Validate vendor bill if provided
      if (input.vendor_bill_id) {
        const bill = await trx('vendor_bills')
          .where({ id: input.vendor_bill_id, company_id: input.company_id, is_deleted: false })
          .first() as VendorBillRow | undefined;

        if (!bill) throw new Error('Vendor bill not found');
        if (bill.vendor_id !== input.vendor_id) {
          throw new Error('Vendor bill does not belong to the specified vendor');
        }
        if (['draft', 'cancelled'].includes(bill.status)) {
          throw new Error(`Cannot make payment against a ${bill.status} bill`);
        }

        // Validate payment amount doesn't exceed balance_due (including TDS)
        const effectivePayment = round2(input.amount + (input.tds_deducted || 0));
        const balanceDue = parseFloat(bill.balance_due);
        if (effectivePayment > round2(balanceDue + 0.01)) { // small tolerance for rounding
          throw new Error(
            `Payment amount (${input.amount}) plus TDS (${input.tds_deducted || 0}) = ${effectivePayment} ` +
            `exceeds bill balance due (${balanceDue})`
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

      // Auto-generate payment number
      const docNumberResult = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'vendor_payment') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const paymentNumber = docNumberResult.rows[0].doc_number;

      // Build metadata (store frontend-specific fields here)
      const metadata: Record<string, any> = {
        ...(input.metadata || {}),
      };
      if (input.cheque_number) metadata.cheque_number = input.cheque_number;
      if (input.cheque_date) metadata.cheque_date = input.cheque_date;
      if (input.transaction_reference) metadata.transaction_reference = input.transaction_reference;
      if (input.vendor_bill_id) metadata.vendor_bill_id = input.vendor_bill_id;
      if (input.is_advance !== undefined) metadata.is_advance = input.is_advance;

      // Insert payment
      const [payment] = await trx('vendor_payments')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          payment_number: paymentNumber,
          payment_date: input.payment_date,
          vendor_id: input.vendor_id,
          amount: input.amount,
          payment_mode: input.payment_mode,
          reference_number: input.transaction_reference || input.cheque_number || null,
          bank_account_id: input.bank_account_id || null,
          tds_amount: input.tds_deducted || null,
          notes: input.narration || null,
          status: 'draft',
          metadata,
          created_by: input.created_by,
        })
        .returning('*');

      return payment;
    });
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getVendorPaymentWithDetails(id: string, companyId: string) {
    const payment = await this.getById(id, companyId);
    if (!payment) return null;

    // Vendor
    const vendor = await this.db('vendors')
      .where({ id: payment.vendor_id })
      .select('id', 'vendor_code', 'name', 'display_name', 'gstin')
      .first();

    // Branch
    const branch = await this.db('branches')
      .where({ id: payment.branch_id })
      .select('id', 'code', 'name')
      .first();

    // Vendor bill (from metadata)
    const billId = payment.metadata?.vendor_bill_id;
    let vendorBill = null;
    if (billId) {
      vendorBill = await this.db('vendor_bills')
        .where({ id: billId })
        .select(
          'id', 'bill_number', 'bill_date', 'grand_total',
          'amount_paid', 'balance_due', 'status'
        )
        .first();
    }

    // Bank account (if linked)
    let bankAccount = null;
    if (payment.bank_account_id) {
      bankAccount = await this.db('bank_accounts')
        .where({ id: payment.bank_account_id })
        .select('id', 'account_name', 'bank_name', 'account_number')
        .first();
    }

    // Allocations
    const allocations = await this.db('vendor_payment_allocations')
      .where({ payment_id: id, company_id: companyId, is_deleted: false });

    return {
      ...payment,
      // Map DB fields back to frontend-expected fields
      cheque_number: payment.metadata?.cheque_number || null,
      cheque_date: payment.metadata?.cheque_date || null,
      transaction_reference: payment.metadata?.transaction_reference || null,
      vendor_bill_id: payment.metadata?.vendor_bill_id || null,
      tds_deducted: payment.tds_amount,
      narration: payment.notes,
      is_advance: payment.metadata?.is_advance ?? !billId,
      vendor,
      branch,
      vendor_bill: vendorBill,
      bank_account: bankAccount,
      allocations,
    };
  }

  // ──────── LIST ────────

  async listVendorPayments(options: ListVendorPaymentsOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'payment_date',
      sortOrder = 'desc',
      vendor_id,
      branch_id,
      vendor_bill_id,
      payment_mode,
      from_date,
      to_date,
      is_advance,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('vendor_payments')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (vendor_id) query = query.where('vendor_id', vendor_id);
    if (branch_id) query = query.where('branch_id', branch_id);
    if (payment_mode) query = query.where('payment_mode', payment_mode);
    if (from_date) query = query.where('payment_date', '>=', from_date);
    if (to_date) query = query.where('payment_date', '<=', to_date);

    // Filter by vendor_bill_id stored in metadata
    if (vendor_bill_id) {
      query = query.whereRaw(`metadata->>'vendor_bill_id' = ?`, [vendor_bill_id]);
    }

    // Filter by is_advance stored in metadata
    if (is_advance === true) {
      query = query.whereRaw(`(metadata->>'is_advance')::boolean = true`);
    } else if (is_advance === false) {
      query = query.where(function () {
        this.whereRaw(`(metadata->>'is_advance')::boolean = false`)
          .orWhereRaw(`metadata->>'is_advance' IS NULL`);
      });
    }

    if (search) {
      query = query.where(function () {
        this.orWhereILike('payment_number', `%${search}%`);
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

    // Enrich with vendor names
    if (data.length > 0) {
      const vendorIds = [...new Set(data.map((p: any) => p.vendor_id))];
      const vendors = await this.db('vendors')
        .whereIn('id', vendorIds)
        .select('id', 'vendor_code', 'name', 'display_name');
      const vendorMap = new Map(vendors.map((v: any) => [v.id, v]));

      // Enrich with bill info where applicable
      const billIds = [
        ...new Set(
          data
            .filter((p: any) => p.metadata?.vendor_bill_id)
            .map((p: any) => p.metadata.vendor_bill_id)
        ),
      ];
      let billMap = new Map<string, any>();
      if (billIds.length > 0) {
        const bills = await this.db('vendor_bills')
          .whereIn('id', billIds)
          .select('id', 'bill_number', 'grand_total', 'balance_due');
        billMap = new Map(bills.map((b: any) => [b.id, b]));
      }

      for (const p of data) {
        (p as any).vendor = vendorMap.get(p.vendor_id);
        const pBillId = p.metadata?.vendor_bill_id;
        (p as any).vendor_bill = pBillId ? billMap.get(pBillId) : null;
        // Map DB fields back to frontend-expected fields
        (p as any).cheque_number = p.metadata?.cheque_number || null;
        (p as any).cheque_date = p.metadata?.cheque_date || null;
        (p as any).transaction_reference = p.metadata?.transaction_reference || null;
        (p as any).vendor_bill_id = p.metadata?.vendor_bill_id || null;
        (p as any).tds_deducted = p.tds_amount;
        (p as any).narration = p.notes;
        (p as any).is_advance = p.metadata?.is_advance ?? !pBillId;
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updateVendorPayment(id: string, companyId: string, input: UpdateVendorPaymentInput) {
    const existing = await this.getById(id, companyId);
    if (!existing) throw new Error('Vendor payment not found');

    if (existing.status !== 'draft') {
      throw new Error(`Cannot edit payment in "${existing.status}" status. Only draft payments can be edited.`);
    }

    // If changing vendor bill, validate the new bill
    if (input.vendor_bill_id && input.vendor_bill_id !== existing.metadata?.vendor_bill_id) {
      const bill = await this.db('vendor_bills')
        .where({ id: input.vendor_bill_id, company_id: companyId, is_deleted: false })
        .first() as VendorBillRow | undefined;

      if (!bill) throw new Error('Vendor bill not found');

      const vendorId = input.vendor_id || existing.vendor_id;
      if (bill.vendor_id !== vendorId) {
        throw new Error('Vendor bill does not belong to the specified vendor');
      }
    }

    // Validate cheque fields
    const paymentMode = input.payment_mode || existing.payment_mode;
    if (paymentMode === 'cheque' && !input.cheque_number && !existing.metadata?.cheque_number) {
      throw new Error('cheque_number is required for cheque payments');
    }

    // Build updated metadata
    const existingMetadata = existing.metadata || {};
    const metadata: Record<string, any> = {
      ...existingMetadata,
      ...(input.metadata || {}),
    };
    if (input.cheque_number !== undefined) metadata.cheque_number = input.cheque_number || null;
    if (input.cheque_date !== undefined) metadata.cheque_date = input.cheque_date || null;
    if (input.transaction_reference !== undefined) metadata.transaction_reference = input.transaction_reference || null;
    if (input.vendor_bill_id !== undefined) metadata.vendor_bill_id = input.vendor_bill_id || null;
    if (input.is_advance !== undefined) metadata.is_advance = input.is_advance;

    const updateData: Record<string, any> = { metadata };
    if (input.payment_date !== undefined) updateData.payment_date = input.payment_date;
    if (input.vendor_id !== undefined) updateData.vendor_id = input.vendor_id;
    if (input.amount !== undefined) updateData.amount = input.amount;
    if (input.payment_mode !== undefined) updateData.payment_mode = input.payment_mode;
    if (input.bank_account_id !== undefined) updateData.bank_account_id = input.bank_account_id || null;
    if (input.tds_deducted !== undefined) updateData.tds_amount = input.tds_deducted || null;
    if (input.narration !== undefined) updateData.notes = input.narration || null;

    // Update reference_number from cheque_number or transaction_reference
    const chequeNum = input.cheque_number !== undefined ? input.cheque_number : existing.metadata?.cheque_number;
    const txnRef = input.transaction_reference !== undefined ? input.transaction_reference : existing.metadata?.transaction_reference;
    updateData.reference_number = txnRef || chequeNum || null;

    const [updated] = await this.db('vendor_payments')
      .where({ id, company_id: companyId })
      .update({ ...updateData, updated_by: input.updated_by })
      .returning('*');

    return updated;
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteVendorPayment(id: string, companyId: string, userId: string) {
    const payment = await this.getById(id, companyId);
    if (!payment) throw new Error('Vendor payment not found');

    if (payment.status !== 'draft') {
      throw new Error('Only draft vendor payments can be deleted');
    }

    const [deleted] = await this.db('vendor_payments')
      .where({ id, company_id: companyId, is_deleted: false })
      .update({
        is_deleted: true,
        deleted_at: this.db.fn.now(),
        deleted_by: userId,
      })
      .returning('*');

    return deleted;
  }

  // ──────── CONFIRM (draft -> confirmed) ────────
  // This is the key action: allocates payment to vendor bill,
  // updates bill amount_paid/balance_due

  async confirmVendorPayment(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const payment = await trx('vendor_payments')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!payment) throw new Error('Vendor payment not found');
      if (payment.status !== 'draft') {
        throw new Error(`Cannot confirm. Current status: "${payment.status}". Only draft payments can be confirmed.`);
      }

      const billId = payment.metadata?.vendor_bill_id;
      const paymentAmount = parseFloat(payment.amount);
      const tdsAmount = parseFloat(payment.tds_amount || '0');
      const totalSettlement = round2(paymentAmount + tdsAmount);

      // If linked to a vendor bill, create allocation and update bill
      if (billId) {
        const bill = await trx('vendor_bills')
          .where({ id: billId, company_id: companyId, is_deleted: false })
          .first() as VendorBillRow | undefined;

        if (!bill) throw new Error('Linked vendor bill not found');

        // Validate payment doesn't exceed balance
        const balanceDue = parseFloat(bill.balance_due);
        if (totalSettlement > round2(balanceDue + 0.01)) {
          throw new Error(
            `Payment (${totalSettlement}) exceeds bill balance due (${balanceDue})`
          );
        }

        // Create allocation record
        await trx('vendor_payment_allocations')
          .insert({
            company_id: companyId,
            payment_id: id,
            bill_id: billId,
            allocated_amount: totalSettlement,
            created_by: userId,
          });

        // Update vendor bill balances
        const newPaid = round2(parseFloat(bill.amount_paid) + totalSettlement);
        const newBalance = round2(parseFloat(bill.grand_total) - newPaid);

        let newStatus = bill.status;
        if (newBalance <= 0) {
          newStatus = 'paid';
        } else if (newPaid > 0 && bill.status === 'approved') {
          newStatus = 'partially_paid';
        }

        await trx('vendor_bills')
          .where({ id: billId })
          .update({
            amount_paid: newPaid,
            balance_due: Math.max(0, newBalance),
            status: newStatus,
            updated_by: userId,
          });
      }

      // Confirm the payment
      const [confirmed] = await trx('vendor_payments')
        .where({ id })
        .update({
          status: 'confirmed',
          updated_by: userId,
        })
        .returning('*');

      return confirmed;
    });
  }

  // ──────── BOUNCE (confirmed -> draft) ────────
  // Reverses the vendor bill allocation

  async bounceVendorPayment(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const payment = await trx('vendor_payments')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!payment) throw new Error('Vendor payment not found');
      if (payment.status !== 'confirmed') {
        throw new Error(`Cannot bounce. Current status: "${payment.status}". Only confirmed payments can be bounced.`);
      }

      const billId = payment.metadata?.vendor_bill_id;

      // Reverse allocation if linked to a bill
      if (billId) {
        // Find the allocation
        const allocation = await trx('vendor_payment_allocations')
          .where({ payment_id: id, bill_id: billId, company_id: companyId, is_deleted: false })
          .first();

        if (allocation) {
          const allocatedAmount = parseFloat(allocation.allocated_amount);

          // Delete the allocation record
          await trx('vendor_payment_allocations')
            .where({ id: allocation.id })
            .update({
              is_deleted: true,
              deleted_at: trx.fn.now(),
              deleted_by: userId,
            });

          // Reverse vendor bill balances
          const bill = await trx('vendor_bills')
            .where({ id: billId, company_id: companyId, is_deleted: false })
            .first() as VendorBillRow | undefined;

          if (bill) {
            const newPaid = round2(Math.max(0, parseFloat(bill.amount_paid) - allocatedAmount));
            const newBalance = round2(parseFloat(bill.grand_total) - newPaid);

            let newStatus = bill.status;
            if (newPaid <= 0) {
              // Revert to approved
              newStatus = 'approved';
            } else if (newBalance > 0 && bill.status === 'paid') {
              newStatus = 'partially_paid';
            }

            await trx('vendor_bills')
              .where({ id: billId })
              .update({
                amount_paid: newPaid,
                balance_due: newBalance,
                status: newStatus,
                updated_by: userId,
              });
          }
        }
      }

      // Revert payment to draft
      const [bounced] = await trx('vendor_payments')
        .where({ id })
        .update({
          status: 'draft',
          updated_by: userId,
        })
        .returning('*');

      return bounced;
    });
  }

  // ──────── CANCEL (draft -> cancelled) ────────

  async cancelVendorPayment(id: string, companyId: string, userId: string) {
    const payment = await this.getById(id, companyId);
    if (!payment) throw new Error('Vendor payment not found');

    if (payment.status !== 'draft') {
      throw new Error(
        `Cannot cancel. Current status: "${payment.status}". Only draft payments can be cancelled.`
      );
    }

    const [cancelled] = await this.db('vendor_payments')
      .where({ id, company_id: companyId })
      .update({ status: 'cancelled', updated_by: userId })
      .returning('*');

    return cancelled;
  }
}

export const vendorPaymentService = new VendorPaymentService();
