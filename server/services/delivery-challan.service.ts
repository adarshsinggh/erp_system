// =============================================================
// File: server/services/delivery-challan.service.ts
// Module: Sales Management — Phase 5, Step 17
// Description: Delivery Challan service for goods dispatch.
//              Creates challans linked to confirmed Sales Orders,
//              supports partial delivery, updates SO line
//              delivered_quantity, fulfills stock reservations,
//              tracks transporter/vehicle/LR/e-way bill details.
//
// Note: Actual stock_ledger entries will be created when the
//       Stock Ledger Engine (Phase 7, Step 27) is built.
//       For now, stock_summary is updated directly and
//       stock_reservations are fulfilled.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { salesOrderService } from './sales-order.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface ChallanLineInput {
  line_number: number;
  product_id: string;
  quantity: number;
  uom_id: string;
  sales_order_line_id?: string;
  batch_id?: string;
  serial_numbers?: string[];
  remarks?: string;
}

export interface CreateChallanInput {
  company_id: string;
  branch_id: string;
  challan_date: string;
  customer_id: string;
  sales_order_id?: string;
  shipping_address_id?: string;
  warehouse_id: string;
  transporter_name?: string;
  vehicle_number?: string;
  lr_number?: string;
  e_way_bill_number?: string;
  metadata?: Record<string, any>;
  lines: ChallanLineInput[];
  created_by?: string;
}

export interface UpdateChallanInput {
  shipping_address_id?: string;
  transporter_name?: string;
  vehicle_number?: string;
  lr_number?: string;
  e_way_bill_number?: string;
  metadata?: Record<string, any>;
  lines?: ChallanLineInput[];
  updated_by?: string;
}

export interface ListChallansOptions extends ListOptions {
  customer_id?: string;
  branch_id?: string;
  sales_order_id?: string;
  warehouse_id?: string;
  from_date?: string;
  to_date?: string;
}

// ────────────────────────────────────────────────────────────
// Helper
// ────────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class DeliveryChallanService extends BaseService {
  constructor() {
    super('delivery_challans');
  }

  // ──────── CREATE ────────

  async createChallan(input: CreateChallanInput) {
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

      // Validate warehouse
      const warehouse = await trx('warehouses')
        .where({ id: input.warehouse_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!warehouse) throw new Error('Warehouse not found');

      // Validate branch
      const branch = await trx('branches')
        .where({ id: input.branch_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!branch) throw new Error('Branch not found');

      // If linked to SO, validate it's confirmed/partially_delivered
      let salesOrder: any = null;
      if (input.sales_order_id) {
        salesOrder = await trx('sales_orders')
          .where({ id: input.sales_order_id, company_id: input.company_id, is_deleted: false })
          .first();

        if (!salesOrder) throw new Error('Sales order not found');
        if (!['confirmed', 'partially_delivered'].includes(salesOrder.status)) {
          throw new Error(
            `Sales order must be confirmed or partially delivered. Current status: "${salesOrder.status}"`
          );
        }
      }

      // Validate lines against SO lines (if SO linked)
      if (salesOrder) {
        const soLines = await trx('sales_order_lines')
          .where({ sales_order_id: salesOrder.id, company_id: input.company_id, is_deleted: false });

        const soLineMap = new Map(soLines.map((l: any) => [l.id, l]));

        for (const line of lines) {
          if (line.sales_order_line_id) {
            const soLine = soLineMap.get(line.sales_order_line_id);
            if (!soLine) {
              throw new Error(`SO line not found: ${line.sales_order_line_id}`);
            }
            if (soLine.product_id !== line.product_id) {
              throw new Error(
                `Line ${line.line_number}: product mismatch with SO line. ` +
                `Expected product ${soLine.product_id}, got ${line.product_id}`
              );
            }

            // Check remaining deliverable quantity
            const remaining = round3(
              parseFloat(soLine.quantity) - parseFloat(soLine.delivered_quantity)
            );
            if (line.quantity > remaining) {
              throw new Error(
                `Line ${line.line_number}: quantity ${line.quantity} exceeds remaining ` +
                `deliverable ${remaining} (ordered: ${soLine.quantity}, ` +
                `already delivered: ${soLine.delivered_quantity})`
              );
            }
          }
        }
      }

      // Validate products exist
      const productIds = [...new Set(lines.map((l) => l.product_id))];
      const products = await trx('products')
        .whereIn('id', productIds)
        .where({ is_deleted: false })
        .select('id', 'name', 'product_code');

      if (products.length !== productIds.length) {
        const found = new Set(products.map((p: any) => p.id));
        const missing = productIds.filter((id) => !found.has(id));
        throw new Error(`Products not found: ${missing.join(', ')}`);
      }

      // Auto-generate challan number
      // Note: delivery challans don't have a document_sequence type yet,
      // so we use a manual approach with branch prefix + counter.
      // TODO: Add 'delivery_challan' to document_sequences in a future migration.
      const lastChallan = await trx('delivery_challans')
        .where({ company_id: input.company_id, is_deleted: false })
        .orderBy('created_at', 'desc')
        .first();

      let challanNumber: string;
      if (lastChallan) {
        // Extract numeric portion and increment
        const match = lastChallan.challan_number.match(/(\d+)$/);
        const nextNum = match ? parseInt(match[1]) + 1 : 1;
        challanNumber = `DC-${String(nextNum).padStart(5, '0')}`;
      } else {
        challanNumber = 'DC-00001';
      }

      // Insert header
      const [header] = await trx('delivery_challans')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          challan_number: challanNumber,
          challan_date: input.challan_date,
          customer_id: input.customer_id,
          sales_order_id: input.sales_order_id || null,
          shipping_address_id: input.shipping_address_id || null,
          warehouse_id: input.warehouse_id,
          transporter_name: input.transporter_name || null,
          vehicle_number: input.vehicle_number || null,
          lr_number: input.lr_number || null,
          e_way_bill_number: input.e_way_bill_number || null,
          status: 'draft',
          metadata: input.metadata || {},
          created_by: input.created_by,
        })
        .returning('*');

      // Insert lines
      const insertedLines = await trx('delivery_challan_lines')
        .insert(
          lines.map((line) => ({
            company_id: input.company_id,
            challan_id: header.id,
            line_number: line.line_number,
            product_id: line.product_id,
            quantity: line.quantity,
            uom_id: line.uom_id,
            sales_order_line_id: line.sales_order_line_id || null,
            batch_id: line.batch_id || null,
            serial_numbers: line.serial_numbers || null,
            remarks: line.remarks || null,
            created_by: input.created_by,
          }))
        )
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── DISPATCH (draft → dispatched) ────────
  // This is the key action: deducts stock, updates SO, fulfills reservations

  async dispatchChallan(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const challan = await trx('delivery_challans')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!challan) throw new Error('Delivery challan not found');
      if (challan.status !== 'draft') {
        throw new Error(`Cannot dispatch. Current status: "${challan.status}". Only draft challans can be dispatched.`);
      }

      const lines = await trx('delivery_challan_lines')
        .where({ challan_id: id, company_id: companyId, is_deleted: false });

      if (lines.length === 0) {
        throw new Error('Challan has no lines');
      }

      // For each line: update stock_summary and fulfill reservations
      for (const line of lines) {
        // 1. Update stock_summary — deduct available, update reserved
        const stockSummary = await trx('stock_summary')
          .where({
            company_id: companyId,
            warehouse_id: challan.warehouse_id,
            product_id: line.product_id,
          })
          .first();

        if (stockSummary) {
          const currentAvailable = parseFloat(stockSummary.available_quantity) || 0;
          const dispatchQty = parseFloat(line.quantity);

          if (currentAvailable < dispatchQty) {
            // Get product name for better error message
            const product = await trx('products').where({ id: line.product_id }).first();
            throw new Error(
              `Insufficient stock for ${product?.name || line.product_id}. ` +
              `Available: ${currentAvailable}, Required: ${dispatchQty}`
            );
          }

          const newAvailable = round3(currentAvailable - dispatchQty);
          const currentReserved = parseFloat(stockSummary.reserved_quantity) || 0;
          const newReserved = Math.max(0, round3(currentReserved - dispatchQty));
          const newFree = round3(newAvailable - newReserved);

          await trx('stock_summary')
            .where({ id: stockSummary.id })
            .update({
              available_quantity: newAvailable,
              reserved_quantity: newReserved,
              free_quantity: newFree,
              last_sale_date: challan.challan_date,
              last_movement_date: challan.challan_date,
              updated_by: userId,
            });
        }
        // If no stock_summary exists, the stock engine (Step 27) will handle
        // initial creation. For now, we allow dispatch without existing summary
        // to support pre-stock-engine testing.

        // 2. Fulfill stock reservations (if SO linked)
        if (line.sales_order_line_id && challan.sales_order_id) {
          const reservation = await trx('stock_reservations')
            .where({
              reference_type: 'sales_order',
              reference_id: challan.sales_order_id,
              reference_line_id: line.sales_order_line_id,
              company_id: companyId,
              status: 'active',
            })
            .first();

          if (reservation) {
            const newFulfilled = round3(
              parseFloat(reservation.fulfilled_quantity) + parseFloat(line.quantity)
            );
            const fullyFulfilled = newFulfilled >= parseFloat(reservation.reserved_quantity);

            await trx('stock_reservations')
              .where({ id: reservation.id })
              .update({
                fulfilled_quantity: newFulfilled,
                status: fullyFulfilled ? 'fulfilled' : 'active',
                updated_by: userId,
              });
          }
        }
      }

      // 3. Update SO delivered quantities (if SO linked)
      if (challan.sales_order_id) {
        const soLineDeliveries = lines
          .filter((l: any) => l.sales_order_line_id)
          .map((l: any) => ({
            line_id: l.sales_order_line_id,
            delivered_qty: parseFloat(l.quantity),
          }));

        if (soLineDeliveries.length > 0) {
          await salesOrderService.updateDeliveredQuantity(
            challan.sales_order_id,
            companyId,
            soLineDeliveries,
            userId,
            trx
          );
        }
      }

      // 4. Update challan status
      const [dispatched] = await trx('delivery_challans')
        .where({ id })
        .update({
          status: 'dispatched',
          updated_by: userId,
        })
        .returning('*');

      return dispatched;
    });
  }

  // ──────── MARK DELIVERED (dispatched → delivered) ────────

  async markDelivered(id: string, companyId: string, userId: string) {
    const challan = await this.getById(id, companyId);
    if (!challan) throw new Error('Delivery challan not found');

    if (challan.status !== 'dispatched') {
      throw new Error(`Cannot mark as delivered. Current status: "${challan.status}"`);
    }

    const [updated] = await this.db('delivery_challans')
      .where({ id, company_id: companyId })
      .update({ status: 'delivered', updated_by: userId })
      .returning('*');

    return updated;
  }

  // ──────── CANCEL (draft only — dispatched cannot be cancelled easily) ────────

  async cancelChallan(id: string, companyId: string, userId: string) {
    const challan = await this.getById(id, companyId);
    if (!challan) throw new Error('Delivery challan not found');

    if (challan.status !== 'draft') {
      throw new Error(
        `Only draft challans can be cancelled. Current status: "${challan.status}". ` +
        `For dispatched challans, create a sales return instead.`
      );
    }

    const [cancelled] = await this.db('delivery_challans')
      .where({ id, company_id: companyId })
      .update({ status: 'cancelled', updated_by: userId })
      .returning('*');

    return cancelled;
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getChallanWithDetails(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    // Lines with product + UOM info
    const lines = await this.db('delivery_challan_lines as dcl')
      .where({ 'dcl.challan_id': id, 'dcl.company_id': companyId, 'dcl.is_deleted': false })
      .leftJoin('products as p', 'dcl.product_id', 'p.id')
      .leftJoin('units_of_measurement as u', 'dcl.uom_id', 'u.id')
      .select(
        'dcl.*',
        'p.product_code',
        'p.name as product_name',
        'u.code as uom_code',
        'u.name as uom_name'
      )
      .orderBy('dcl.line_number');

    // Customer
    const customer = await this.db('customers')
      .where({ id: header.customer_id })
      .select('id', 'customer_code', 'name', 'display_name', 'gstin')
      .first();

    // Warehouse
    const warehouse = await this.db('warehouses')
      .where({ id: header.warehouse_id })
      .select('id', 'code', 'name', 'warehouse_type')
      .first();

    // Branch
    const branch = await this.db('branches')
      .where({ id: header.branch_id })
      .select('id', 'code', 'name', 'state', 'gstin')
      .first();

    // Shipping address
    const shippingAddress = header.shipping_address_id
      ? await this.db('addresses').where({ id: header.shipping_address_id }).first()
      : null;

    // Sales order (if linked)
    let salesOrder = null;
    if (header.sales_order_id) {
      salesOrder = await this.db('sales_orders')
        .where({ id: header.sales_order_id })
        .select('id', 'order_number', 'order_date', 'status', 'customer_po_number')
        .first();
    }

    return {
      ...header,
      lines,
      customer,
      warehouse,
      branch,
      shipping_address: shippingAddress,
      sales_order: salesOrder,
    };
  }

  // ──────── LIST ────────

  async listChallans(options: ListChallansOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'challan_date',
      sortOrder = 'desc',
      customer_id,
      branch_id,
      sales_order_id,
      warehouse_id,
      from_date,
      to_date,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('delivery_challans')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (customer_id) query = query.where('customer_id', customer_id);
    if (branch_id) query = query.where('branch_id', branch_id);
    if (sales_order_id) query = query.where('sales_order_id', sales_order_id);
    if (warehouse_id) query = query.where('warehouse_id', warehouse_id);
    if (from_date) query = query.where('challan_date', '>=', from_date);
    if (to_date) query = query.where('challan_date', '<=', to_date);

    if (search) {
      query = query.where(function () {
        this.orWhereILike('challan_number', `%${search}%`);
        this.orWhereILike('transporter_name', `%${search}%`);
        this.orWhereILike('vehicle_number', `%${search}%`);
        this.orWhereILike('lr_number', `%${search}%`);
        this.orWhereILike('e_way_bill_number', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);

    // Enrich with customer + SO names
    if (data.length > 0) {
      const customerIds = [...new Set(data.map((dc: any) => dc.customer_id))];
      const customers = await this.db('customers')
        .whereIn('id', customerIds)
        .select('id', 'customer_code', 'name', 'display_name');
      const customerMap = new Map(customers.map((c: any) => [c.id, c]));

      const soIds = [...new Set(data.filter((dc: any) => dc.sales_order_id).map((dc: any) => dc.sales_order_id))];
      let soMap = new Map();
      if (soIds.length > 0) {
        const orders = await this.db('sales_orders')
          .whereIn('id', soIds)
          .select('id', 'order_number');
        soMap = new Map(orders.map((o: any) => [o.id, o]));
      }

      for (const dc of data) {
        (dc as any).customer = customerMap.get(dc.customer_id);
        (dc as any).sales_order = dc.sales_order_id ? soMap.get(dc.sales_order_id) : null;
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updateChallan(id: string, companyId: string, input: UpdateChallanInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('delivery_challans')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Delivery challan not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot edit challan in "${existing.status}" status. Only draft challans can be edited.`);
      }

      const { lines, ...headerUpdates } = input;

      // If lines provided, replace
      if (lines && lines.length > 0) {
        // Soft-delete old lines
        await trx('delivery_challan_lines')
          .where({ challan_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Insert new lines
        await trx('delivery_challan_lines')
          .insert(
            lines.map((line) => ({
              company_id: companyId,
              challan_id: id,
              line_number: line.line_number,
              product_id: line.product_id,
              quantity: line.quantity,
              uom_id: line.uom_id,
              sales_order_line_id: line.sales_order_line_id || null,
              batch_id: line.batch_id || null,
              serial_numbers: line.serial_numbers || null,
              remarks: line.remarks || null,
              created_by: input.updated_by,
            }))
          );
      }

      // Update header
      delete (headerUpdates as any).company_id;
      delete (headerUpdates as any).branch_id;
      delete (headerUpdates as any).challan_number;
      delete (headerUpdates as any).challan_date;
      delete (headerUpdates as any).status;
      delete (headerUpdates as any).customer_id;
      delete (headerUpdates as any).sales_order_id;
      delete (headerUpdates as any).warehouse_id;

      if (Object.keys(headerUpdates).length > 0) {
        await trx('delivery_challans')
          .where({ id })
          .update({ ...headerUpdates, updated_by: input.updated_by });
      }

      const updated = await trx('delivery_challans').where({ id }).first();
      const updatedLines = await trx('delivery_challan_lines')
        .where({ challan_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteChallan(id: string, companyId: string, userId: string) {
    const challan = await this.getById(id, companyId);
    if (!challan) throw new Error('Delivery challan not found');

    if (challan.status !== 'draft') {
      throw new Error('Only draft challans can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      await trx('delivery_challan_lines')
        .where({ challan_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      const [deleted] = await trx('delivery_challans')
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

  // ──────── PENDING DELIVERIES FOR A SALES ORDER ────────
  // Shows remaining deliverable qty per SO line

  async getPendingDeliveries(salesOrderId: string, companyId: string) {
    const soLines = await this.db('sales_order_lines as sol')
      .where({ 'sol.sales_order_id': salesOrderId, 'sol.company_id': companyId, 'sol.is_deleted': false })
      .leftJoin('products as p', 'sol.product_id', 'p.id')
      .leftJoin('units_of_measurement as u', 'sol.uom_id', 'u.id')
      .select(
        'sol.id',
        'sol.line_number',
        'sol.product_id',
        'p.product_code',
        'p.name as product_name',
        'sol.quantity',
        'sol.delivered_quantity',
        'sol.uom_id',
        'u.code as uom_code'
      )
      .orderBy('sol.line_number');

    return soLines.map((line: any) => ({
      ...line,
      pending_quantity: round3(
        parseFloat(line.quantity) - parseFloat(line.delivered_quantity)
      ),
      fully_delivered: parseFloat(line.delivered_quantity) >= parseFloat(line.quantity),
    }));
  }
}

export const deliveryChallanService = new DeliveryChallanService();