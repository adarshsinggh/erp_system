// =============================================================
// File: server/services/debit-note.service.ts
// Module: Purchase Management
// Description: Debit Note service with flat-payload CRUD,
//              auto document numbering, computed totals,
//              status lifecycle (draft/approved/applied/cancelled),
//              and vendor bill balance reduction on apply.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface CreateDebitNoteInput {
  company_id: string;
  branch_id: string;
  debit_note_date: string;
  vendor_id: string;
  vendor_bill_id?: string;
  reason: 'return' | 'pricing_error' | 'quality_issue' | 'shortage' | 'other';
  reason_detail?: string;
  currency_code?: string;
  subtotal: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  internal_notes?: string;
  metadata?: Record<string, any>;
  created_by?: string;
}

export interface UpdateDebitNoteInput {
  vendor_id?: string;
  debit_note_date?: string;
  vendor_bill_id?: string;
  reason?: 'return' | 'pricing_error' | 'quality_issue' | 'shortage' | 'other';
  reason_detail?: string;
  currency_code?: string;
  subtotal?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  internal_notes?: string;
  metadata?: Record<string, any>;
  updated_by?: string;
}

export interface ListDebitNotesOptions extends ListOptions {
  vendor_id?: string;
  reason?: string;
  from_date?: string;
  to_date?: string;
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

class DebitNoteService extends BaseService {
  constructor() {
    super('debit_notes');
  }

  // ──────── Private: compute totals from flat amounts ────────

  private computeTotals(input: {
    subtotal: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
  }) {
    const subtotal = round2(input.subtotal || 0);
    const cgst_amount = round2(input.cgst_amount || 0);
    const sgst_amount = round2(input.sgst_amount || 0);
    const igst_amount = round2(input.igst_amount || 0);
    const taxable_amount = subtotal;
    const total_tax = round2(cgst_amount + sgst_amount + igst_amount);
    const grand_total = round2(taxable_amount + total_tax);

    return {
      subtotal,
      taxable_amount,
      cgst_amount,
      sgst_amount,
      igst_amount,
      total_tax,
      grand_total,
    };
  }

  // ──────── CREATE ────────

  async createDebitNote(input: CreateDebitNoteInput) {
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

      // Validate vendor bill (if provided)
      if (input.vendor_bill_id) {
        const bill = await trx('vendor_bills')
          .where({ id: input.vendor_bill_id, company_id: input.company_id, is_deleted: false })
          .first();
        if (!bill) throw new Error('Vendor bill not found');
      }

      // Auto-generate debit note number
      const docNumberResult = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'debit_note') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const debitNoteNumber = docNumberResult.rows[0].doc_number;

      // Compute totals from flat amounts
      const totals = this.computeTotals({
        subtotal: input.subtotal,
        cgst_amount: input.cgst_amount,
        sgst_amount: input.sgst_amount,
        igst_amount: input.igst_amount,
      });

      // Insert header
      const [header] = await trx('debit_notes')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          debit_note_number: debitNoteNumber,
          debit_note_date: input.debit_note_date,
          vendor_id: input.vendor_id,
          bill_id: input.vendor_bill_id || null,
          reason: input.reason,
          reason_detail: input.reason_detail || null,
          currency_code: input.currency_code || 'INR',
          ...totals,
          internal_notes: input.internal_notes || null,
          status: 'draft',
          metadata: input.metadata || {},
          created_by: input.created_by,
        })
        .returning('*');

      return header;
    });
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getDebitNoteWithDetails(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    // Vendor info
    const vendor = await this.db('vendors')
      .where({ id: header.vendor_id })
      .select('id', 'vendor_code', 'name', 'display_name', 'gstin')
      .first();

    // Vendor bill info (if linked)
    let vendorBill = null;
    if (header.bill_id) {
      vendorBill = await this.db('vendor_bills')
        .where({ id: header.bill_id })
        .select('id', 'bill_number', 'bill_date', 'grand_total', 'balance_due', 'status')
        .first();
    }

    // Branch
    const branch = await this.db('branches')
      .where({ id: header.branch_id })
      .select('id', 'code', 'name', 'state', 'gstin')
      .first();

    // Lines (if any exist)
    const lines = await this.db('debit_note_lines')
      .where({ debit_note_id: id, company_id: companyId, is_deleted: false })
      .leftJoin('items as i', 'debit_note_lines.item_id', 'i.id')
      .leftJoin('units_of_measurement as u', 'debit_note_lines.uom_id', 'u.id')
      .select(
        'debit_note_lines.*',
        'i.item_code',
        'i.name as item_name',
        'u.code as uom_code',
        'u.name as uom_name'
      )
      .orderBy('debit_note_lines.line_number');

    return {
      ...header,
      lines,
      vendor,
      vendor_bill: vendorBill,
      branch,
    };
  }

  // ──────── LIST ────────

  async listDebitNotes(options: ListDebitNotesOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'debit_note_date',
      sortOrder = 'desc',
      vendor_id,
      reason,
      from_date,
      to_date,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('debit_notes')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (vendor_id) query = query.where('vendor_id', vendor_id);
    if (reason) query = query.where('reason', reason);
    if (from_date) query = query.where('debit_note_date', '>=', from_date);
    if (to_date) query = query.where('debit_note_date', '<=', to_date);

    if (search) {
      query = query.where(function () {
        this.orWhereILike('debit_note_number', `%${search}%`);
        this.orWhereILike('reason_detail', `%${search}%`);
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
      const vendorIds = [...new Set(data.map((dn: any) => dn.vendor_id))];
      const vendors = await this.db('vendors')
        .whereIn('id', vendorIds)
        .select('id', 'vendor_code', 'name', 'display_name');

      const vendorMap = new Map(vendors.map((v: any) => [v.id, v]));
      for (const dn of data) {
        (dn as any).vendor = vendorMap.get(dn.vendor_id);
      }

      // Enrich with branch names
      const branchIds = [...new Set(data.map((dn: any) => dn.branch_id))];
      const branches = await this.db('branches')
        .whereIn('id', branchIds)
        .select('id', 'code', 'name');

      const branchMap = new Map(branches.map((b: any) => [b.id, b]));
      for (const dn of data) {
        (dn as any).branch = branchMap.get(dn.branch_id);
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updateDebitNote(id: string, companyId: string, input: UpdateDebitNoteInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('debit_notes')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Debit note not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot edit debit note in "${existing.status}" status. Only draft debit notes can be edited.`);
      }

      // Build header updates
      const headerUpdates: Record<string, any> = {};

      if (input.vendor_id !== undefined) headerUpdates.vendor_id = input.vendor_id;
      if (input.debit_note_date !== undefined) headerUpdates.debit_note_date = input.debit_note_date;
      if (input.vendor_bill_id !== undefined) headerUpdates.bill_id = input.vendor_bill_id;
      if (input.reason !== undefined) headerUpdates.reason = input.reason;
      if (input.reason_detail !== undefined) headerUpdates.reason_detail = input.reason_detail;
      if (input.currency_code !== undefined) headerUpdates.currency_code = input.currency_code;
      if (input.internal_notes !== undefined) headerUpdates.internal_notes = input.internal_notes;
      if (input.metadata !== undefined) headerUpdates.metadata = input.metadata;

      // Recompute totals if any amount field changed
      if (
        input.subtotal !== undefined ||
        input.cgst_amount !== undefined ||
        input.sgst_amount !== undefined ||
        input.igst_amount !== undefined
      ) {
        const totals = this.computeTotals({
          subtotal: input.subtotal ?? parseFloat(existing.subtotal),
          cgst_amount: input.cgst_amount ?? parseFloat(existing.cgst_amount),
          sgst_amount: input.sgst_amount ?? parseFloat(existing.sgst_amount),
          igst_amount: input.igst_amount ?? parseFloat(existing.igst_amount),
        });
        Object.assign(headerUpdates, totals);
      }

      // Validate vendor if changed
      if (input.vendor_id) {
        const vendor = await trx('vendors')
          .where({ id: input.vendor_id, company_id: companyId, is_deleted: false })
          .first();
        if (!vendor) throw new Error('Vendor not found');
      }

      // Validate vendor bill if changed
      if (input.vendor_bill_id) {
        const bill = await trx('vendor_bills')
          .where({ id: input.vendor_bill_id, company_id: companyId, is_deleted: false })
          .first();
        if (!bill) throw new Error('Vendor bill not found');
      }

      // Clean fields that should not be updated
      delete headerUpdates.company_id;
      delete headerUpdates.branch_id;
      delete headerUpdates.debit_note_number;
      delete headerUpdates.status;

      if (Object.keys(headerUpdates).length > 0) {
        await trx('debit_notes')
          .where({ id })
          .update({ ...headerUpdates, updated_by: input.updated_by });
      }

      const updated = await trx('debit_notes').where({ id }).first();
      return updated;
    });
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteDebitNote(id: string, companyId: string, userId: string) {
    const dn = await this.getById(id, companyId);
    if (!dn) throw new Error('Debit note not found');

    if (dn.status !== 'draft') {
      throw new Error('Only draft debit notes can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      // Soft-delete lines (if any)
      await trx('debit_note_lines')
        .where({ debit_note_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      // Soft-delete header
      const [deleted] = await trx('debit_notes')
        .where({ id, company_id: companyId, is_deleted: false })
        .update({
          is_deleted: true,
          deleted_at: trx.fn.now(),
          deleted_by: userId,
        })
        .returning('*');

      return deleted;
    });
  }

  // ──────── APPROVE (draft → approved) ────────

  async approveDebitNote(id: string, companyId: string, userId: string) {
    const dn = await this.getById(id, companyId);
    if (!dn) throw new Error('Debit note not found');

    if (dn.status !== 'draft') {
      throw new Error(`Cannot approve. Current status: "${dn.status}". Only draft debit notes can be approved.`);
    }

    const [approved] = await this.db('debit_notes')
      .where({ id, company_id: companyId })
      .update({
        status: 'approved',
        updated_by: userId,
      })
      .returning('*');

    return approved;
  }

  // ──────── APPLY (approved → applied, reduce vendor bill balance) ────────

  async applyDebitNote(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const debitNote = await trx('debit_notes')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!debitNote) throw new Error('Debit note not found');

      if (debitNote.status !== 'approved') {
        throw new Error(`Cannot apply. Current status: "${debitNote.status}". Only approved debit notes can be applied.`);
      }

      // Update status to applied
      const [applied] = await trx('debit_notes')
        .where({ id, company_id: companyId })
        .update({
          status: 'applied',
          updated_by: userId,
        })
        .returning('*');

      // Reduce balance_due on vendor bill
      if (debitNote.bill_id) {
        const bill = await trx('vendor_bills').where({ id: debitNote.bill_id }).first();
        if (bill) {
          const newBalance = round2(parseFloat(bill.balance_due) - parseFloat(debitNote.grand_total));
          await trx('vendor_bills')
            .where({ id: debitNote.bill_id })
            .update({ balance_due: Math.max(0, newBalance), updated_by: userId });
        }
      }

      return applied;
    });
  }

  // ──────── CANCEL (draft/approved → cancelled) ────────

  async cancelDebitNote(id: string, companyId: string, userId: string) {
    const dn = await this.getById(id, companyId);
    if (!dn) throw new Error('Debit note not found');

    const cancellableStatuses = ['draft', 'approved'];
    if (!cancellableStatuses.includes(dn.status)) {
      throw new Error(
        `Cannot cancel. Current status: "${dn.status}". Only draft or approved debit notes can be cancelled.`
      );
    }

    const [cancelled] = await this.db('debit_notes')
      .where({ id, company_id: companyId })
      .update({
        status: 'cancelled',
        updated_by: userId,
      })
      .returning('*');

    return cancelled;
  }
}

export const debitNoteService = new DebitNoteService();
