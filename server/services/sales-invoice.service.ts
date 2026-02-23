// =============================================================
// File: server/services/sales-invoice.service.ts
// Module: Sales Management — Phase 5, Step 18
// Description: Sales Invoice service with GST-compliant
//              invoicing, SO linking, partial invoicing,
//              place of supply (CGST+SGST vs IGST), TCS,
//              amount_paid / balance_due tracking, due date
//              computation, e-invoice IRN readiness, and
//              SO invoiced_quantity updates.
//
// Note: Auto ledger posting (double-entry) will integrate
//       when the Financial Module (Phase 9) is built.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { salesOrderService } from './sales-order.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface InvoiceLineInput {
  line_number: number;
  product_id: string;
  description?: string;
  quantity: number;
  uom_id: string;
  unit_price: number;
  discount_amount?: number;
  hsn_code?: string;
  sales_order_line_id?: string;
  warehouse_id?: string;
  batch_id?: string;
}

export interface CreateInvoiceInput {
  company_id: string;
  branch_id: string;
  invoice_date: string;
  due_date?: string;
  customer_id: string;
  sales_order_id?: string;
  billing_address_id?: string;
  shipping_address_id?: string;
  place_of_supply?: string;
  is_reverse_charge?: boolean;
  currency_code?: string;
  exchange_rate?: number;
  tcs_rate?: number;          // TCS % if applicable
  terms_and_conditions?: string;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines: InvoiceLineInput[];
  created_by?: string;
}

export interface UpdateInvoiceInput {
  due_date?: string;
  billing_address_id?: string;
  shipping_address_id?: string;
  place_of_supply?: string;
  is_reverse_charge?: boolean;
  currency_code?: string;
  exchange_rate?: number;
  tcs_rate?: number;
  terms_and_conditions?: string;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines?: InvoiceLineInput[];
  updated_by?: string;
}

export interface ListInvoicesOptions extends ListOptions {
  customer_id?: string;
  branch_id?: string;
  sales_order_id?: string;
  from_date?: string;
  to_date?: string;
  overdue_only?: boolean;
}

// ────────────────────────────────────────────────────────────
// DB Row Types (for Knex query results)
// ────────────────────────────────────────────────────────────

interface SalesOrderLineRow {
  id: string;
  company_id: string;
  sales_order_id: string;
  line_number: number;
  product_id: string;
  description: string | null;
  quantity: string; // DECIMAL comes back as string from PG
  delivered_quantity: string;
  invoiced_quantity: string;
  uom_id: string;
  unit_price: string;
  discount_amount: string;
  taxable_amount: string;
  cgst_rate: string | null;
  sgst_rate: string | null;
  igst_rate: string | null;
  cgst_amount: string | null;
  sgst_amount: string | null;
  igst_amount: string | null;
  total_amount: string;
  hsn_code: string | null;
  warehouse_id: string | null;
  is_deleted: boolean;
  [key: string]: any; // allow extra joined columns
}

interface SalesOrderRow {
  id: string;
  company_id: string;
  branch_id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  billing_address_id: string | null;
  shipping_address_id: string | null;
  currency_code: string;
  exchange_rate: string;
  terms_and_conditions: string | null;
  status: string;
  lines: SalesOrderLineRow[];
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

class SalesInvoiceService extends BaseService {
  constructor() {
    super('sales_invoices');
  }

  // ──────── Private: GST computation ────────

  private async resolveGst(
    trx: Knex,
    companyId: string,
    branchId: string,
    shippingAddressId: string | null | undefined,
    placeOfSupply: string | null | undefined,
    lines: InvoiceLineInput[],
    tcsRate?: number
  ): Promise<{
    computedLines: Record<string, any>[];
    headerTotals: Record<string, any>;
    resolvedPlaceOfSupply: string;
  }> {
    // 1. Branch state (origin)
    const branch = await trx('branches')
      .where({ id: branchId, company_id: companyId })
      .select('state')
      .first();

    const branchState = (branch?.state || '').trim().toLowerCase();

    // 2. Determine place of supply
    let supplyState = branchState;
    if (placeOfSupply) {
      supplyState = placeOfSupply.trim().toLowerCase();
    } else if (shippingAddressId) {
      const addr = await trx('addresses')
        .where({ id: shippingAddressId, company_id: companyId, is_deleted: false })
        .select('state')
        .first();
      if (addr?.state) {
        supplyState = addr.state.trim().toLowerCase();
      }
    }

    const isInterState = branchState !== supplyState;

    // 3. Fetch products
    const productIds = [...new Set(lines.map((l) => l.product_id))];
    const products = await trx('products')
      .whereIn('id', productIds)
      .where({ is_deleted: false })
      .select('id', 'name', 'product_code', 'hsn_code', 'gst_rate', 'selling_price');

    const productMap = new Map(products.map((p: any) => [p.id, p]));

    // 4. Per-line computation
    let subtotal = 0;
    let totalDiscount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const computedLines: Record<string, any>[] = lines.map((line) => {
      const product = productMap.get(line.product_id);
      if (!product) throw new Error(`Product not found: ${line.product_id}`);

      const qty = line.quantity;
      const price = line.unit_price;
      const lineSubtotal = round2(qty * price);
      subtotal += lineSubtotal;

      const discountAmt = round2(line.discount_amount || 0);
      totalDiscount += discountAmt;

      const taxableAmt = round2(lineSubtotal - discountAmt);

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
        sales_order_line_id: line.sales_order_line_id || null,
        warehouse_id: line.warehouse_id || null,
      };
    });

    const totalTax = round2(totalCgst + totalSgst + totalIgst);
    const taxableAmount = round2(subtotal - totalDiscount);
    const preRoundTotal = round2(taxableAmount + totalTax);

    // TCS computation (on grand total before round-off)
    const tcsAmount = tcsRate ? round2(preRoundTotal * tcsRate / 100) : 0;

    const grandTotalRaw = round2(preRoundTotal + tcsAmount);
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
        tcs_amount: tcsAmount,
        grand_total: grandTotal,
        round_off: roundOff,
        amount_paid: 0,
        balance_due: grandTotal,
      },
      resolvedPlaceOfSupply: supplyState,
    };
  }

  // ──────── CREATE ────────

  async createInvoice(input: CreateInvoiceInput) {
    const { lines, ...headerInput } = input;

    if (!lines || lines.length === 0) {
      throw new Error('At least one line item is required');
    }

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

      // If SO linked, validate and check invoiceable quantities
      if (input.sales_order_id) {
        const so = await trx('sales_orders')
          .where({ id: input.sales_order_id, company_id: input.company_id, is_deleted: false })
          .first();

        if (!so) throw new Error('Sales order not found');
        if (['draft', 'cancelled'].includes(so.status)) {
          throw new Error(`Cannot invoice a ${so.status} sales order`);
        }

        // Validate line quantities against SO remaining invoiceable
        const soLines: SalesOrderLineRow[] = await trx('sales_order_lines')
          .where({ sales_order_id: so.id, company_id: input.company_id, is_deleted: false });
        const soLineMap = new Map<string, SalesOrderLineRow>(soLines.map((l) => [l.id, l]));

        for (const line of lines) {
          if (line.sales_order_line_id) {
            const soLine = soLineMap.get(line.sales_order_line_id);
            if (!soLine) throw new Error(`SO line not found: ${line.sales_order_line_id}`);

            const remaining = round2(
              parseFloat(soLine.quantity) - parseFloat(soLine.invoiced_quantity)
            );
            if (line.quantity > remaining) {
              throw new Error(
                `Line ${line.line_number}: quantity ${line.quantity} exceeds remaining ` +
                `invoiceable ${remaining} (ordered: ${soLine.quantity}, ` +
                `already invoiced: ${soLine.invoiced_quantity})`
              );
            }
          }
        }
      }

      // Auto-generate invoice number
      const docNumberResult = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'invoice') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const invoiceNumber = docNumberResult.rows[0].doc_number;

      // Compute due date from payment terms if not provided
      let dueDate = input.due_date;
      if (!dueDate && customer.payment_terms_days) {
        const invDate = new Date(input.invoice_date);
        invDate.setDate(invDate.getDate() + customer.payment_terms_days);
        dueDate = invDate.toISOString().split('T')[0];
      }

      // Compute GST + TCS
      const { computedLines, headerTotals, resolvedPlaceOfSupply } = await this.resolveGst(
        trx,
        input.company_id,
        input.branch_id,
        input.shipping_address_id,
        input.place_of_supply,
        lines,
        input.tcs_rate
      );

      // Insert header
      const [header] = await trx('sales_invoices')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          invoice_number: invoiceNumber,
          invoice_date: input.invoice_date,
          due_date: dueDate || null,
          customer_id: input.customer_id,
          sales_order_id: input.sales_order_id || null,
          billing_address_id: input.billing_address_id || null,
          shipping_address_id: input.shipping_address_id || null,
          place_of_supply: resolvedPlaceOfSupply,
          reverse_charge: input.is_reverse_charge || false,
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
      const insertedLines = await trx('sales_invoice_lines')
        .insert(
          computedLines.map((line) => ({
            company_id: input.company_id,
            invoice_id: header.id,
            created_by: input.created_by,
            ...line,
          }))
        )
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── CREATE FROM SALES ORDER ────────

  async createFromSalesOrder(salesOrderId: string, companyId: string, userId: string, overrides?: {
    invoice_date?: string;
    due_date?: string;
    tcs_rate?: number;
    internal_notes?: string;
    partial_lines?: { sales_order_line_id: string; quantity: number }[];
  }) {
    const so = await salesOrderService.getSalesOrderWithDetails(salesOrderId, companyId) as SalesOrderRow | null;
    if (!so) throw new Error('Sales order not found');

    if (['draft', 'cancelled'].includes(so.status)) {
      throw new Error(`Cannot invoice a ${so.status} sales order`);
    }

    // Determine which lines and quantities to invoice
    let linesToInvoice: InvoiceLineInput[];

    if (overrides?.partial_lines && overrides.partial_lines.length > 0) {
      // Partial invoicing — only specified lines/quantities
      const soLineMap = new Map<string, SalesOrderLineRow>(so.lines.map((l) => [l.id, l]));

      linesToInvoice = overrides.partial_lines.map((pl, idx) => {
        const soLine = soLineMap.get(pl.sales_order_line_id);
        if (!soLine) throw new Error(`SO line not found: ${pl.sales_order_line_id}`);

        const remaining = round2(
          parseFloat(soLine.quantity) - parseFloat(soLine.invoiced_quantity)
        );
        if (pl.quantity > remaining) {
          throw new Error(
            `SO line ${soLine.line_number}: quantity ${pl.quantity} exceeds remaining invoiceable ${remaining}`
          );
        }

        return {
          line_number: idx + 1,
          product_id: soLine.product_id,
          description: soLine.description || undefined,
          quantity: pl.quantity,
          uom_id: soLine.uom_id,
          unit_price: parseFloat(soLine.unit_price),
          discount_amount: round2(
            (parseFloat(soLine.discount_amount) / parseFloat(soLine.quantity)) * pl.quantity
          ),
          hsn_code: soLine.hsn_code || undefined,
          sales_order_line_id: soLine.id,
          warehouse_id: soLine.warehouse_id || undefined,
        };
      });
    } else {
      // Full invoicing — all remaining uninvoiced quantities
      linesToInvoice = so.lines
        .filter((l) => {
          const remaining = parseFloat(l.quantity) - parseFloat(l.invoiced_quantity);
          return remaining > 0;
        })
        .map((l, idx) => ({
          line_number: idx + 1,
          product_id: l.product_id,
          description: l.description || undefined,
          quantity: round2(parseFloat(l.quantity) - parseFloat(l.invoiced_quantity)),
          uom_id: l.uom_id,
          unit_price: parseFloat(l.unit_price),
          discount_amount: round2(
            (parseFloat(l.discount_amount) / parseFloat(l.quantity)) *
            (parseFloat(l.quantity) - parseFloat(l.invoiced_quantity))
          ),
          hsn_code: l.hsn_code || undefined,
          sales_order_line_id: l.id,
          warehouse_id: l.warehouse_id || undefined,
        }));
    }

    if (linesToInvoice.length === 0) {
      throw new Error('No remaining quantities to invoice on this sales order');
    }

    // Create the invoice
    const invoice = await this.createInvoice({
      company_id: companyId,
      branch_id: so.branch_id,
      invoice_date: overrides?.invoice_date || new Date().toISOString().split('T')[0],
      due_date: overrides?.due_date,
      customer_id: so.customer_id,
      sales_order_id: salesOrderId,
      billing_address_id: so.billing_address_id || undefined,
      shipping_address_id: so.shipping_address_id || undefined,
      currency_code: so.currency_code,
      exchange_rate: parseFloat(so.exchange_rate) || 1.0,
      tcs_rate: overrides?.tcs_rate,
      terms_and_conditions: so.terms_and_conditions || undefined,
      internal_notes: overrides?.internal_notes || `Invoice from SO ${so.order_number}`,
      lines: linesToInvoice,
      created_by: userId,
    });

    // Update SO invoiced quantities
    const soLineInvoices = invoice.lines
      .filter((l: any) => l.sales_order_line_id)
      .map((l: any) => ({
        line_id: l.sales_order_line_id,
        invoiced_qty: parseFloat(l.quantity),
      }));

    if (soLineInvoices.length > 0) {
      await salesOrderService.updateInvoicedQuantity(
        salesOrderId,
        companyId,
        soLineInvoices,
        userId
      );
    }

    return invoice;
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getInvoiceWithDetails(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    // Lines
    const lines = await this.db('sales_invoice_lines as sil')
      .where({ 'sil.invoice_id': id, 'sil.company_id': companyId, 'sil.is_deleted': false })
      .leftJoin('products as p', 'sil.product_id', 'p.id')
      .leftJoin('units_of_measurement as u', 'sil.uom_id', 'u.id')
      .leftJoin('warehouses as w', 'sil.warehouse_id', 'w.id')
      .select(
        'sil.*',
        'p.product_code',
        'p.name as product_name',
        'u.code as uom_code',
        'u.name as uom_name',
        'w.code as warehouse_code',
        'w.name as warehouse_name'
      )
      .orderBy('sil.line_number');

    // Customer
    const customer = await this.db('customers')
      .where({ id: header.customer_id })
      .select('id', 'customer_code', 'name', 'display_name', 'gstin')
      .first();

    // Branch
    const branch = await this.db('branches')
      .where({ id: header.branch_id })
      .select('id', 'code', 'name', 'state', 'gstin')
      .first();

    // Addresses
    const billingAddress = header.billing_address_id
      ? await this.db('addresses').where({ id: header.billing_address_id }).first()
      : null;

    const shippingAddress = header.shipping_address_id
      ? await this.db('addresses').where({ id: header.shipping_address_id }).first()
      : null;

    // Source SO
    let salesOrder = null;
    if (header.sales_order_id) {
      salesOrder = await this.db('sales_orders')
        .where({ id: header.sales_order_id })
        .select('id', 'order_number', 'order_date', 'status', 'customer_po_number')
        .first();
    }

    // Payment receipts against this invoice
    const payments = await this.db('payment_receipts')
      .where({ company_id: companyId, is_deleted: false })
      .whereRaw(`metadata->>'invoice_id' = ?`, [id])
      .select('id', 'receipt_number', 'receipt_date', 'amount', 'payment_mode', 'status')
      .orderBy('receipt_date');

    return {
      ...header,
      lines,
      customer,
      branch,
      billing_address: billingAddress,
      shipping_address: shippingAddress,
      sales_order: salesOrder,
      payments,
    };
  }

  // ──────── LIST ────────

  async listInvoices(options: ListInvoicesOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'invoice_date',
      sortOrder = 'desc',
      customer_id,
      branch_id,
      sales_order_id,
      from_date,
      to_date,
      overdue_only,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('sales_invoices')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (customer_id) query = query.where('customer_id', customer_id);
    if (branch_id) query = query.where('branch_id', branch_id);
    if (sales_order_id) query = query.where('sales_order_id', sales_order_id);
    if (from_date) query = query.where('invoice_date', '>=', from_date);
    if (to_date) query = query.where('invoice_date', '<=', to_date);

    if (overdue_only) {
      const today = new Date().toISOString().split('T')[0];
      query = query
        .where('due_date', '<', today)
        .where('balance_due', '>', 0)
        .whereNotIn('status', ['paid', 'cancelled']);
    }

    if (search) {
      query = query.where(function () {
        this.orWhereILike('invoice_number', `%${search}%`);
        this.orWhereILike('irn', `%${search}%`);
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
      const customerIds = [...new Set(data.map((inv: any) => inv.customer_id))];
      const customers = await this.db('customers')
        .whereIn('id', customerIds)
        .select('id', 'customer_code', 'name', 'display_name');
      const customerMap = new Map(customers.map((c: any) => [c.id, c]));

      for (const inv of data) {
        (inv as any).customer = customerMap.get(inv.customer_id);
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updateInvoice(id: string, companyId: string, input: UpdateInvoiceInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('sales_invoices')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Invoice not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot edit invoice in "${existing.status}" status. Only draft invoices can be edited.`);
      }

      const { lines, is_reverse_charge, ...headerUpdates } = input;
      if (is_reverse_charge !== undefined) {
        (headerUpdates as any).reverse_charge = is_reverse_charge;
      }

      if (lines && lines.length > 0) {
        const branchId = existing.branch_id;
        const shippingAddressId = input.shipping_address_id ?? existing.shipping_address_id;
        const placeOfSupply = input.place_of_supply ?? existing.place_of_supply;

        const { computedLines, headerTotals } = await this.resolveGst(
          trx,
          companyId,
          branchId,
          shippingAddressId,
          placeOfSupply,
          lines,
          input.tcs_rate
        );

        // Soft-delete old lines
        await trx('sales_invoice_lines')
          .where({ invoice_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Insert new lines
        await trx('sales_invoice_lines')
          .insert(
            computedLines.map((line) => ({
              company_id: companyId,
              invoice_id: id,
              created_by: input.updated_by,
              ...line,
            }))
          );

        Object.assign(headerUpdates, headerTotals);
      }

      // Clean fields
      delete (headerUpdates as any).company_id;
      delete (headerUpdates as any).branch_id;
      delete (headerUpdates as any).invoice_number;
      delete (headerUpdates as any).invoice_date;
      delete (headerUpdates as any).status;
      delete (headerUpdates as any).customer_id;
      delete (headerUpdates as any).sales_order_id;
      delete (headerUpdates as any).tcs_rate;

      if (Object.keys(headerUpdates).length > 0) {
        await trx('sales_invoices')
          .where({ id })
          .update({ ...headerUpdates, updated_by: input.updated_by });
      }

      const updated = await trx('sales_invoices').where({ id }).first();
      const updatedLines = await trx('sales_invoice_lines')
        .where({ invoice_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── STATUS TRANSITIONS ────────

  async updateStatus(id: string, companyId: string, newStatus: string, userId: string) {
    const validTransitions: Record<string, string[]> = {
      draft: ['approved', 'cancelled'],
      approved: ['sent', 'cancelled'],
      sent: ['partially_paid', 'paid', 'overdue', 'cancelled'],
      partially_paid: ['paid', 'overdue'],
      overdue: ['partially_paid', 'paid'],
      // paid and cancelled are terminal
    };

    const invoice = await this.getById(id, companyId);
    if (!invoice) throw new Error('Invoice not found');

    const allowed = validTransitions[invoice.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Cannot transition from "${invoice.status}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none'}`
      );
    }

    const updateData: Record<string, any> = {
      status: newStatus,
      updated_by: userId,
    };

    const [updated] = await this.db('sales_invoices')
      .where({ id, company_id: companyId })
      .update(updateData)
      .returning('*');

    return updated;
  }

  // ──────── RECORD PAYMENT (updates amount_paid / balance_due / status) ────────
  // Called by Payment Receipt service (Step 20)

  async recordPayment(
    invoiceId: string,
    companyId: string,
    paymentAmount: number,
    userId: string,
    trx?: Knex
  ) {
    const db = trx || this.db;

    const invoice = await db('sales_invoices')
      .where({ id: invoiceId, company_id: companyId, is_deleted: false })
      .first();

    if (!invoice) throw new Error('Invoice not found');

    const currentDue = parseFloat(invoice.balance_due);
    if (paymentAmount > currentDue) {
      throw new Error(
        `Payment amount ${paymentAmount} exceeds amount due ${currentDue}`
      );
    }

    const newAmountPaid = round2(parseFloat(invoice.amount_paid) + paymentAmount);
    const newAmountDue = round2(parseFloat(invoice.grand_total) - newAmountPaid);

    let newStatus = invoice.status;
    if (newAmountDue <= 0) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0 && !['paid'].includes(invoice.status)) {
      newStatus = 'partially_paid';
    }

    const [updated] = await db('sales_invoices')
      .where({ id: invoiceId })
      .update({
        amount_paid: newAmountPaid,
        balance_due: newAmountDue,
        status: newStatus,
        updated_by: userId,
      })
      .returning('*');

    return updated;
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteInvoice(id: string, companyId: string, userId: string) {
    const invoice = await this.getById(id, companyId);
    if (!invoice) throw new Error('Invoice not found');

    if (invoice.status !== 'draft') {
      throw new Error('Only draft invoices can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      await trx('sales_invoice_lines')
        .where({ invoice_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      const [deleted] = await trx('sales_invoices')
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

  // ──────── SET E-INVOICE IRN ────────

  async setEInvoiceIrn(id: string, companyId: string, irn: string, userId: string) {
    const invoice = await this.getById(id, companyId);
    if (!invoice) throw new Error('Invoice not found');

    const [updated] = await this.db('sales_invoices')
      .where({ id, company_id: companyId })
      .update({ irn, updated_by: userId })
      .returning('*');

    return updated;
  }

  // ──────── OVERDUE DETECTION ────────

  async markOverdueInvoices(companyId: string) {
    const today = new Date().toISOString().split('T')[0];

    const overdue = await this.db('sales_invoices')
      .where({ company_id: companyId, is_deleted: false })
      .whereIn('status', ['sent', 'partially_paid'])
      .where('due_date', '<', today)
      .where('balance_due', '>', 0)
      .update({ status: 'overdue' })
      .returning(['id', 'invoice_number', 'balance_due']);

    return { overdue_count: overdue.length, overdue };
  }

  // ──────── CUSTOMER OUTSTANDING SUMMARY ────────

  async getCustomerOutstanding(customerId: string, companyId: string) {
    const result = await this.db('sales_invoices')
      .where({ customer_id: customerId, company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['draft', 'cancelled'])
      .select(
        this.db.raw('COUNT(*) as total_invoices'),
        this.db.raw('COALESCE(SUM(grand_total), 0) as total_invoiced'),
        this.db.raw('COALESCE(SUM(amount_paid), 0) as total_paid'),
        this.db.raw('COALESCE(SUM(balance_due), 0) as total_outstanding')
      )
      .first();

    const overdueResult = await this.db('sales_invoices')
      .where({ customer_id: customerId, company_id: companyId, is_deleted: false, status: 'overdue' })
      .select(
        this.db.raw('COUNT(*) as overdue_count'),
        this.db.raw('COALESCE(SUM(balance_due), 0) as overdue_amount')
      )
      .first();

    return {
      ...result,
      overdue_count: parseInt(overdueResult?.overdue_count || '0'),
      overdue_amount: parseFloat(overdueResult?.overdue_amount || '0'),
    };
  }
}

export const salesInvoiceService = new SalesInvoiceService();