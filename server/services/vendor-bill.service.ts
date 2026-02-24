// =============================================================
// File: server/services/vendor-bill.service.ts
// Module: Purchase Management
// Description: Vendor Bill service with header+lines CRUD,
//              GST computation, TDS handling, status lifecycle,
//              payment tracking, and PO billed-qty sync.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { purchaseOrderService } from './purchase-order.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface VendorBillLineInput {
  item_id: string;
  description?: string;
  quantity: number;
  uom_id: string;
  unit_price: number;
  hsn_code?: string;
  grn_line_id?: string;
  // Frontend sends these but they are ignored — GST is computed server-side
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
}

export interface CreateVendorBillInput {
  company_id: string;
  branch_id: string;
  vendor_id: string;
  purchase_order_id?: string;
  grn_id?: string;
  vendor_bill_number?: string;   // maps to vendor_invoice_number
  vendor_bill_date?: string;     // maps to vendor_invoice_date
  received_date?: string;        // stored in metadata
  due_date?: string;
  place_of_supply?: string;      // stored in metadata
  currency_code?: string;
  exchange_rate?: number;
  tds_applicable?: boolean;      // stored in metadata
  tds_section?: string;          // stored in metadata
  tds_rate?: number;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines: VendorBillLineInput[];
  created_by?: string;
}

export interface UpdateVendorBillInput {
  vendor_id?: string;
  purchase_order_id?: string;
  grn_id?: string;
  vendor_bill_number?: string;
  vendor_bill_date?: string;
  received_date?: string;
  due_date?: string;
  place_of_supply?: string;
  currency_code?: string;
  exchange_rate?: number;
  tds_applicable?: boolean;
  tds_section?: string;
  tds_rate?: number;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines?: VendorBillLineInput[];
  updated_by?: string;
}

export interface ListVendorBillsOptions extends ListOptions {
  vendor_id?: string;
  purchase_order_id?: string;
  overdue_only?: boolean;
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

class VendorBillService extends BaseService {
  constructor() {
    super('vendor_bills');
  }

  // ──────── Private: GST computation for bill lines ────────

  private async resolveGst(
    trx: Knex,
    companyId: string,
    branchId: string,
    vendorId: string,
    lines: VendorBillLineInput[]
  ): Promise<{
    computedLines: Record<string, any>[];
    headerTotals: Record<string, number>;
  }> {
    // 1. Get branch state (destination / place of supply)
    const branch = await trx('branches')
      .where({ id: branchId, company_id: companyId })
      .select('state')
      .first();

    const branchState = (branch?.state || '').trim().toLowerCase();

    // 2. Get vendor state from default address
    const vendor = await trx('vendors')
      .where({ id: vendorId, company_id: companyId, is_deleted: false })
      .select('gstin')
      .first();

    const vendorAddress = await trx('addresses')
      .where({ entity_type: 'vendor', entity_id: vendorId, is_deleted: false, is_default: true })
      .select('state')
      .first();

    // Derive vendor state from address or default to intra-state
    let vendorState = branchState;
    if (vendorAddress?.state) {
      vendorState = vendorAddress.state.trim().toLowerCase();
    }

    const isInterState = branchState !== vendorState;

    // 3. Fetch items
    const itemIds = [...new Set(lines.map((l) => l.item_id))];
    const items = await trx('items')
      .whereIn('id', itemIds)
      .where({ is_deleted: false })
      .select('id', 'name', 'item_code', 'hsn_code', 'gst_rate', 'purchase_price');

    const itemMap = new Map(items.map((i: any) => [i.id, i]));

    // 4. Compute per-line
    let subtotal = 0;
    let totalDiscount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const computedLines: Record<string, any>[] = lines.map((line, index) => {
      const item = itemMap.get(line.item_id);
      if (!item) {
        throw new Error(`Item not found: ${line.item_id}`);
      }

      const qty = line.quantity;
      const price = line.unit_price;
      const lineSubtotal = round2(qty * price);
      subtotal += lineSubtotal;

      // Discount (not in line input for bills, default 0)
      const discountAmt = 0;
      totalDiscount += discountAmt;

      const taxableAmt = round2(lineSubtotal - discountAmt);

      const gstRate = parseFloat(item.gst_rate) || 0;
      let cgst_rate = 0, sgst_rate = 0, igst_rate = 0;
      let cgst_amount = 0, sgst_amount = 0, igst_amount = 0;

      if (isInterState) {
        igst_rate = gstRate;
        igst_amount = round2(taxableAmt * igst_rate / 100);
      } else {
        cgst_rate = round2(gstRate / 2);
        sgst_rate = round2(gstRate / 2);
        cgst_amount = round2(taxableAmt * cgst_rate / 100);
        sgst_amount = round2(taxableAmt * sgst_rate / 100);
      }

      totalCgst += cgst_amount;
      totalSgst += sgst_amount;
      totalIgst += igst_amount;

      const totalAmount = round2(taxableAmt + cgst_amount + sgst_amount + igst_amount);

      return {
        line_number: index + 1,
        item_id: line.item_id,
        description: line.description || item.name,
        quantity: qty,
        uom_id: line.uom_id,
        unit_price: price,
        discount_amount: discountAmt,
        taxable_amount: taxableAmt,
        cgst_rate,
        sgst_rate,
        igst_rate,
        cgst_amount,
        sgst_amount,
        igst_amount,
        total_amount: totalAmount,
        hsn_code: line.hsn_code || item.hsn_code || null,
        grn_line_id: line.grn_line_id || null,
      };
    });

    const totalTax = round2(totalCgst + totalSgst + totalIgst);
    const taxableAmount = round2(subtotal - totalDiscount);
    const grandTotalRaw = round2(taxableAmount + totalTax);
    const roundOff = round2(Math.round(grandTotalRaw) - grandTotalRaw);
    const grandTotal = round2(grandTotalRaw + roundOff);

    return {
      computedLines,
      headerTotals: {
        subtotal: round2(subtotal),
        discount_amount: round2(totalDiscount),
        taxable_amount: taxableAmount,
        cgst_amount: round2(totalCgst),
        sgst_amount: round2(totalSgst),
        igst_amount: round2(totalIgst),
        total_tax: totalTax,
        grand_total: grandTotal,
        round_off: roundOff,
      },
    };
  }

  // ──────── CREATE ────────

  async createVendorBill(input: CreateVendorBillInput) {
    const { lines, ...headerInput } = input;

    if (!lines || lines.length === 0) {
      throw new Error('At least one line item is required');
    }

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

      // Validate PO if provided
      if (input.purchase_order_id) {
        const po = await trx('purchase_orders')
          .where({ id: input.purchase_order_id, company_id: input.company_id, is_deleted: false })
          .first();
        if (!po) throw new Error('Purchase order not found');
      }

      // Validate GRN if provided
      if (input.grn_id) {
        const grn = await trx('goods_receipt_notes')
          .where({ id: input.grn_id, company_id: input.company_id, is_deleted: false })
          .first();
        if (!grn) throw new Error('Goods receipt note not found');
      }

      // Auto-generate bill number
      const docNumberResult = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'vendor_bill') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const billNumber = docNumberResult.rows[0].doc_number;

      // Compute GST
      const { computedLines, headerTotals } = await this.resolveGst(
        trx,
        input.company_id,
        input.branch_id,
        input.vendor_id,
        lines
      );

      // Compute TDS
      let tdsRate = input.tds_rate || 0;
      let tdsAmount = 0;
      if (tdsRate > 0) {
        tdsAmount = round2(headerTotals.taxable_amount * tdsRate / 100);
      }

      // Compute grand total after TDS
      const grandTotalAfterTds = round2(headerTotals.grand_total - tdsAmount);

      // Build metadata
      const metadata: Record<string, any> = {
        ...(input.metadata || {}),
      };
      if (input.received_date) metadata.received_date = input.received_date;
      if (input.place_of_supply) metadata.place_of_supply = input.place_of_supply;
      if (input.tds_applicable !== undefined) metadata.tds_applicable = input.tds_applicable;
      if (input.tds_section) metadata.tds_section = input.tds_section;

      // Insert header
      const [header] = await trx('vendor_bills')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          bill_number: billNumber,
          bill_date: new Date().toISOString().split('T')[0],
          due_date: input.due_date || null,
          vendor_id: input.vendor_id,
          purchase_order_id: input.purchase_order_id || null,
          grn_id: input.grn_id || null,
          vendor_invoice_number: input.vendor_bill_number || null,
          vendor_invoice_date: input.vendor_bill_date || null,
          currency_code: input.currency_code || 'INR',
          exchange_rate: input.exchange_rate || 1.0,
          ...headerTotals,
          tds_rate: tdsRate,
          tds_amount: tdsAmount,
          grand_total: grandTotalAfterTds,
          amount_paid: 0,
          balance_due: grandTotalAfterTds,
          internal_notes: input.internal_notes || null,
          status: 'draft',
          metadata,
          created_by: input.created_by,
        })
        .returning('*');

      // Insert lines
      const insertedLines = await trx('vendor_bill_lines')
        .insert(
          computedLines.map((line) => ({
            company_id: input.company_id,
            bill_id: header.id,
            created_by: input.created_by,
            ...line,
          }))
        )
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getVendorBillWithDetails(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    // Lines with item + UOM info
    const lines = await this.db('vendor_bill_lines as vbl')
      .where({ 'vbl.bill_id': id, 'vbl.company_id': companyId, 'vbl.is_deleted': false })
      .leftJoin('items as i', 'vbl.item_id', 'i.id')
      .leftJoin('units_of_measurement as u', 'vbl.uom_id', 'u.id')
      .select(
        'vbl.*',
        'i.item_code',
        'i.name as item_name',
        'u.code as uom_code',
        'u.name as uom_name'
      )
      .orderBy('vbl.line_number');

    // Vendor info
    const vendor = await this.db('vendors')
      .where({ id: header.vendor_id })
      .select('id', 'vendor_code', 'name', 'display_name', 'gstin')
      .first();

    // Branch
    const branch = await this.db('branches')
      .where({ id: header.branch_id })
      .select('id', 'code', 'name', 'state', 'gstin')
      .first();

    // Source PO (if any)
    let purchaseOrder = null;
    if (header.purchase_order_id) {
      purchaseOrder = await this.db('purchase_orders')
        .where({ id: header.purchase_order_id })
        .select('id', 'po_number', 'po_date', 'status', 'grand_total')
        .first();
    }

    // Source GRN (if any)
    let grn = null;
    if (header.grn_id) {
      grn = await this.db('goods_receipt_notes')
        .where({ id: header.grn_id })
        .select('id', 'grn_number', 'grn_date', 'status')
        .first();
    }

    // Payment records linked to this bill
    const payments = await this.db('vendor_payments')
      .where({ vendor_bill_id: id, company_id: companyId, is_deleted: false })
      .select('id', 'payment_number', 'payment_date', 'amount', 'payment_method', 'status')
      .orderBy('payment_date', 'desc');

    return {
      ...header,
      lines,
      vendor,
      branch,
      purchase_order: purchaseOrder,
      grn,
      payments,
    };
  }

  // ──────── LIST ────────

  async listVendorBills(options: ListVendorBillsOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'bill_date',
      sortOrder = 'desc',
      vendor_id,
      purchase_order_id,
      overdue_only,
      from_date,
      to_date,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('vendor_bills')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (vendor_id) query = query.where('vendor_id', vendor_id);
    if (purchase_order_id) query = query.where('purchase_order_id', purchase_order_id);
    if (from_date) query = query.where('bill_date', '>=', from_date);
    if (to_date) query = query.where('bill_date', '<=', to_date);

    if (overdue_only) {
      query = query
        .where('status', 'approved')
        .where('due_date', '<', new Date().toISOString().split('T')[0])
        .where('balance_due', '>', 0);
    }

    if (search) {
      query = query.where(function () {
        this.orWhereILike('bill_number', `%${search}%`);
        this.orWhereILike('vendor_invoice_number', `%${search}%`);
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
      const vendorIds = [...new Set(data.map((bill: any) => bill.vendor_id))];
      const vendors = await this.db('vendors')
        .whereIn('id', vendorIds)
        .select('id', 'vendor_code', 'name', 'display_name');

      const vendorMap = new Map(vendors.map((v: any) => [v.id, v]));
      for (const bill of data) {
        (bill as any).vendor = vendorMap.get(bill.vendor_id);
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updateVendorBill(id: string, companyId: string, input: UpdateVendorBillInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('vendor_bills')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Vendor bill not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot edit vendor bill in "${existing.status}" status. Only draft bills can be edited.`);
      }

      const { lines, ...headerFieldsRaw } = input;

      // Build metadata updates
      const existingMetadata = existing.metadata || {};
      const metadataUpdates: Record<string, any> = { ...existingMetadata };
      if (input.received_date !== undefined) metadataUpdates.received_date = input.received_date;
      if (input.place_of_supply !== undefined) metadataUpdates.place_of_supply = input.place_of_supply;
      if (input.tds_applicable !== undefined) metadataUpdates.tds_applicable = input.tds_applicable;
      if (input.tds_section !== undefined) metadataUpdates.tds_section = input.tds_section;

      // Map frontend fields to DB columns
      const headerUpdates: Record<string, any> = {};
      if (input.vendor_id !== undefined) headerUpdates.vendor_id = input.vendor_id;
      if (input.purchase_order_id !== undefined) headerUpdates.purchase_order_id = input.purchase_order_id;
      if (input.grn_id !== undefined) headerUpdates.grn_id = input.grn_id;
      if (input.vendor_bill_number !== undefined) headerUpdates.vendor_invoice_number = input.vendor_bill_number;
      if (input.vendor_bill_date !== undefined) headerUpdates.vendor_invoice_date = input.vendor_bill_date;
      if (input.due_date !== undefined) headerUpdates.due_date = input.due_date;
      if (input.currency_code !== undefined) headerUpdates.currency_code = input.currency_code;
      if (input.exchange_rate !== undefined) headerUpdates.exchange_rate = input.exchange_rate;
      if (input.internal_notes !== undefined) headerUpdates.internal_notes = input.internal_notes;
      headerUpdates.metadata = metadataUpdates;

      // If lines are provided, recompute GST
      if (lines && lines.length > 0) {
        const vendorId = input.vendor_id ?? existing.vendor_id;

        const { computedLines, headerTotals } = await this.resolveGst(
          trx,
          companyId,
          existing.branch_id,
          vendorId,
          lines
        );

        // Soft-delete old lines
        await trx('vendor_bill_lines')
          .where({ bill_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Insert new lines
        await trx('vendor_bill_lines')
          .insert(
            computedLines.map((line) => ({
              company_id: companyId,
              bill_id: id,
              created_by: input.updated_by,
              ...line,
            }))
          );

        Object.assign(headerUpdates, headerTotals);

        // Recompute TDS
        const tdsRate = input.tds_rate ?? existing.tds_rate ?? 0;
        const tdsAmount = tdsRate > 0 ? round2(headerTotals.taxable_amount * tdsRate / 100) : 0;
        headerUpdates.tds_rate = tdsRate;
        headerUpdates.tds_amount = tdsAmount;
        headerUpdates.grand_total = round2(headerTotals.grand_total - tdsAmount);
        headerUpdates.balance_due = round2(headerUpdates.grand_total - parseFloat(existing.amount_paid || '0'));
      } else if (input.tds_rate !== undefined && input.tds_rate !== existing.tds_rate) {
        // TDS rate changed but lines unchanged — recompute TDS amounts
        const taxableAmount = parseFloat(existing.taxable_amount || '0');
        const totalTax = parseFloat(existing.total_tax || '0');
        const tdsAmount = input.tds_rate > 0 ? round2(taxableAmount * input.tds_rate / 100) : 0;
        const grandTotalBeforeTds = round2(taxableAmount + totalTax + parseFloat(existing.round_off || '0'));
        const grandTotal = round2(grandTotalBeforeTds - tdsAmount);
        headerUpdates.tds_rate = input.tds_rate;
        headerUpdates.tds_amount = tdsAmount;
        headerUpdates.grand_total = grandTotal;
        headerUpdates.balance_due = round2(grandTotal - parseFloat(existing.amount_paid || '0'));
      }

      // Clean fields that should not be updated
      delete headerUpdates.company_id;
      delete headerUpdates.branch_id;
      delete headerUpdates.bill_number;
      delete headerUpdates.bill_date;
      delete headerUpdates.status;

      if (Object.keys(headerUpdates).length > 0) {
        await trx('vendor_bills')
          .where({ id })
          .update({ ...headerUpdates, updated_by: input.updated_by });
      }

      const updated = await trx('vendor_bills').where({ id }).first();
      const updatedLines = await trx('vendor_bill_lines')
        .where({ bill_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── APPROVE (draft → approved) ────────

  async approveVendorBill(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const bill = await trx('vendor_bills')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!bill) throw new Error('Vendor bill not found');

      if (bill.status !== 'draft') {
        throw new Error(`Cannot approve. Current status: "${bill.status}". Only draft bills can be approved.`);
      }

      // Set balance_due = grand_total on approval
      const [approved] = await trx('vendor_bills')
        .where({ id, company_id: companyId })
        .update({
          status: 'approved',
          balance_due: bill.grand_total,
          updated_by: userId,
        })
        .returning('*');

      // If linked to a PO, update billed quantities
      if (bill.purchase_order_id) {
        const billLines = await trx('vendor_bill_lines')
          .where({ bill_id: id, company_id: companyId, is_deleted: false });

        // Build line-level billing info for PO update
        // Match bill lines to PO lines by item_id
        const poLines = await trx('purchase_order_lines')
          .where({ purchase_order_id: bill.purchase_order_id, company_id: companyId, is_deleted: false });

        const lineBills: { line_id: string; billed_qty: number }[] = [];

        for (const billLine of billLines) {
          // Find matching PO line by item_id
          const matchingPoLine = poLines.find((pol: any) => pol.item_id === billLine.item_id);
          if (matchingPoLine) {
            lineBills.push({
              line_id: matchingPoLine.id,
              billed_qty: parseFloat(billLine.quantity),
            });
          }
        }

        if (lineBills.length > 0) {
          await purchaseOrderService.updateBilledQuantity(
            bill.purchase_order_id,
            companyId,
            lineBills,
            userId,
            trx
          );
        }
      }

      return approved;
    });
  }

  // ──────── CANCEL (draft/approved → cancelled) ────────

  async cancelVendorBill(id: string, companyId: string, userId: string) {
    const bill = await this.getById(id, companyId);
    if (!bill) throw new Error('Vendor bill not found');

    const cancellableStatuses = ['draft', 'approved'];
    if (!cancellableStatuses.includes(bill.status)) {
      throw new Error(
        `Cannot cancel. Current status: "${bill.status}". Only draft or approved bills can be cancelled.`
      );
    }

    const [cancelled] = await this.db('vendor_bills')
      .where({ id, company_id: companyId })
      .update({
        status: 'cancelled',
        updated_by: userId,
      })
      .returning('*');

    return cancelled;
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteVendorBill(id: string, companyId: string, userId: string) {
    const bill = await this.getById(id, companyId);
    if (!bill) throw new Error('Vendor bill not found');

    if (bill.status !== 'draft') {
      throw new Error('Only draft vendor bills can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      // Soft-delete lines
      await trx('vendor_bill_lines')
        .where({ bill_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      // Soft-delete header
      const [deleted] = await trx('vendor_bills')
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

  // ──────── VENDOR OUTSTANDING ────────

  async getVendorOutstanding(vendorId: string, companyId: string) {
    const result = await this.db('vendor_bills')
      .where({ vendor_id: vendorId, company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['cancelled', 'draft'])
      .select(
        this.db.raw('COUNT(*) as total_bills'),
        this.db.raw('COALESCE(SUM(grand_total), 0) as total_billed'),
        this.db.raw('COALESCE(SUM(amount_paid), 0) as total_paid'),
        this.db.raw('COALESCE(SUM(balance_due), 0) as total_outstanding'),
        this.db.raw(`COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND balance_due > 0 THEN balance_due ELSE 0 END), 0) as total_overdue`)
      )
      .first();

    // Get overdue bill count separately
    const overdueCount = await this.db('vendor_bills')
      .where({ vendor_id: vendorId, company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['cancelled', 'draft'])
      .where('due_date', '<', new Date().toISOString().split('T')[0])
      .where('balance_due', '>', 0)
      .count('id as count')
      .first();

    const r = result as any;
    const oc = overdueCount as any;

    return {
      total_bills: parseInt(String(r?.total_bills || '0'), 10),
      total_billed: parseFloat(String(r?.total_billed || '0')),
      total_paid: parseFloat(String(r?.total_paid || '0')),
      total_outstanding: parseFloat(String(r?.total_outstanding || '0')),
      total_overdue: parseFloat(String(r?.total_overdue || '0')),
      overdue_bill_count: parseInt(String(oc?.count || '0'), 10),
    };
  }
}

export const vendorBillService = new VendorBillService();
