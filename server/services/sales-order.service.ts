// =============================================================
// File: server/services/sales-order.service.ts
// Module: Sales Management — Phase 5, Step 16
// Description: Sales Order service with header+lines CRUD,
//              create standalone or from quotation, auto
//              document numbering, GST computation, status
//              lifecycle, stock reservation on confirm,
//              delivery/invoice tracking per line.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { salesQuotationService } from './sales-quotation.service';
import { workOrderService, CreateWorkOrderInput } from './work-order.service';
import { inventoryService } from './inventory.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface SalesOrderLineInput {
  line_number: number;
  product_id: string;
  description?: string;
  quantity: number;
  uom_id: string;
  unit_price: number;
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number;
  hsn_code?: string;
  warehouse_id?: string;
}

export interface CreateSalesOrderInput {
  company_id: string;
  branch_id: string;
  order_date: string;
  expected_delivery_date?: string;
  customer_id: string;
  contact_person_id?: string;
  billing_address_id?: string;
  shipping_address_id?: string;
  quotation_id?: string;
  customer_po_number?: string;
  currency_code?: string;
  exchange_rate?: number;
  payment_terms_days?: number;
  terms_and_conditions?: string;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines: SalesOrderLineInput[];
  created_by?: string;
}

export interface UpdateSalesOrderInput {
  expected_delivery_date?: string;
  customer_id?: string;
  contact_person_id?: string;
  billing_address_id?: string;
  shipping_address_id?: string;
  customer_po_number?: string;
  currency_code?: string;
  exchange_rate?: number;
  payment_terms_days?: number;
  terms_and_conditions?: string;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines?: SalesOrderLineInput[];
  updated_by?: string;
}

export interface ListSalesOrdersOptions extends ListOptions {
  customer_id?: string;
  branch_id?: string;
  from_date?: string;
  to_date?: string;
  quotation_id?: string;
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

class SalesOrderService extends BaseService {
  constructor() {
    super('sales_orders');
  }

  // ──────── Private: GST computation (shared with quotation logic) ────────

  private async resolveGst(
    trx: Knex,
    companyId: string,
    branchId: string,
    shippingAddressId: string | null | undefined,
    lines: SalesOrderLineInput[]
  ): Promise<{
    computedLines: Record<string, any>[];
    headerTotals: Record<string, number>;
  }> {
    // 1. Get branch state (origin)
    const branch = await trx('branches')
      .where({ id: branchId, company_id: companyId })
      .select('state')
      .first();

    const branchState = (branch?.state || '').trim().toLowerCase();

    // 2. Get supply state from shipping address
    let supplyState = branchState;
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

    // 3. Fetch products
    const productIds = [...new Set(lines.map((l) => l.product_id))];
    const products = await trx('products')
      .whereIn('id', productIds)
      .where({ is_deleted: false })
      .select('id', 'name', 'product_code', 'hsn_code', 'gst_rate', 'selling_price');

    const productMap = new Map(products.map((p: any) => [p.id, p]));

    // 4. Compute per-line
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
        delivered_quantity: 0,
        invoiced_quantity: 0,
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
        warehouse_id: line.warehouse_id || null,
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

  // ──────── CREATE (standalone) ────────

  async createSalesOrder(input: CreateSalesOrderInput) {
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

      // Auto-generate order number
      const docNumberResult = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'sales_order') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const orderNumber = docNumberResult.rows[0].doc_number;

      // Compute GST
      const { computedLines, headerTotals } = await this.resolveGst(
        trx,
        input.company_id,
        input.branch_id,
        input.shipping_address_id,
        lines
      );

      // Determine payment terms: input > customer default > 30
      const paymentTermsDays = input.payment_terms_days
        ?? customer.payment_terms_days
        ?? 30;

      // Insert header
      const [header] = await trx('sales_orders')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          order_number: orderNumber,
          order_date: input.order_date,
          expected_delivery_date: input.expected_delivery_date || null,
          customer_id: input.customer_id,
          contact_person_id: input.contact_person_id || null,
          billing_address_id: input.billing_address_id || null,
          shipping_address_id: input.shipping_address_id || null,
          quotation_id: input.quotation_id || null,
          customer_po_number: input.customer_po_number || null,
          currency_code: input.currency_code || 'INR',
          exchange_rate: input.exchange_rate || 1.0,
          ...headerTotals,
          payment_terms_days: paymentTermsDays,
          terms_and_conditions: input.terms_and_conditions || null,
          internal_notes: input.internal_notes || null,
          status: 'draft',
          metadata: input.metadata || {},
          created_by: input.created_by,
        })
        .returning('*');

      // Insert lines
      const insertedLines = await trx('sales_order_lines')
        .insert(
          computedLines.map((line) => ({
            company_id: input.company_id,
            sales_order_id: header.id,
            created_by: input.created_by,
            ...line,
          }))
        )
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── CREATE FROM QUOTATION ────────

  async createFromQuotation(quotationId: string, companyId: string, userId: string, overrides?: {
    branch_id?: string;
    order_date?: string;
    expected_delivery_date?: string;
    customer_po_number?: string;
    payment_terms_days?: number;
    internal_notes?: string;
    line_warehouse_ids?: Record<number, string>; // line_number → warehouse_id
  }) {
    // 1. Fetch full quotation
    const quotation = await salesQuotationService.getQuotationWithDetails(quotationId, companyId);
    if (!quotation) throw new Error('Quotation not found');

    if (quotation.status !== 'accepted') {
      throw new Error(`Only accepted quotations can be converted. Current status: "${quotation.status}"`);
    }

    // Check if already converted
    if (quotation.converted_to_so_id) {
      throw new Error(`Quotation already converted to Sales Order: ${quotation.converted_to_so_id}`);
    }

    // Check validity
    if (quotation.valid_until) {
      const today = new Date().toISOString().split('T')[0];
      if (quotation.valid_until < today) {
        throw new Error(`Quotation expired on ${quotation.valid_until}`);
      }
    }

    // 2. Build SO lines from quotation lines
    const lines: SalesOrderLineInput[] = quotation.lines.map((ql: any) => ({
      line_number: ql.line_number,
      product_id: ql.product_id,
      description: ql.description,
      quantity: parseFloat(ql.quantity),
      uom_id: ql.uom_id,
      unit_price: parseFloat(ql.unit_price),
      discount_type: ql.discount_type || undefined,
      discount_value: ql.discount_value ? parseFloat(ql.discount_value) : undefined,
      hsn_code: ql.hsn_code,
      warehouse_id: overrides?.line_warehouse_ids?.[ql.line_number] || undefined,
    }));

    // 3. Create the SO
    const salesOrder = await this.createSalesOrder({
      company_id: companyId,
      branch_id: overrides?.branch_id || quotation.branch_id,
      order_date: overrides?.order_date || new Date().toISOString().split('T')[0],
      expected_delivery_date: overrides?.expected_delivery_date,
      customer_id: quotation.customer_id,
      contact_person_id: quotation.contact_person_id || undefined,
      billing_address_id: quotation.billing_address_id || undefined,
      shipping_address_id: quotation.shipping_address_id || undefined,
      quotation_id: quotationId,
      customer_po_number: overrides?.customer_po_number,
      currency_code: quotation.currency_code,
      exchange_rate: parseFloat(quotation.exchange_rate) || 1.0,
      payment_terms_days: overrides?.payment_terms_days,
      terms_and_conditions: quotation.terms_and_conditions || undefined,
      internal_notes: overrides?.internal_notes || `Converted from Quotation ${quotation.quotation_number}`,
      lines,
      created_by: userId,
    });

    // 4. Mark quotation as converted
    await salesQuotationService.markAsConverted(quotationId, companyId, salesOrder.id, userId);

    return salesOrder;
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getSalesOrderWithDetails(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    // Lines with product + UOM + warehouse info
    const lines = await this.db('sales_order_lines as sol')
      .where({ 'sol.sales_order_id': id, 'sol.company_id': companyId, 'sol.is_deleted': false })
      .leftJoin('products as p', 'sol.product_id', 'p.id')
      .leftJoin('units_of_measurement as u', 'sol.uom_id', 'u.id')
      .leftJoin('warehouses as w', 'sol.warehouse_id', 'w.id')
      .select(
        'sol.*',
        'p.product_code',
        'p.name as product_name',
        'u.code as uom_code',
        'u.name as uom_name',
        'w.code as warehouse_code',
        'w.name as warehouse_name'
      )
      .orderBy('sol.line_number');

    // Customer info
    const customer = await this.db('customers')
      .where({ id: header.customer_id })
      .select('id', 'customer_code', 'name', 'display_name', 'gstin')
      .first();

    // Addresses
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

    // Branch
    const branch = await this.db('branches')
      .where({ id: header.branch_id })
      .select('id', 'code', 'name', 'state', 'gstin')
      .first();

    // Source quotation (if any)
    let quotation = null;
    if (header.quotation_id) {
      quotation = await this.db('sales_quotations')
        .where({ id: header.quotation_id })
        .select('id', 'quotation_number', 'quotation_date', 'status')
        .first();
    }

    // Stock reservations for this SO
    const reservations = await this.db('stock_reservations')
      .where({
        reference_type: 'sales_order',
        reference_id: id,
        company_id: companyId,
        is_deleted: false,
      })
      .select('id', 'product_id', 'warehouse_id', 'reserved_quantity', 'fulfilled_quantity', 'status');

    return {
      ...header,
      lines,
      customer,
      branch,
      billing_address: billingAddress,
      shipping_address: shippingAddress,
      contact_person: contactPerson,
      source_quotation: quotation,
      stock_reservations: reservations,
    };
  }

  // ──────── LIST ────────

  async listSalesOrders(options: ListSalesOrdersOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'order_date',
      sortOrder = 'desc',
      customer_id,
      branch_id,
      from_date,
      to_date,
      quotation_id,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('sales_orders')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (customer_id) query = query.where('customer_id', customer_id);
    if (branch_id) query = query.where('branch_id', branch_id);
    if (quotation_id) query = query.where('quotation_id', quotation_id);
    if (from_date) query = query.where('order_date', '>=', from_date);
    if (to_date) query = query.where('order_date', '<=', to_date);

    if (search) {
      query = query.where(function () {
        this.orWhereILike('order_number', `%${search}%`);
        this.orWhereILike('customer_po_number', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);

    // Enrich with customer names
    if (data.length > 0) {
      const customerIds = [...new Set(data.map((so: any) => so.customer_id))];
      const customers = await this.db('customers')
        .whereIn('id', customerIds)
        .select('id', 'customer_code', 'name', 'display_name');

      const customerMap = new Map(customers.map((c: any) => [c.id, c]));
      for (const so of data) {
        (so as any).customer = customerMap.get(so.customer_id);
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updateSalesOrder(id: string, companyId: string, input: UpdateSalesOrderInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('sales_orders')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Sales order not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot edit sales order in "${existing.status}" status. Only draft orders can be edited.`);
      }

      const { lines, ...headerUpdates } = input;

      // If lines are provided, recompute
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
        await trx('sales_order_lines')
          .where({ sales_order_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Insert new lines
        await trx('sales_order_lines')
          .insert(
            computedLines.map((line) => ({
              company_id: companyId,
              sales_order_id: id,
              created_by: input.updated_by,
              ...line,
            }))
          );

        Object.assign(headerUpdates, headerTotals);
      }

      // Only allow known DB columns to be updated (prevents unknown field crashes)
      const allowedOrderFields = new Set([
        'expected_delivery_date', 'customer_id', 'contact_person_id',
        'billing_address_id', 'shipping_address_id', 'customer_po_number',
        'currency_code', 'exchange_rate', 'payment_terms_days',
        'subtotal', 'discount_amount', 'taxable_amount',
        'cgst_amount', 'sgst_amount', 'igst_amount', 'cess_amount',
        'total_tax', 'grand_total', 'round_off',
        'terms_and_conditions', 'internal_notes', 'metadata',
      ]);
      const safeUpdates: Record<string, any> = {};
      for (const [key, value] of Object.entries(headerUpdates)) {
        if (allowedOrderFields.has(key)) safeUpdates[key] = value;
      }

      if (Object.keys(safeUpdates).length > 0) {
        await trx('sales_orders')
          .where({ id })
          .update({ ...safeUpdates, updated_by: input.updated_by });
      }

      const updated = await trx('sales_orders').where({ id }).first();
      const updatedLines = await trx('sales_order_lines')
        .where({ sales_order_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── CONFIRM (draft → confirmed + stock reservation + auto work orders) ────────

  async confirmSalesOrder(id: string, companyId: string, userId: string) {
    // Phase 1: Confirm SO + create stock reservations (transactional)
    const { confirmed, lines, defaultWarehouse, branchId, orderDate, expectedDeliveryDate } =
      await this.db.transaction(async (trx) => {
        const so = await trx('sales_orders')
          .where({ id, company_id: companyId, is_deleted: false })
          .first();

        if (!so) throw new Error('Sales order not found');
        if (so.status !== 'draft') {
          throw new Error(`Cannot confirm. Current status: "${so.status}". Only draft orders can be confirmed.`);
        }

        // Get lines
        const lines = await trx('sales_order_lines')
          .where({ sales_order_id: id, company_id: companyId, is_deleted: false });

        if (lines.length === 0) {
          throw new Error('Sales order has no lines');
        }

        // Get default warehouse for the branch (if line doesn't specify one)
        const defaultWarehouse = await trx('warehouses')
          .where({ branch_id: so.branch_id, company_id: companyId, is_default: true, is_deleted: false })
          .first();

        if (!defaultWarehouse) {
          throw new Error('No default warehouse found for this branch. Please configure warehouses first.');
        }

        // Create stock reservations for each line
        const reservations = lines.map((line: any) => ({
          company_id: companyId,
          branch_id: so.branch_id,
          warehouse_id: line.warehouse_id || defaultWarehouse.id,
          product_id: line.product_id,
          reserved_quantity: parseFloat(line.quantity),
          fulfilled_quantity: 0,
          uom_id: line.uom_id,
          reference_type: 'sales_order',
          reference_id: id,
          reference_line_id: line.id,
          status: 'active',
          created_by: userId,
        }));

        await trx('stock_reservations').insert(reservations);

        // Update SO status
        const [confirmed] = await trx('sales_orders')
          .where({ id })
          .update({
            status: 'confirmed',
            updated_by: userId,
          })
          .returning('*');

        return {
          confirmed,
          lines,
          defaultWarehouse,
          branchId: so.branch_id,
          orderDate: so.order_date,
          expectedDeliveryDate: so.expected_delivery_date,
        };
      });

    // Phase 2: Auto-create Work Orders for manufactured products with
    // insufficient stock (best-effort, post-commit — failures are logged
    // but do not roll back the SO confirmation)
    const autoWorkOrders = await this.autoCreateWorkOrders(
      id, companyId, userId, lines, defaultWarehouse,
      branchId, orderDate, expectedDeliveryDate
    );

    return {
      ...confirmed,
      auto_work_orders: autoWorkOrders,
    };
  }

  // ──────── AUTO WORK ORDER CREATION ────────

  /**
   * Auto-create draft Work Orders for manufactured products (those with an
   * active BOM) whose free stock is insufficient to fulfil the SO line qty.
   *
   * Best-effort: individual WO failures are logged but do not block the
   * SO confirmation or affect other lines.
   */
  private async autoCreateWorkOrders(
    salesOrderId: string,
    companyId: string,
    userId: string,
    lines: any[],
    defaultWarehouse: any,
    branchId: string,
    orderDate: string,
    expectedDeliveryDate: string | null
  ): Promise<{ created: any[]; skipped: any[]; errors: any[] }> {
    const created: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const line of lines) {
      const productId = line.product_id;
      const lineQty = parseFloat(line.quantity);
      const warehouseId = line.warehouse_id || defaultWarehouse.id;

      try {
        // 1. Check if product has an active BOM (manufactured product)
        const activeBom = await this.db('bom_headers')
          .where({
            product_id: productId,
            company_id: companyId,
            status: 'active',
            is_deleted: false,
          })
          .first();

        if (!activeBom) {
          // Not a manufactured product — skip silently
          skipped.push({
            product_id: productId,
            line_number: line.line_number,
            reason: 'no_active_bom',
          });
          continue;
        }

        // 2. Check current free stock in the warehouse
        const stockBalance = await inventoryService.getStockBalance(
          companyId, warehouseId, undefined, productId
        );

        const freeQty = parseFloat(stockBalance?.free_quantity ?? '0');

        if (freeQty >= lineQty) {
          // Sufficient stock — no manufacturing needed
          skipped.push({
            product_id: productId,
            line_number: line.line_number,
            reason: 'sufficient_stock',
            free_quantity: freeQty,
            required_quantity: lineQty,
          });
          continue;
        }

        // 3. Calculate deficit
        const deficit = round2(lineQty - Math.max(0, freeQty));

        // 4. Create draft Work Order for the deficit
        const woInput: CreateWorkOrderInput = {
          company_id: companyId,
          branch_id: branchId,
          work_order_date: orderDate || new Date().toISOString().split('T')[0],
          product_id: productId,
          bom_header_id: activeBom.id,
          planned_quantity: deficit,
          uom_id: line.uom_id,
          source_warehouse_id: warehouseId,
          target_warehouse_id: warehouseId,
          sales_order_id: salesOrderId,
          planned_start_date: orderDate || new Date().toISOString().split('T')[0],
          planned_end_date: expectedDeliveryDate || undefined,
          priority: 'normal',
          internal_notes:
            `Auto-created from Sales Order confirmation. ` +
            `SO line #${line.line_number}, deficit: ${deficit} ` +
            `(ordered: ${lineQty}, free stock: ${freeQty})`,
          metadata: {
            auto_created: true,
            source: 'sales_order_confirm',
            sales_order_id: salesOrderId,
            sales_order_line_id: line.id,
            ordered_quantity: lineQty,
            free_stock_at_confirm: freeQty,
            deficit_quantity: deficit,
          },
          created_by: userId,
        };

        const workOrder = await workOrderService.createWorkOrder(woInput);

        created.push({
          work_order_id: workOrder.id,
          work_order_number: workOrder.work_order_number,
          product_id: productId,
          line_number: line.line_number,
          planned_quantity: deficit,
        });
      } catch (err: any) {
        // Log error but do not throw — best-effort
        console.error(
          `[AutoWO] Failed to create work order for product ${productId}, ` +
          `SO line #${line.line_number}: ${err.message}`
        );
        errors.push({
          product_id: productId,
          line_number: line.line_number,
          error: err.message,
        });
      }
    }

    return { created, skipped, errors };
  }

  // ──────── STATUS TRANSITIONS ────────

  async updateStatus(id: string, companyId: string, newStatus: string, userId: string) {
    // Allowed transitions (confirm is handled separately)
    const validTransitions: Record<string, string[]> = {
      draft: ['cancelled'],
      confirmed: ['partially_delivered', 'cancelled'],
      partially_delivered: ['delivered', 'cancelled'],
      delivered: ['invoiced', 'closed'],
      invoiced: ['closed'],
      // closed and cancelled are terminal
    };

    const so = await this.getById(id, companyId);
    if (!so) throw new Error('Sales order not found');

    const allowed = validTransitions[so.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Cannot transition from "${so.status}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none'}`
      );
    }

    return await this.db.transaction(async (trx) => {
      // If cancelling, release stock reservations
      if (newStatus === 'cancelled') {
        await trx('stock_reservations')
          .where({
            reference_type: 'sales_order',
            reference_id: id,
            company_id: companyId,
            status: 'active',
          })
          .update({
            status: 'released',
            updated_by: userId,
          });
      }

      const [updated] = await trx('sales_orders')
        .where({ id, company_id: companyId })
        .update({ status: newStatus, updated_by: userId })
        .returning('*');

      return updated;
    });
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteSalesOrder(id: string, companyId: string, userId: string) {
    const so = await this.getById(id, companyId);
    if (!so) throw new Error('Sales order not found');

    if (so.status !== 'draft') {
      throw new Error('Only draft sales orders can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      // Soft-delete lines
      await trx('sales_order_lines')
        .where({ sales_order_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      // Soft-delete header
      const [deleted] = await trx('sales_orders')
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

  // ──────── DELIVERY TRACKING HELPER ────────
  // Called by Delivery Challan service (Step 17)

  async updateDeliveredQuantity(
    salesOrderId: string,
    companyId: string,
    lineDeliveries: { line_id: string; delivered_qty: number }[],
    userId: string,
    trx?: Knex
  ) {
    const db = trx || this.db;

    for (const delivery of lineDeliveries) {
      const line = await db('sales_order_lines')
        .where({ id: delivery.line_id, sales_order_id: salesOrderId, is_deleted: false })
        .first();

      if (!line) throw new Error(`SO line not found: ${delivery.line_id}`);

      const newDelivered = round2(parseFloat(line.delivered_quantity) + delivery.delivered_qty);
      if (newDelivered > parseFloat(line.quantity)) {
        throw new Error(
          `Cannot deliver ${delivery.delivered_qty} for line ${line.line_number}. ` +
          `Ordered: ${line.quantity}, already delivered: ${line.delivered_quantity}`
        );
      }

      await db('sales_order_lines')
        .where({ id: delivery.line_id })
        .update({ delivered_quantity: newDelivered, updated_by: userId });
    }

    // Check overall delivery status
    const allLines = await db('sales_order_lines')
      .where({ sales_order_id: salesOrderId, company_id: companyId, is_deleted: false });

    const fullyDelivered = allLines.every(
      (l: any) => parseFloat(l.delivered_quantity) >= parseFloat(l.quantity)
    );
    const partiallyDelivered = allLines.some(
      (l: any) => parseFloat(l.delivered_quantity) > 0
    );

    let newStatus: string | null = null;
    const so = await db('sales_orders').where({ id: salesOrderId }).first();

    if (fullyDelivered && so.status === 'confirmed') {
      newStatus = 'delivered';
    } else if (fullyDelivered && so.status === 'partially_delivered') {
      newStatus = 'delivered';
    } else if (partiallyDelivered && so.status === 'confirmed') {
      newStatus = 'partially_delivered';
    }

    if (newStatus) {
      await db('sales_orders')
        .where({ id: salesOrderId })
        .update({ status: newStatus, updated_by: userId });
    }

    return { status: newStatus || so.status, fully_delivered: fullyDelivered };
  }

  // ──────── INVOICE TRACKING HELPER ────────
  // Called by Sales Invoice service (Step 18)

  async updateInvoicedQuantity(
    salesOrderId: string,
    companyId: string,
    lineInvoices: { line_id: string; invoiced_qty: number }[],
    userId: string,
    trx?: Knex
  ) {
    const db = trx || this.db;

    for (const inv of lineInvoices) {
      const line = await db('sales_order_lines')
        .where({ id: inv.line_id, sales_order_id: salesOrderId, is_deleted: false })
        .first();

      if (!line) throw new Error(`SO line not found: ${inv.line_id}`);

      const newInvoiced = round2(parseFloat(line.invoiced_quantity) + inv.invoiced_qty);
      if (newInvoiced > parseFloat(line.quantity)) {
        throw new Error(
          `Cannot invoice ${inv.invoiced_qty} for line ${line.line_number}. ` +
          `Ordered: ${line.quantity}, already invoiced: ${line.invoiced_quantity}`
        );
      }

      await db('sales_order_lines')
        .where({ id: inv.line_id })
        .update({ invoiced_quantity: newInvoiced, updated_by: userId });
    }
  }
}

export const salesOrderService = new SalesOrderService();