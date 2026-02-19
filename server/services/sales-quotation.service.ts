// =============================================================
// File: server/services/sales-quotation.service.ts
// Module: Sales Management — Phase 5, Step 15
// Description: Sales Quotation service with header+lines CRUD,
//              auto document numbering, GST computation
//              (CGST+SGST vs IGST), status lifecycle, and
//              convert-to-SO preparation.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface QuotationLineInput {
  line_number: number;
  product_id: string;
  description?: string;
  quantity: number;
  uom_id: string;
  unit_price: number;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  hsn_code?: string;
}

export interface CreateQuotationInput {
  company_id: string;
  branch_id: string;
  quotation_date: string;
  valid_until?: string;
  customer_id: string;
  contact_person_id?: string;
  billing_address_id?: string;
  shipping_address_id?: string;
  reference_number?: string;
  currency_code?: string;
  exchange_rate?: number;
  terms_and_conditions?: string;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines: QuotationLineInput[];
  created_by?: string;
}

export interface UpdateQuotationInput {
  valid_until?: string;
  customer_id?: string;
  contact_person_id?: string;
  billing_address_id?: string;
  shipping_address_id?: string;
  reference_number?: string;
  currency_code?: string;
  exchange_rate?: number;
  terms_and_conditions?: string;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines?: QuotationLineInput[];
  updated_by?: string;
}

export interface ListQuotationsOptions extends ListOptions {
  customer_id?: string;
  branch_id?: string;
  from_date?: string;
  to_date?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Determine GST split for a single line.
 *
 * Logic:
 *  - Look up the product's default GST rate from `tax_masters`
 *  - Determine place of supply:
 *      1. Use shipping address state if provided
 *      2. Else fall back to the branch's state (where the invoice originates)
 *  - If branch state === supply state → CGST + SGST (each = rate / 2)
 *  - Else → IGST (full rate)
 */
interface GstResult {
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class SalesQuotationService extends BaseService {
  constructor() {
    super('sales_quotations');
  }

  // ──────── Private: Resolve GST for all lines ────────

  private async resolveGst(
    trx: Knex,
    companyId: string,
    branchId: string,
    shippingAddressId: string | null | undefined,
    lines: QuotationLineInput[]
  ): Promise<{
    computedLines: Record<string, any>[];
    headerTotals: Record<string, number>;
  }> {
    // 1. Get the branch state (origin)
    const branch = await trx('branches')
      .where({ id: branchId, company_id: companyId })
      .select('state')
      .first();

    const branchState = (branch?.state || '').trim().toLowerCase();

    // 2. Get supply state from shipping address (if provided)
    let supplyState = branchState; // default = intra-state
    if (shippingAddressId) {
      const addr = await trx('addresses')
        .where({ id: shippingAddressId, company_id: companyId, is_deleted: false })
        .select('state')
        .first();
      if (addr?.state) {
        supplyState = addr.state.trim().toLowerCase();
      }
    }

    const isInterState = branchState !== supplyState;

    // 3. Fetch product details + GST rates
    const productIds = [...new Set(lines.map((l) => l.product_id))];
    const products = await trx('products')
      .whereIn('id', productIds)
      .where({ is_deleted: false })
      .select('id', 'name', 'product_code', 'hsn_code', 'gst_rate', 'selling_price');

    const productMap = new Map(products.map((p: any) => [p.id, p]));

    // 4. Compute per-line amounts
    let subtotal = 0;
    let totalDiscount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const computedLines: Record<string, any>[] = lines.map((line) => {
      const product = productMap.get(line.product_id);
      if (!product) {
        throw new Error(`Product not found: ${line.product_id}`);
      }

      const qty = line.quantity;
      const price = line.unit_price;
      const lineSubtotal = round2(qty * price);
      subtotal += lineSubtotal;

      // Discount
      let discountAmt = 0;
      if (line.discount_type === 'percentage' && line.discount_value) {
        discountAmt = round2(lineSubtotal * line.discount_value / 100);
      } else if (line.discount_type === 'fixed' && line.discount_value) {
        discountAmt = round2(line.discount_value);
      }
      totalDiscount += discountAmt;

      const taxableAmt = round2(lineSubtotal - discountAmt);

      // GST rate — use product default
      const gstRate = parseFloat(product.gst_rate) || 0;

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
        line_number: line.line_number,
        product_id: line.product_id,
        description: line.description || product.name,
        quantity: qty,
        uom_id: line.uom_id,
        unit_price: price,
        discount_type: line.discount_type || null,
        discount_value: line.discount_value || null,
        discount_amount: discountAmt,
        taxable_amount: taxableAmt,
        cgst_rate,
        sgst_rate,
        igst_rate,
        cgst_amount,
        sgst_amount,
        igst_amount,
        total_amount: totalAmount,
        hsn_code: line.hsn_code || product.hsn_code || null,
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

  async createQuotation(input: CreateQuotationInput) {
    const { lines, ...headerInput } = input;

    if (!lines || lines.length === 0) {
      throw new Error('At least one line item is required');
    }

    return await this.db.transaction(async (trx) => {
      // Validate customer exists
      const customer = await trx('customers')
        .where({ id: input.customer_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!customer) throw new Error('Customer not found');

      // Validate branch exists
      const branch = await trx('branches')
        .where({ id: input.branch_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!branch) throw new Error('Branch not found');

      // Auto-generate quotation number
      const docNumberResult = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'quotation') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const quotationNumber = docNumberResult.rows[0].doc_number;

      // Compute GST and line totals
      const { computedLines, headerTotals } = await this.resolveGst(
        trx,
        input.company_id,
        input.branch_id,
        input.shipping_address_id,
        lines
      );

      // Insert header
      const [header] = await trx('sales_quotations')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          quotation_number: quotationNumber,
          quotation_date: input.quotation_date,
          valid_until: input.valid_until || null,
          customer_id: input.customer_id,
          contact_person_id: input.contact_person_id || null,
          billing_address_id: input.billing_address_id || null,
          shipping_address_id: input.shipping_address_id || null,
          reference_number: input.reference_number || null,
          currency_code: input.currency_code || 'INR',
          exchange_rate: input.exchange_rate || 1.0,
          ...headerTotals,
          terms_and_conditions: input.terms_and_conditions || null,
          internal_notes: input.internal_notes || null,
          status: 'draft',
          metadata: input.metadata || {},
          created_by: input.created_by,
        })
        .returning('*');

      // Insert lines
      const insertedLines = await trx('sales_quotation_lines')
        .insert(
          computedLines.map((line) => ({
            company_id: input.company_id,
            quotation_id: header.id,
            created_by: input.created_by,
            ...line,
          }))
        )
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getQuotationWithDetails(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    // Lines with product + UOM info
    const lines = await this.db('sales_quotation_lines as sql')
      .where({ 'sql.quotation_id': id, 'sql.company_id': companyId, 'sql.is_deleted': false })
      .leftJoin('products as p', 'sql.product_id', 'p.id')
      .leftJoin('units_of_measurement as u', 'sql.uom_id', 'u.id')
      .select(
        'sql.*',
        'p.product_code',
        'p.name as product_name',
        'u.code as uom_code',
        'u.name as uom_name'
      )
      .orderBy('sql.line_number');

    // Customer info
    const customer = await this.db('customers')
      .where({ id: header.customer_id })
      .select('id', 'customer_code', 'name', 'display_name', 'gstin')
      .first();

    // Billing & shipping addresses
    const billingAddress = header.billing_address_id
      ? await this.db('addresses').where({ id: header.billing_address_id }).first()
      : null;

    const shippingAddress = header.shipping_address_id
      ? await this.db('addresses').where({ id: header.shipping_address_id }).first()
      : null;

    // Contact person
    const contactPerson = header.contact_person_id
      ? await this.db('contact_persons').where({ id: header.contact_person_id }).first()
      : null;

    // Branch info
    const branch = await this.db('branches')
      .where({ id: header.branch_id })
      .select('id', 'code', 'name', 'state', 'gstin')
      .first();

    return {
      ...header,
      lines,
      customer,
      branch,
      billing_address: billingAddress,
      shipping_address: shippingAddress,
      contact_person: contactPerson,
    };
  }

  // ──────── LIST ────────

  async listQuotations(options: ListQuotationsOptions) {
    const { customer_id, branch_id, from_date, to_date, ...baseOptions } = options;

    const filters: Record<string, any> = {};
    if (customer_id) filters.customer_id = customer_id;
    if (branch_id) filters.branch_id = branch_id;

    // Build base query via parent
    const result = await this.list({
      ...baseOptions,
      searchFields: ['quotation_number', 'reference_number'],
      filters,
      sortBy: baseOptions.sortBy || 'quotation_date',
    });

    // Apply date range filtering (post-filter since BaseService doesn't support range)
    // For efficiency, we'll do a custom query if date filters are present
    if (from_date || to_date) {
      return this.listWithDateRange(options);
    }

    // Enrich with customer names
    if (result.data.length > 0) {
      const customerIds = [...new Set(result.data.map((q: any) => q.customer_id))];
      const customers = await this.db('customers')
        .whereIn('id', customerIds)
        .select('id', 'customer_code', 'name', 'display_name');

      const customerMap = new Map(customers.map((c: any) => [c.id, c]));
      result.data = result.data.map((q: any) => ({
        ...q,
        customer: customerMap.get(q.customer_id),
      }));
    }

    return result;
  }

  private async listWithDateRange(options: ListQuotationsOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'quotation_date',
      sortOrder = 'desc',
      customer_id,
      branch_id,
      from_date,
      to_date,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('sales_quotations')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (customer_id) query = query.where('customer_id', customer_id);
    if (branch_id) query = query.where('branch_id', branch_id);
    if (from_date) query = query.where('quotation_date', '>=', from_date);
    if (to_date) query = query.where('quotation_date', '<=', to_date);

    if (search) {
      query = query.where(function () {
        this.orWhereILike('quotation_number', `%${search}%`);
        this.orWhereILike('reference_number', `%${search}%`);
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
      const customerIds = [...new Set(data.map((q: any) => q.customer_id))];
      const customers = await this.db('customers')
        .whereIn('id', customerIds)
        .select('id', 'customer_code', 'name', 'display_name');

      const customerMap = new Map(customers.map((c: any) => [c.id, c]));
      for (const q of data) {
        (q as any).customer = customerMap.get(q.customer_id);
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft / sent only) ────────

  async updateQuotation(id: string, companyId: string, input: UpdateQuotationInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('sales_quotations')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Quotation not found');
      if (!['draft', 'sent'].includes(existing.status)) {
        throw new Error(`Cannot edit quotation in "${existing.status}" status`);
      }

      const { lines, ...headerUpdates } = input;

      // If lines are provided, recompute everything
      if (lines && lines.length > 0) {
        const branchId = existing.branch_id;
        const shippingAddressId = input.shipping_address_id ?? existing.shipping_address_id;

        const { computedLines, headerTotals } = await this.resolveGst(
          trx,
          companyId,
          branchId,
          shippingAddressId,
          lines
        );

        // Soft-delete old lines
        await trx('sales_quotation_lines')
          .where({ quotation_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Insert new lines
        await trx('sales_quotation_lines')
          .insert(
            computedLines.map((line) => ({
              company_id: companyId,
              quotation_id: id,
              created_by: input.updated_by,
              ...line,
            }))
          );

        // Update header with new totals
        Object.assign(headerUpdates, headerTotals);
      }

      // Clean up fields that shouldn't be updated directly
      delete (headerUpdates as any).company_id;
      delete (headerUpdates as any).branch_id;
      delete (headerUpdates as any).quotation_number;
      delete (headerUpdates as any).quotation_date;
      delete (headerUpdates as any).status;

      if (Object.keys(headerUpdates).length > 0) {
        await trx('sales_quotations')
          .where({ id })
          .update({ ...headerUpdates, updated_by: input.updated_by });
      }

      // Return updated quotation
      const updated = await trx('sales_quotations').where({ id }).first();
      const updatedLines = await trx('sales_quotation_lines')
        .where({ quotation_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── STATUS TRANSITIONS ────────

  async updateStatus(
    id: string,
    companyId: string,
    newStatus: string,
    userId: string
  ) {
    const validTransitions: Record<string, string[]> = {
      draft: ['sent'],
      sent: ['accepted', 'rejected', 'expired'],
      accepted: ['converted'],
      // rejected and expired are terminal (unless reverted to draft)
    };

    const quotation = await this.getById(id, companyId);
    if (!quotation) throw new Error('Quotation not found');

    const allowed = validTransitions[quotation.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Cannot transition from "${quotation.status}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none'}`
      );
    }

    const [updated] = await this.db('sales_quotations')
      .where({ id, company_id: companyId })
      .update({ status: newStatus, updated_by: userId })
      .returning('*');

    return updated;
  }

  // ──────── REVERT TO DRAFT ────────

  async revertToDraft(id: string, companyId: string, userId: string) {
    const quotation = await this.getById(id, companyId);
    if (!quotation) throw new Error('Quotation not found');

    if (!['sent', 'rejected', 'expired'].includes(quotation.status)) {
      throw new Error(`Cannot revert to draft from "${quotation.status}" status`);
    }

    const [updated] = await this.db('sales_quotations')
      .where({ id, company_id: companyId })
      .update({ status: 'draft', updated_by: userId })
      .returning('*');

    return updated;
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteQuotation(id: string, companyId: string, userId: string) {
    const quotation = await this.getById(id, companyId);
    if (!quotation) throw new Error('Quotation not found');

    if (quotation.status !== 'draft') {
      throw new Error('Only draft quotations can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      // Soft-delete lines
      await trx('sales_quotation_lines')
        .where({ quotation_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      // Soft-delete header
      const [deleted] = await trx('sales_quotations')
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

  // ──────── DUPLICATE ────────

  async duplicateQuotation(id: string, companyId: string, branchId: string, userId: string) {
    const source = await this.getQuotationWithDetails(id, companyId);
    if (!source) throw new Error('Source quotation not found');

    const lines: QuotationLineInput[] = source.lines.map((l: any) => ({
      line_number: l.line_number,
      product_id: l.product_id,
      description: l.description,
      quantity: parseFloat(l.quantity),
      uom_id: l.uom_id,
      unit_price: parseFloat(l.unit_price),
      discount_type: l.discount_type,
      discount_value: l.discount_value ? parseFloat(l.discount_value) : undefined,
      hsn_code: l.hsn_code,
    }));

    return this.createQuotation({
      company_id: companyId,
      branch_id: branchId,
      quotation_date: new Date().toISOString().split('T')[0],
      valid_until: source.valid_until || undefined,
      customer_id: source.customer_id,
      contact_person_id: source.contact_person_id || undefined,
      billing_address_id: source.billing_address_id || undefined,
      shipping_address_id: source.shipping_address_id || undefined,
      reference_number: source.reference_number || undefined,
      currency_code: source.currency_code,
      exchange_rate: parseFloat(source.exchange_rate) || 1.0,
      terms_and_conditions: source.terms_and_conditions || undefined,
      internal_notes: `Duplicated from ${source.quotation_number}`,
      lines,
      created_by: userId,
    });
  }

  // ──────── CONVERT TO SALES ORDER (prep) ────────
  // Full conversion logic will be in SalesOrderService (Step 16).
  // This method validates and marks the quotation as converted.

  async markAsConverted(id: string, companyId: string, salesOrderId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const quotation = await trx('sales_quotations')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!quotation) throw new Error('Quotation not found');
      if (quotation.status !== 'accepted') {
        throw new Error('Only accepted quotations can be converted to a sales order');
      }

      const [updated] = await trx('sales_quotations')
        .where({ id })
        .update({
          status: 'converted',
          converted_to_so_id: salesOrderId,
          updated_by: userId,
        })
        .returning('*');

      return updated;
    });
  }

  // ──────── EXPIRE OVERDUE QUOTATIONS ────────
  // Utility: can be called from a scheduled task

  async expireOverdueQuotations(companyId: string) {
    const today = new Date().toISOString().split('T')[0];

    const expired = await this.db('sales_quotations')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['draft', 'sent'])
      .where('valid_until', '<', today)
      .whereNotNull('valid_until')
      .update({ status: 'expired' })
      .returning(['id', 'quotation_number']);

    return { expired_count: expired.length, expired };
  }
}

export const salesQuotationService = new SalesQuotationService();