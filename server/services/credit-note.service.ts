// =============================================================
// File: server/services/credit-note.service.ts
// Module: Sales Management — Phase 5, Step 19
// Description: Credit Note service for sales returns, pricing
//              errors, quality issues, and goodwill credits.
//              Links to original invoice, computes GST reversal,
//              updates invoice amount_due, and handles stock
//              return to warehouse for return-type credit notes.
//
// Schema note: credit_notes is a header-only table (no lines
//              table in the 77-table schema). The credit note
//              captures reason, totals, and GST reversal amounts
//              against the original invoice.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export type CreditNoteReason = 'return' | 'pricing_error' | 'quality' | 'goodwill';

export interface CreateCreditNoteInput {
  company_id: string;
  branch_id: string;
  credit_note_date: string;
  customer_id: string;
  invoice_id?: string;
  reason: CreditNoteReason;
  reason_detail?: string;
  subtotal: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  metadata?: Record<string, any>;
  // For 'return' reason — stock return details
  return_items?: ReturnItemInput[];
  created_by?: string;
}

export interface ReturnItemInput {
  product_id: string;
  quantity: number;
  uom_id: string;
  warehouse_id: string;
  batch_id?: string;
}

export interface UpdateCreditNoteInput {
  reason_detail?: string;
  subtotal?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  metadata?: Record<string, any>;
  updated_by?: string;
}

export interface ListCreditNotesOptions extends ListOptions {
  customer_id?: string;
  branch_id?: string;
  invoice_id?: string;
  reason?: CreditNoteReason;
  from_date?: string;
  to_date?: string;
}

// ────────────────────────────────────────────────────────────
// DB Row Types
// ────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: string;
  company_id: string;
  branch_id: string;
  invoice_number: string;
  customer_id: string;
  grand_total: string;
  amount_paid: string;
  balance_due: string;
  status: string;
  place_of_supply: string | null;
  [key: string]: any;
}

// ────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class CreditNoteService extends BaseService {
  constructor() {
    super('credit_notes');
  }

  // ──────── CREATE ────────

  async createCreditNote(input: CreateCreditNoteInput) {
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

      // Validate invoice if linked
      let invoice: InvoiceRow | undefined;
      if (input.invoice_id) {
        invoice = await trx('sales_invoices')
          .where({ id: input.invoice_id, company_id: input.company_id, is_deleted: false })
          .first() as InvoiceRow | undefined;

        if (!invoice) throw new Error('Invoice not found');
        if (invoice.customer_id !== input.customer_id) {
          throw new Error('Invoice does not belong to the specified customer');
        }
        if (['draft', 'cancelled'].includes(invoice.status)) {
          throw new Error(`Cannot create credit note against a ${invoice.status} invoice`);
        }

        // Validate credit amount doesn't exceed invoice grand total
        // Sum existing credit notes against this invoice
        const existingCredits = await trx('credit_notes')
          .where({ invoice_id: input.invoice_id, company_id: input.company_id, is_deleted: false })
          .whereNot('status', 'cancelled')
          .sum('grand_total as total_credited')
          .first();

        const totalCredited = parseFloat(existingCredits?.total_credited || '0');
        const totalTax = round2(
          (input.cgst_amount || 0) + (input.sgst_amount || 0) + (input.igst_amount || 0)
        );
        const newGrandTotal = round2(input.subtotal + totalTax);

        if (round2(totalCredited + newGrandTotal) > parseFloat(invoice.grand_total)) {
          throw new Error(
            `Credit note total (${newGrandTotal}) plus existing credits (${totalCredited}) ` +
            `would exceed invoice total (${invoice.grand_total})`
          );
        }
      }

      // Auto-generate credit note number
      // Schema doesn't have 'credit_note' in document_sequences CHECK,
      // so we use manual numbering like delivery challans
      const lastCN = await trx('credit_notes')
        .where({ company_id: input.company_id, is_deleted: false })
        .orderBy('created_at', 'desc')
        .first();

      let creditNoteNumber: string;
      if (lastCN) {
        const match = lastCN.credit_note_number.match(/(\d+)$/);
        const nextNum = match ? parseInt(match[1]) + 1 : 1;
        creditNoteNumber = `CN-${String(nextNum).padStart(5, '0')}`;
      } else {
        creditNoteNumber = 'CN-00001';
      }

      // Compute totals
      const cgstAmount = round2(input.cgst_amount || 0);
      const sgstAmount = round2(input.sgst_amount || 0);
      const igstAmount = round2(input.igst_amount || 0);
      const totalTax = round2(cgstAmount + sgstAmount + igstAmount);
      const grandTotal = round2(input.subtotal + totalTax);

      // Insert credit note
      const [creditNote] = await trx('credit_notes')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          credit_note_number: creditNoteNumber,
          credit_note_date: input.credit_note_date,
          customer_id: input.customer_id,
          invoice_id: input.invoice_id || null,
          reason: input.reason,
          reason_detail: input.reason_detail || null,
          subtotal: input.subtotal,
          cgst_amount: cgstAmount,
          sgst_amount: sgstAmount,
          igst_amount: igstAmount,
          total_tax: totalTax,
          grand_total: grandTotal,
          status: 'draft',
          metadata: input.metadata || {},
          created_by: input.created_by,
        })
        .returning('*');

      return creditNote;
    });
  }

  // ──────── CREATE FROM INVOICE (auto-compute GST reversal) ────────

  async createFromInvoice(
    invoiceId: string,
    companyId: string,
    userId: string,
    params: {
      reason: CreditNoteReason;
      reason_detail?: string;
      credit_percentage?: number;  // e.g. 100 for full, 50 for half
      credit_amount?: number;      // exact amount (overrides percentage)
      return_to_warehouse_id?: string; // for returns
    }
  ) {
    const invoice = await this.db('sales_invoices')
      .where({ id: invoiceId, company_id: companyId, is_deleted: false })
      .first() as InvoiceRow | undefined;

    if (!invoice) throw new Error('Invoice not found');
    if (['draft', 'cancelled'].includes(invoice.status)) {
      throw new Error(`Cannot create credit note against a ${invoice.status} invoice`);
    }

    // Determine credit ratio
    let ratio = 1; // full credit by default
    if (params.credit_amount) {
      const invTotal = parseFloat(invoice.grand_total);
      if (params.credit_amount > invTotal) {
        throw new Error(`Credit amount (${params.credit_amount}) exceeds invoice total (${invTotal})`);
      }
      // Compute ratio from the subtotal (pre-tax)
      const invSubtotal = parseFloat(invoice.subtotal);
      ratio = invSubtotal > 0 ? params.credit_amount / invSubtotal : 0;
    } else if (params.credit_percentage) {
      if (params.credit_percentage < 0 || params.credit_percentage > 100) {
        throw new Error('credit_percentage must be between 0 and 100');
      }
      ratio = params.credit_percentage / 100;
    }

    // Pro-rate the invoice amounts
    const subtotal = round2(parseFloat(invoice.subtotal) * ratio);
    const cgstAmount = round2(parseFloat(invoice.cgst_amount || '0') * ratio);
    const sgstAmount = round2(parseFloat(invoice.sgst_amount || '0') * ratio);
    const igstAmount = round2(parseFloat(invoice.igst_amount || '0') * ratio);

    // Build return items from invoice lines if reason is 'return'
    let returnItems: ReturnItemInput[] | undefined;
    if (params.reason === 'return' && params.return_to_warehouse_id) {
      const invoiceLines = await this.db('sales_invoice_lines')
        .where({ invoice_id: invoiceId, company_id: companyId, is_deleted: false });

      returnItems = invoiceLines.map((l: any) => ({
        product_id: l.product_id,
        quantity: round3(parseFloat(l.quantity) * ratio),
        uom_id: l.uom_id,
        warehouse_id: l.warehouse_id || params.return_to_warehouse_id!,
        batch_id: l.batch_id || undefined,
      }));
    }

    return this.createCreditNote({
      company_id: companyId,
      branch_id: invoice.branch_id,
      credit_note_date: new Date().toISOString().split('T')[0],
      customer_id: invoice.customer_id,
      invoice_id: invoiceId,
      reason: params.reason,
      reason_detail: params.reason_detail,
      subtotal,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      metadata: { credit_ratio: ratio, return_to_warehouse_id: params.return_to_warehouse_id },
      return_items: returnItems,
      created_by: userId,
    });
  }

  // ──────── APPROVE (draft → approved) ────────

  async approveCreditNote(id: string, companyId: string, userId: string) {
    const cn = await this.getById(id, companyId);
    if (!cn) throw new Error('Credit note not found');

    if (cn.status !== 'draft') {
      throw new Error(`Cannot approve. Current status: "${cn.status}"`);
    }

    const [approved] = await this.db('credit_notes')
      .where({ id, company_id: companyId })
      .update({
        status: 'approved',
        approved_by: userId,
        updated_by: userId,
      })
      .returning('*');

    return approved;
  }

  // ──────── APPLY (approved → applied) ────────
  // Reduces invoice amount_due and returns stock to warehouse

  async applyCreditNote(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const cn = await trx('credit_notes')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!cn) throw new Error('Credit note not found');
      if (cn.status !== 'approved') {
        throw new Error(`Cannot apply. Credit note must be approved first. Current status: "${cn.status}"`);
      }

      const grandTotal = parseFloat(cn.grand_total);

      // 1. Reduce invoice amount_due (if linked)
      if (cn.invoice_id) {
        const invoice = await trx('sales_invoices')
          .where({ id: cn.invoice_id, company_id: companyId, is_deleted: false })
          .first() as InvoiceRow | undefined;

        if (invoice) {
          const currentDue = parseFloat(invoice.balance_due);
          const newAmountDue = round2(Math.max(0, currentDue - grandTotal));
          const newAmountPaid = round2(parseFloat(invoice.grand_total) - newAmountDue);

          let newStatus = invoice.status;
          if (newAmountDue <= 0) {
            newStatus = 'paid';
          } else if (newAmountPaid > 0 && invoice.status !== 'paid') {
            newStatus = 'partially_paid';
          }

          await trx('sales_invoices')
            .where({ id: cn.invoice_id })
            .update({
              balance_due: newAmountDue,
              amount_paid: newAmountPaid,
              status: newStatus,
              updated_by: userId,
            });
        }
      }

      // 2. Return stock to warehouse (for 'return' reason)
      if (cn.reason === 'return' && cn.metadata?.return_to_warehouse_id) {
        const returnItems: ReturnItemInput[] = cn.metadata?.return_items || [];
        const warehouseId = cn.metadata.return_to_warehouse_id;

        // If return_items in metadata, process stock return
        // Otherwise, compute from invoice lines + credit ratio
        let itemsToReturn = returnItems;

        if (itemsToReturn.length === 0 && cn.invoice_id) {
          const ratio = cn.metadata?.credit_ratio || 1;
          const invoiceLines = await trx('sales_invoice_lines')
            .where({ invoice_id: cn.invoice_id, company_id: companyId, is_deleted: false });

          itemsToReturn = invoiceLines.map((l: any) => ({
            product_id: l.product_id,
            quantity: round3(parseFloat(l.quantity) * ratio),
            uom_id: l.uom_id,
            warehouse_id: l.warehouse_id || warehouseId,
            batch_id: l.batch_id,
          }));
        }

        // Add stock back to stock_summary
        for (const item of itemsToReturn) {
          const targetWarehouse = item.warehouse_id || warehouseId;

          const stockSummary = await trx('stock_summary')
            .where({
              company_id: companyId,
              warehouse_id: targetWarehouse,
              product_id: item.product_id,
            })
            .first();

          if (stockSummary) {
            const currentAvailable = parseFloat(stockSummary.available_quantity) || 0;
            const newAvailable = round3(currentAvailable + item.quantity);
            const currentReserved = parseFloat(stockSummary.reserved_quantity) || 0;
            const newFree = round3(newAvailable - currentReserved);

            await trx('stock_summary')
              .where({ id: stockSummary.id })
              .update({
                available_quantity: newAvailable,
                free_quantity: newFree,
                last_movement_date: cn.credit_note_date,
                updated_by: userId,
              });
          }
          // If no stock_summary row, the stock ledger engine (Step 27)
          // will handle creation. For now, return is a no-op for new items.
        }
      }

      // 3. Mark as applied
      const [applied] = await trx('credit_notes')
        .where({ id })
        .update({
          status: 'applied',
          updated_by: userId,
        })
        .returning('*');

      return applied;
    });
  }

  // ──────── CANCEL (draft or approved only) ────────

  async cancelCreditNote(id: string, companyId: string, userId: string) {
    const cn = await this.getById(id, companyId);
    if (!cn) throw new Error('Credit note not found');

    if (!['draft', 'approved'].includes(cn.status)) {
      throw new Error(
        `Cannot cancel a ${cn.status} credit note. Only draft or approved credit notes can be cancelled.`
      );
    }

    const [cancelled] = await this.db('credit_notes')
      .where({ id, company_id: companyId })
      .update({ status: 'cancelled', updated_by: userId })
      .returning('*');

    return cancelled;
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getCreditNoteWithDetails(id: string, companyId: string) {
    const cn = await this.getById(id, companyId);
    if (!cn) return null;

    // Customer
    const customer = await this.db('customers')
      .where({ id: cn.customer_id })
      .select('id', 'customer_code', 'name', 'display_name', 'gstin')
      .first();

    // Branch
    const branch = await this.db('branches')
      .where({ id: cn.branch_id })
      .select('id', 'code', 'name', 'state', 'gstin')
      .first();

    // Invoice (if linked)
    let invoice = null;
    if (cn.invoice_id) {
      invoice = await this.db('sales_invoices')
        .where({ id: cn.invoice_id })
        .select(
          'id', 'invoice_number', 'invoice_date', 'grand_total',
          'amount_paid', 'balance_due', 'status'
        )
        .first();
    }

    // Approved by user
    let approvedByUser = null;
    if (cn.approved_by) {
      approvedByUser = await this.db('users')
        .where({ id: cn.approved_by })
        .select('id', 'username', 'full_name')
        .first();
    }

    return {
      ...cn,
      customer,
      branch,
      invoice,
      approved_by_user: approvedByUser,
    };
  }

  // ──────── LIST ────────

  async listCreditNotes(options: ListCreditNotesOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'credit_note_date',
      sortOrder = 'desc',
      customer_id,
      branch_id,
      invoice_id,
      reason,
      from_date,
      to_date,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('credit_notes')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (customer_id) query = query.where('customer_id', customer_id);
    if (branch_id) query = query.where('branch_id', branch_id);
    if (invoice_id) query = query.where('invoice_id', invoice_id);
    if (reason) query = query.where('reason', reason);
    if (from_date) query = query.where('credit_note_date', '>=', from_date);
    if (to_date) query = query.where('credit_note_date', '<=', to_date);

    if (search) {
      query = query.where(function () {
        this.orWhereILike('credit_note_number', `%${search}%`);
        this.orWhereILike('reason_detail', `%${search}%`);
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
      const customerIds = [...new Set(data.map((cn: any) => cn.customer_id))];
      const customers = await this.db('customers')
        .whereIn('id', customerIds)
        .select('id', 'customer_code', 'name', 'display_name');
      const customerMap = new Map(customers.map((c: any) => [c.id, c]));

      const invoiceIds = [...new Set(data.filter((cn: any) => cn.invoice_id).map((cn: any) => cn.invoice_id))];
      let invoiceMap = new Map<string, any>();
      if (invoiceIds.length > 0) {
        const invoices = await this.db('sales_invoices')
          .whereIn('id', invoiceIds)
          .select('id', 'invoice_number', 'grand_total');
        invoiceMap = new Map(invoices.map((inv: any) => [inv.id, inv]));
      }

      for (const cn of data) {
        (cn as any).customer = customerMap.get(cn.customer_id);
        (cn as any).invoice = cn.invoice_id ? invoiceMap.get(cn.invoice_id) : null;
        // Map grand_total to total_amount for frontend compatibility
        if ((cn as any).total_amount === undefined && (cn as any).grand_total !== undefined) {
          (cn as any).total_amount = (cn as any).grand_total;
        }
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updateCreditNote(id: string, companyId: string, input: UpdateCreditNoteInput) {
    const existing = await this.getById(id, companyId);
    if (!existing) throw new Error('Credit note not found');

    if (existing.status !== 'draft') {
      throw new Error(`Cannot edit credit note in "${existing.status}" status`);
    }

    // Recompute totals if amounts changed
    const updateData: Record<string, any> = { ...input };
    delete updateData.updated_by;

    if (input.subtotal !== undefined || input.cgst_amount !== undefined ||
        input.sgst_amount !== undefined || input.igst_amount !== undefined) {
      const sub = input.subtotal ?? parseFloat(existing.subtotal);
      const cgst = round2(input.cgst_amount ?? parseFloat(existing.cgst_amount || '0'));
      const sgst = round2(input.sgst_amount ?? parseFloat(existing.sgst_amount || '0'));
      const igst = round2(input.igst_amount ?? parseFloat(existing.igst_amount || '0'));
      const totalTax = round2(cgst + sgst + igst);
      const grandTotal = round2(sub + totalTax);

      updateData.subtotal = sub;
      updateData.cgst_amount = cgst;
      updateData.sgst_amount = sgst;
      updateData.igst_amount = igst;
      updateData.total_tax = totalTax;
      updateData.grand_total = grandTotal;
    }

    const [updated] = await this.db('credit_notes')
      .where({ id, company_id: companyId })
      .update({ ...updateData, updated_by: input.updated_by })
      .returning('*');

    return updated;
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteCreditNote(id: string, companyId: string, userId: string) {
    const cn = await this.getById(id, companyId);
    if (!cn) throw new Error('Credit note not found');

    if (cn.status !== 'draft') {
      throw new Error('Only draft credit notes can be deleted');
    }

    const [deleted] = await this.db('credit_notes')
      .where({ id, company_id: companyId, is_deleted: false })
      .update({
        is_deleted: true,
        deleted_at: this.db.fn.now(),
        deleted_by: userId,
      })
      .returning('*');

    return deleted;
  }

  // ──────── SUMMARY: total credits for an invoice ────────

  async getInvoiceCreditSummary(invoiceId: string, companyId: string) {
    const credits = await this.db('credit_notes')
      .where({ invoice_id: invoiceId, company_id: companyId, is_deleted: false })
      .whereNot('status', 'cancelled')
      .select(
        this.db.raw('COUNT(*) as credit_note_count'),
        this.db.raw('COALESCE(SUM(grand_total), 0) as total_credited'),
        this.db.raw('COALESCE(SUM(cgst_amount), 0) as total_cgst_reversed'),
        this.db.raw('COALESCE(SUM(sgst_amount), 0) as total_sgst_reversed'),
        this.db.raw('COALESCE(SUM(igst_amount), 0) as total_igst_reversed')
      )
      .first();

    return credits;
  }
}

export const creditNoteService = new CreditNoteService();