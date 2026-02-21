// =============================================================
// File: server/services/purchase-order.service.ts
// Module: Purchase Management
// Description: Purchase Order service with header+lines CRUD,
//              create standalone or from requisition, auto
//              document numbering, GST computation, status
//              lifecycle, received/billed tracking per line.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface PurchaseOrderLineInput {
  line_number: number;
  item_id: string;
  description?: string;
  quantity: number;
  uom_id: string;
  unit_price: number;
  discount_amount?: number;
  hsn_code?: string;
  warehouse_id?: string;
}

export interface CreatePurchaseOrderInput {
  company_id: string;
  branch_id: string;
  po_date: string;
  expected_delivery_date?: string;
  vendor_id: string;
  requisition_id?: string;
  vendor_quotation_ref?: string;
  currency_code?: string;
  exchange_rate?: number;
  payment_terms_days?: number;
  terms_and_conditions?: string;
  internal_notes?: string;
  delivery_warehouse_id?: string;
  metadata?: Record<string, any>;
  lines: PurchaseOrderLineInput[];
  created_by?: string;
}

export interface UpdatePurchaseOrderInput {
  expected_delivery_date?: string;
  vendor_id?: string;
  vendor_quotation_ref?: string;
  currency_code?: string;
  exchange_rate?: number;
  payment_terms_days?: number;
  terms_and_conditions?: string;
  internal_notes?: string;
  delivery_warehouse_id?: string;
  metadata?: Record<string, any>;
  lines?: PurchaseOrderLineInput[];
  updated_by?: string;
}

export interface ListPurchaseOrdersOptions extends ListOptions {
  vendor_id?: string;
  branch_id?: string;
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

class PurchaseOrderService extends BaseService {
  constructor() {
    super('purchase_orders');
  }

  // ──────── Private: GST computation for purchase lines ────────

  private async resolveGst(
    trx: Knex,
    companyId: string,
    branchId: string,
    vendorId: string,
    lines: PurchaseOrderLineInput[]
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

    // 2. Get vendor state (origin / place of supply)
    const vendor = await trx('vendors')
      .where({ id: vendorId, company_id: companyId, is_deleted: false })
      .select('state', 'gstin')
      .first();

    // Derive vendor state from GSTIN or address if available
    let vendorState = branchState; // default to intra-state
    if (vendor?.state) {
      vendorState = vendor.state.trim().toLowerCase();
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

    const computedLines: Record<string, any>[] = lines.map((line) => {
      const item = itemMap.get(line.item_id);
      if (!item) {
        throw new Error(`Item not found: ${line.item_id}`);
      }

      const qty = line.quantity;
      const price = line.unit_price;
      const lineSubtotal = round2(qty * price);
      subtotal += lineSubtotal;

      // Discount
      const discountAmt = round2(line.discount_amount || 0);
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
        line_number: line.line_number,
        item_id: line.item_id,
        description: line.description || item.name,
        quantity: qty,
        received_quantity: 0,
        billed_quantity: 0,
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

  async createPurchaseOrder(input: CreatePurchaseOrderInput) {
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

      // Auto-generate PO number
      const docNumberResult = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'purchase_order') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const poNumber = docNumberResult.rows[0].doc_number;

      // Compute GST
      const { computedLines, headerTotals } = await this.resolveGst(
        trx,
        input.company_id,
        input.branch_id,
        input.vendor_id,
        lines
      );

      // Determine payment terms: input > vendor default > 30
      const paymentTermsDays = input.payment_terms_days
        ?? vendor.payment_terms_days
        ?? 30;

      // Insert header
      const [header] = await trx('purchase_orders')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          po_number: poNumber,
          po_date: input.po_date,
          expected_delivery_date: input.expected_delivery_date || null,
          vendor_id: input.vendor_id,
          requisition_id: input.requisition_id || null,
          vendor_quotation_ref: input.vendor_quotation_ref || null,
          currency_code: input.currency_code || 'INR',
          exchange_rate: input.exchange_rate || 1.0,
          ...headerTotals,
          payment_terms_days: paymentTermsDays,
          terms_and_conditions: input.terms_and_conditions || null,
          internal_notes: input.internal_notes || null,
          delivery_warehouse_id: input.delivery_warehouse_id || null,
          status: 'draft',
          metadata: input.metadata || {},
          created_by: input.created_by,
        })
        .returning('*');

      // Insert lines
      const insertedLines = await trx('purchase_order_lines')
        .insert(
          computedLines.map((line) => ({
            company_id: input.company_id,
            purchase_order_id: header.id,
            created_by: input.created_by,
            ...line,
          }))
        )
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── CREATE FROM REQUISITION ────────

  async createFromRequisition(requisitionId: string, companyId: string, userId: string, overrides?: {
    branch_id?: string;
    vendor_id?: string;
    po_date?: string;
    expected_delivery_date?: string;
    vendor_quotation_ref?: string;
    payment_terms_days?: number;
    delivery_warehouse_id?: string;
    internal_notes?: string;
    line_overrides?: Record<number, { unit_price?: number; warehouse_id?: string }>;
  }) {
    // 1. Fetch full requisition with lines
    const requisition = await this.db('purchase_requisitions')
      .where({ id: requisitionId, company_id: companyId, is_deleted: false })
      .first();

    if (!requisition) throw new Error('Purchase requisition not found');

    if (requisition.status !== 'approved') {
      throw new Error(`Only approved requisitions can be converted. Current status: "${requisition.status}"`);
    }

    const reqLines = await this.db('purchase_requisition_lines')
      .where({ requisition_id: requisitionId, company_id: companyId, is_deleted: false })
      .orderBy('line_number');

    if (reqLines.length === 0) {
      throw new Error('Requisition has no lines');
    }

    // Vendor is required for PO
    const vendorId = overrides?.vendor_id;
    if (!vendorId) {
      // Try to use preferred_vendor_id from first line, or throw
      const firstVendor = reqLines.find((l: any) => l.preferred_vendor_id)?.preferred_vendor_id;
      if (!firstVendor) {
        throw new Error('vendor_id is required when creating a PO from requisition');
      }
      overrides = { ...overrides, vendor_id: firstVendor };
    }

    // 2. Build PO lines from requisition lines
    const lines: PurchaseOrderLineInput[] = reqLines.map((rl: any) => {
      const lineOverride = overrides?.line_overrides?.[rl.line_number];
      return {
        line_number: rl.line_number,
        item_id: rl.item_id,
        description: rl.description,
        quantity: parseFloat(rl.quantity),
        uom_id: rl.uom_id,
        unit_price: lineOverride?.unit_price ?? (rl.estimated_price ? parseFloat(rl.estimated_price) : 0),
        hsn_code: undefined,
        warehouse_id: lineOverride?.warehouse_id || undefined,
      };
    });

    // 3. Create the PO
    const purchaseOrder = await this.createPurchaseOrder({
      company_id: companyId,
      branch_id: overrides?.branch_id || requisition.branch_id,
      po_date: overrides?.po_date || new Date().toISOString().split('T')[0],
      expected_delivery_date: overrides?.expected_delivery_date || requisition.required_by_date || undefined,
      vendor_id: overrides!.vendor_id!,
      requisition_id: requisitionId,
      vendor_quotation_ref: overrides?.vendor_quotation_ref,
      payment_terms_days: overrides?.payment_terms_days,
      delivery_warehouse_id: overrides?.delivery_warehouse_id,
      internal_notes: overrides?.internal_notes || `Created from Requisition ${requisition.requisition_number}`,
      lines,
      created_by: userId,
    });

    // 4. Mark requisition as converted
    await this.db('purchase_requisitions')
      .where({ id: requisitionId, company_id: companyId })
      .update({
        status: 'converted',
        updated_by: userId,
      });

    return purchaseOrder;
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getPurchaseOrderWithDetails(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    // Lines with item + UOM + warehouse info
    const lines = await this.db('purchase_order_lines as pol')
      .where({ 'pol.purchase_order_id': id, 'pol.company_id': companyId, 'pol.is_deleted': false })
      .leftJoin('items as i', 'pol.item_id', 'i.id')
      .leftJoin('units_of_measurement as u', 'pol.uom_id', 'u.id')
      .leftJoin('warehouses as w', 'pol.warehouse_id', 'w.id')
      .select(
        'pol.*',
        'i.item_code',
        'i.name as item_name',
        'u.code as uom_code',
        'u.name as uom_name',
        'w.code as warehouse_code',
        'w.name as warehouse_name'
      )
      .orderBy('pol.line_number');

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

    // Source requisition (if any)
    let requisition = null;
    if (header.requisition_id) {
      requisition = await this.db('purchase_requisitions')
        .where({ id: header.requisition_id })
        .select('id', 'requisition_number', 'requisition_date', 'status', 'priority')
        .first();
    }

    // Delivery warehouse
    let deliveryWarehouse = null;
    if (header.delivery_warehouse_id) {
      deliveryWarehouse = await this.db('warehouses')
        .where({ id: header.delivery_warehouse_id })
        .select('id', 'code', 'name')
        .first();
    }

    return {
      ...header,
      lines,
      vendor,
      branch,
      source_requisition: requisition,
      delivery_warehouse: deliveryWarehouse,
    };
  }

  // ──────── LIST ────────

  async listPurchaseOrders(options: ListPurchaseOrdersOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'po_date',
      sortOrder = 'desc',
      vendor_id,
      branch_id,
      from_date,
      to_date,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('purchase_orders')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (vendor_id) query = query.where('vendor_id', vendor_id);
    if (branch_id) query = query.where('branch_id', branch_id);
    if (from_date) query = query.where('po_date', '>=', from_date);
    if (to_date) query = query.where('po_date', '<=', to_date);

    if (search) {
      query = query.where(function () {
        this.orWhereILike('po_number', `%${search}%`);
        this.orWhereILike('vendor_quotation_ref', `%${search}%`);
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
      const vendorIds = [...new Set(data.map((po: any) => po.vendor_id))];
      const vendors = await this.db('vendors')
        .whereIn('id', vendorIds)
        .select('id', 'vendor_code', 'name', 'display_name');

      const vendorMap = new Map(vendors.map((v: any) => [v.id, v]));
      for (const po of data) {
        (po as any).vendor = vendorMap.get(po.vendor_id);
      }

      // Enrich with branch names
      const branchIds = [...new Set(data.map((po: any) => po.branch_id))];
      const branches = await this.db('branches')
        .whereIn('id', branchIds)
        .select('id', 'code', 'name');

      const branchMap = new Map(branches.map((b: any) => [b.id, b]));
      for (const po of data) {
        (po as any).branch = branchMap.get(po.branch_id);
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updatePurchaseOrder(id: string, companyId: string, input: UpdatePurchaseOrderInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('purchase_orders')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Purchase order not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot edit purchase order in "${existing.status}" status. Only draft orders can be edited.`);
      }

      const { lines, ...headerUpdates } = input;

      // If lines are provided, recompute
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
        await trx('purchase_order_lines')
          .where({ purchase_order_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Insert new lines
        await trx('purchase_order_lines')
          .insert(
            computedLines.map((line) => ({
              company_id: companyId,
              purchase_order_id: id,
              created_by: input.updated_by,
              ...line,
            }))
          );

        Object.assign(headerUpdates, headerTotals);
      }

      // Clean fields that should not be updated
      delete (headerUpdates as any).company_id;
      delete (headerUpdates as any).branch_id;
      delete (headerUpdates as any).po_number;
      delete (headerUpdates as any).po_date;
      delete (headerUpdates as any).status;
      delete (headerUpdates as any).requisition_id;

      if (Object.keys(headerUpdates).length > 0) {
        await trx('purchase_orders')
          .where({ id })
          .update({ ...headerUpdates, updated_by: input.updated_by });
      }

      const updated = await trx('purchase_orders').where({ id }).first();
      const updatedLines = await trx('purchase_order_lines')
        .where({ purchase_order_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── APPROVE (draft → approved) ────────

  async approvePurchaseOrder(id: string, companyId: string, userId: string) {
    const po = await this.getById(id, companyId);
    if (!po) throw new Error('Purchase order not found');

    if (po.status !== 'draft') {
      throw new Error(`Cannot approve. Current status: "${po.status}". Only draft orders can be approved.`);
    }

    const [approved] = await this.db('purchase_orders')
      .where({ id, company_id: companyId })
      .update({
        status: 'approved',
        updated_by: userId,
      })
      .returning('*');

    return approved;
  }

  // ──────── SEND (approved → sent) ────────

  async sendPurchaseOrder(id: string, companyId: string, userId: string) {
    const po = await this.getById(id, companyId);
    if (!po) throw new Error('Purchase order not found');

    if (po.status !== 'approved') {
      throw new Error(`Cannot send. Current status: "${po.status}". Only approved orders can be sent.`);
    }

    const [sent] = await this.db('purchase_orders')
      .where({ id, company_id: companyId })
      .update({
        status: 'sent',
        updated_by: userId,
      })
      .returning('*');

    return sent;
  }

  // ──────── CANCEL ────────

  async cancelPurchaseOrder(id: string, companyId: string, userId: string) {
    const po = await this.getById(id, companyId);
    if (!po) throw new Error('Purchase order not found');

    const cancellableStatuses = ['draft', 'approved', 'sent'];
    if (!cancellableStatuses.includes(po.status)) {
      throw new Error(
        `Cannot cancel. Current status: "${po.status}". Only draft, approved, or sent orders can be cancelled.`
      );
    }

    const [cancelled] = await this.db('purchase_orders')
      .where({ id, company_id: companyId })
      .update({
        status: 'cancelled',
        updated_by: userId,
      })
      .returning('*');

    return cancelled;
  }

  // ──────── CLOSE ────────

  async closePurchaseOrder(id: string, companyId: string, userId: string) {
    const po = await this.getById(id, companyId);
    if (!po) throw new Error('Purchase order not found');

    const closableStatuses = ['sent', 'partially_received', 'received', 'billed'];
    if (!closableStatuses.includes(po.status)) {
      throw new Error(
        `Cannot close. Current status: "${po.status}". Only sent, partially_received, received, or billed orders can be closed.`
      );
    }

    const [closed] = await this.db('purchase_orders')
      .where({ id, company_id: companyId })
      .update({
        status: 'completed',
        updated_by: userId,
      })
      .returning('*');

    return closed;
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deletePurchaseOrder(id: string, companyId: string, userId: string) {
    const po = await this.getById(id, companyId);
    if (!po) throw new Error('Purchase order not found');

    if (po.status !== 'draft') {
      throw new Error('Only draft purchase orders can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      // Soft-delete lines
      await trx('purchase_order_lines')
        .where({ purchase_order_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      // Soft-delete header
      const [deleted] = await trx('purchase_orders')
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

  // ──────── RECEIVED QUANTITY TRACKING HELPER ────────
  // Called by GRN service

  async updateReceivedQuantity(
    purchaseOrderId: string,
    companyId: string,
    lineReceipts: { line_id: string; received_qty: number }[],
    userId: string,
    trx?: Knex
  ) {
    const db = trx || this.db;

    for (const receipt of lineReceipts) {
      const line = await db('purchase_order_lines')
        .where({ id: receipt.line_id, purchase_order_id: purchaseOrderId, is_deleted: false })
        .first();

      if (!line) throw new Error(`PO line not found: ${receipt.line_id}`);

      const newReceived = round2(parseFloat(line.received_quantity) + receipt.received_qty);
      if (newReceived > parseFloat(line.quantity)) {
        throw new Error(
          `Cannot receive ${receipt.received_qty} for line ${line.line_number}. ` +
          `Ordered: ${line.quantity}, already received: ${line.received_quantity}`
        );
      }

      await db('purchase_order_lines')
        .where({ id: receipt.line_id })
        .update({ received_quantity: newReceived, updated_by: userId });
    }

    // Check overall receipt status
    const allLines = await db('purchase_order_lines')
      .where({ purchase_order_id: purchaseOrderId, company_id: companyId, is_deleted: false });

    const fullyReceived = allLines.every(
      (l: any) => parseFloat(l.received_quantity) >= parseFloat(l.quantity)
    );
    const partiallyReceived = allLines.some(
      (l: any) => parseFloat(l.received_quantity) > 0
    );

    let newStatus: string | null = null;
    const po = await db('purchase_orders').where({ id: purchaseOrderId }).first();

    if (fullyReceived && ['sent', 'partially_received'].includes(po.status)) {
      newStatus = 'received';
    } else if (partiallyReceived && po.status === 'sent') {
      newStatus = 'partially_received';
    }

    if (newStatus) {
      await db('purchase_orders')
        .where({ id: purchaseOrderId })
        .update({ status: newStatus, updated_by: userId });
    }

    return { status: newStatus || po.status, fully_received: fullyReceived };
  }

  // ──────── BILLED QUANTITY TRACKING HELPER ────────
  // Called by Vendor Bill service

  async updateBilledQuantity(
    purchaseOrderId: string,
    companyId: string,
    lineBills: { line_id: string; billed_qty: number }[],
    userId: string,
    trx?: Knex
  ) {
    const db = trx || this.db;

    for (const bill of lineBills) {
      const line = await db('purchase_order_lines')
        .where({ id: bill.line_id, purchase_order_id: purchaseOrderId, is_deleted: false })
        .first();

      if (!line) throw new Error(`PO line not found: ${bill.line_id}`);

      const newBilled = round2(parseFloat(line.billed_quantity) + bill.billed_qty);
      if (newBilled > parseFloat(line.quantity)) {
        throw new Error(
          `Cannot bill ${bill.billed_qty} for line ${line.line_number}. ` +
          `Ordered: ${line.quantity}, already billed: ${line.billed_quantity}`
        );
      }

      await db('purchase_order_lines')
        .where({ id: bill.line_id })
        .update({ billed_quantity: newBilled, updated_by: userId });
    }
  }
}

export const purchaseOrderService = new PurchaseOrderService();
