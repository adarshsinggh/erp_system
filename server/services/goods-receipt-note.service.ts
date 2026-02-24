// =============================================================
// File: server/services/goods-receipt-note.service.ts
// Module: Purchase Management
// Description: Goods Receipt Note (GRN) service with header+lines
//              CRUD, auto document numbering, status lifecycle,
//              PO received-quantity tracking on confirm.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { purchaseOrderService } from './purchase-order.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface GRNLineInput {
  line_number?: number;
  po_line_id?: string;
  item_id: string;
  ordered_quantity?: number;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity?: number;
  uom_id: string;
  unit_cost?: number;
  batch_number?: string;
  serial_numbers?: string[];
  expiry_date?: string | null;
  rejection_reason?: string;
  remarks?: string;
}

export interface CreateGRNInput {
  company_id: string;
  branch_id: string;
  grn_date: string;
  vendor_id: string;
  purchase_order_id?: string;
  warehouse_id: string;
  vendor_challan_no?: string;
  vendor_challan_date?: string;
  vehicle_number?: string;
  inspection_status?: string;
  remarks?: string;
  metadata?: Record<string, any>;
  lines: GRNLineInput[];
  created_by?: string;
}

export interface UpdateGRNInput {
  grn_date?: string;
  vendor_id?: string;
  purchase_order_id?: string;
  warehouse_id?: string;
  vendor_challan_no?: string;
  vendor_challan_date?: string;
  vehicle_number?: string;
  inspection_status?: string;
  remarks?: string;
  metadata?: Record<string, any>;
  lines?: GRNLineInput[];
  updated_by?: string;
}

export interface ListGRNsOptions extends ListOptions {
  vendor_id?: string;
  purchase_order_id?: string;
  warehouse_id?: string;
  inspection_status?: string;
  from_date?: string;
  to_date?: string;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class GoodsReceiptNoteService extends BaseService {
  constructor() {
    super('goods_receipt_notes');
  }

  // ──────── Private: build metadata from frontend-only fields ────────

  private buildMetadata(
    input: { vehicle_number?: string; inspection_status?: string; metadata?: Record<string, any> },
    lineInputs?: GRNLineInput[]
  ): Record<string, any> {
    const meta: Record<string, any> = { ...(input.metadata || {}) };
    if (input.vehicle_number !== undefined) meta.vehicle_number = input.vehicle_number;
    if (input.inspection_status !== undefined) meta.inspection_status = input.inspection_status;

    // Store frontend-only line fields (batch_number, expiry_date, rejection_reason) in metadata
    if (lineInputs && lineInputs.length > 0) {
      const lineExtras: Record<number, Record<string, any>> = {};
      lineInputs.forEach((line, idx) => {
        const extras: Record<string, any> = {};
        if (line.batch_number) extras.batch_number = line.batch_number;
        if (line.expiry_date) extras.expiry_date = line.expiry_date;
        if (line.rejection_reason) extras.rejection_reason = line.rejection_reason;
        if (Object.keys(extras).length > 0) {
          lineExtras[idx] = extras;
        }
      });
      if (Object.keys(lineExtras).length > 0) {
        meta.line_extras = lineExtras;
      }
    }

    return meta;
  }

  // ──────── CREATE ────────

  async createGRN(input: CreateGRNInput) {
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

      // Validate warehouse
      const warehouse = await trx('warehouses')
        .where({ id: input.warehouse_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!warehouse) throw new Error('Warehouse not found');

      // Validate PO if provided
      if (input.purchase_order_id) {
        const po = await trx('purchase_orders')
          .where({ id: input.purchase_order_id, company_id: input.company_id, is_deleted: false })
          .first();
        if (!po) throw new Error('Purchase order not found');
      }

      // Auto-generate GRN number
      const docNumberResult = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'grn') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const grnNumber = docNumberResult.rows[0].doc_number;

      // Build metadata (vehicle_number, inspection_status, line extras)
      const metadata = this.buildMetadata(headerInput, lines);

      // Insert header
      const [header] = await trx('goods_receipt_notes')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          grn_number: grnNumber,
          grn_date: input.grn_date,
          vendor_id: input.vendor_id,
          purchase_order_id: input.purchase_order_id || null,
          warehouse_id: input.warehouse_id,
          vendor_challan_number: input.vendor_challan_no || null,
          vendor_challan_date: input.vendor_challan_date || null,
          internal_notes: input.remarks || null,
          status: 'draft',
          metadata,
          created_by: input.created_by,
        })
        .returning('*');

      // Insert lines
      const insertedLines = await trx('grn_lines')
        .insert(
          lines.map((line, idx) => ({
            company_id: input.company_id,
            grn_id: header.id,
            line_number: line.line_number ?? idx + 1,
            item_id: line.item_id,
            po_line_id: line.po_line_id || null,
            quantity_ordered: line.ordered_quantity ?? 0,
            quantity_received: line.received_quantity,
            quantity_accepted: line.accepted_quantity,
            quantity_rejected: line.rejected_quantity ?? 0,
            uom_id: line.uom_id,
            unit_cost: line.unit_cost ?? null,
            batch_id: null,
            serial_numbers: line.serial_numbers || null,
            remarks: line.remarks || null,
            created_by: input.created_by,
          }))
        )
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getGRNWithDetails(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    // Lines with item + UOM enrichment
    const lines = await this.db('grn_lines as gl')
      .where({ 'gl.grn_id': id, 'gl.company_id': companyId, 'gl.is_deleted': false })
      .leftJoin('items as i', 'gl.item_id', 'i.id')
      .leftJoin('units_of_measurement as u', 'gl.uom_id', 'u.id')
      .select(
        'gl.*',
        'i.item_code',
        'i.name as item_name',
        'u.code as uom_code',
        'u.name as uom_name'
      )
      .orderBy('gl.line_number');

    // Vendor info
    const vendor = await this.db('vendors')
      .where({ id: header.vendor_id })
      .select('id', 'vendor_code', 'name', 'display_name', 'gstin')
      .first();

    // PO info
    let purchase_order = null;
    if (header.purchase_order_id) {
      purchase_order = await this.db('purchase_orders')
        .where({ id: header.purchase_order_id })
        .select('id', 'po_number', 'po_date', 'status')
        .first();
    }

    // Warehouse
    const warehouse = await this.db('warehouses')
      .where({ id: header.warehouse_id })
      .select('id', 'code', 'name')
      .first();

    // Branch
    const branch = await this.db('branches')
      .where({ id: header.branch_id })
      .select('id', 'code', 'name', 'state', 'gstin')
      .first();

    // Extract frontend-only fields from metadata for response
    const meta = header.metadata || {};
    return {
      ...header,
      vendor_challan_no: header.vendor_challan_number,
      vehicle_number: meta.vehicle_number || null,
      inspection_status: meta.inspection_status || null,
      lines: lines.map((line: any) => {
        const lineExtras = meta.line_extras?.[String(line.line_number - 1)] || {};
        return {
          ...line,
          ordered_quantity: line.quantity_ordered,
          received_quantity: line.quantity_received,
          accepted_quantity: line.quantity_accepted,
          rejected_quantity: line.quantity_rejected,
          batch_number: lineExtras.batch_number || null,
          expiry_date: lineExtras.expiry_date || null,
          rejection_reason: lineExtras.rejection_reason || null,
        };
      }),
      vendor,
      purchase_order,
      warehouse,
      branch,
    };
  }

  // ──────── LIST ────────

  async listGRNs(options: ListGRNsOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'grn_date',
      sortOrder = 'desc',
      vendor_id,
      purchase_order_id,
      warehouse_id,
      inspection_status,
      from_date,
      to_date,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('goods_receipt_notes')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (vendor_id) query = query.where('vendor_id', vendor_id);
    if (purchase_order_id) query = query.where('purchase_order_id', purchase_order_id);
    if (warehouse_id) query = query.where('warehouse_id', warehouse_id);
    if (from_date) query = query.where('grn_date', '>=', from_date);
    if (to_date) query = query.where('grn_date', '<=', to_date);

    // Filter by inspection_status stored in metadata
    if (inspection_status) {
      query = query.whereRaw(`metadata->>'inspection_status' = ?`, [inspection_status]);
    }

    if (search) {
      query = query.where(function () {
        this.orWhereILike('grn_number', `%${search}%`);
        this.orWhereILike('vendor_challan_number', `%${search}%`);
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
      const vendorIds = [...new Set(data.map((grn: any) => grn.vendor_id))];
      const vendors = await this.db('vendors')
        .whereIn('id', vendorIds)
        .select('id', 'vendor_code', 'name', 'display_name');

      const vendorMap = new Map(vendors.map((v: any) => [v.id, v]));
      for (const grn of data) {
        (grn as any).vendor = vendorMap.get(grn.vendor_id);
      }

      // Enrich with warehouse names
      const warehouseIds = [...new Set(data.map((grn: any) => grn.warehouse_id))];
      const warehouses = await this.db('warehouses')
        .whereIn('id', warehouseIds)
        .select('id', 'code', 'name');

      const warehouseMap = new Map(warehouses.map((w: any) => [w.id, w]));
      for (const grn of data) {
        (grn as any).warehouse = warehouseMap.get(grn.warehouse_id);
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updateGRN(id: string, companyId: string, input: UpdateGRNInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('goods_receipt_notes')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Goods receipt note not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot edit GRN in "${existing.status}" status. Only draft GRNs can be edited.`);
      }

      const { lines, ...headerUpdates } = input;

      // If lines are provided, replace them
      if (lines && lines.length > 0) {
        // Soft-delete old lines
        await trx('grn_lines')
          .where({ grn_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Insert new lines
        await trx('grn_lines')
          .insert(
            lines.map((line, idx) => ({
              company_id: companyId,
              grn_id: id,
              line_number: line.line_number ?? idx + 1,
              item_id: line.item_id,
              po_line_id: line.po_line_id || null,
              quantity_ordered: line.ordered_quantity ?? 0,
              quantity_received: line.received_quantity,
              quantity_accepted: line.accepted_quantity,
              quantity_rejected: line.rejected_quantity ?? 0,
              uom_id: line.uom_id,
              unit_cost: line.unit_cost ?? null,
              batch_id: null,
              serial_numbers: line.serial_numbers || null,
              remarks: line.remarks || null,
              created_by: input.updated_by,
            }))
          );
      }

      // Build header update payload
      const updatePayload: Record<string, any> = {};

      if (input.grn_date !== undefined) updatePayload.grn_date = input.grn_date;
      if (input.vendor_id !== undefined) updatePayload.vendor_id = input.vendor_id;
      if (input.purchase_order_id !== undefined) updatePayload.purchase_order_id = input.purchase_order_id;
      if (input.warehouse_id !== undefined) updatePayload.warehouse_id = input.warehouse_id;
      if (input.vendor_challan_no !== undefined) updatePayload.vendor_challan_number = input.vendor_challan_no;
      if (input.vendor_challan_date !== undefined) updatePayload.vendor_challan_date = input.vendor_challan_date;
      if (input.remarks !== undefined) updatePayload.internal_notes = input.remarks;

      // Rebuild metadata with vehicle_number and inspection_status
      const existingMeta = existing.metadata || {};
      const metadata = { ...existingMeta };
      if (input.vehicle_number !== undefined) metadata.vehicle_number = input.vehicle_number;
      if (input.inspection_status !== undefined) metadata.inspection_status = input.inspection_status;
      if (lines && lines.length > 0) {
        const lineExtras: Record<number, Record<string, any>> = {};
        lines.forEach((line, idx) => {
          const extras: Record<string, any> = {};
          if (line.batch_number) extras.batch_number = line.batch_number;
          if (line.expiry_date) extras.expiry_date = line.expiry_date;
          if (line.rejection_reason) extras.rejection_reason = line.rejection_reason;
          if (Object.keys(extras).length > 0) {
            lineExtras[idx] = extras;
          }
        });
        if (Object.keys(lineExtras).length > 0) {
          metadata.line_extras = lineExtras;
        } else {
          delete metadata.line_extras;
        }
      }
      updatePayload.metadata = metadata;
      updatePayload.updated_by = input.updated_by;

      await trx('goods_receipt_notes')
        .where({ id })
        .update(updatePayload);

      const updated = await trx('goods_receipt_notes').where({ id }).first();
      const updatedLines = await trx('grn_lines')
        .where({ grn_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteGRN(id: string, companyId: string, userId: string) {
    const grn = await this.getById(id, companyId);
    if (!grn) throw new Error('Goods receipt note not found');

    if (grn.status !== 'draft') {
      throw new Error('Only draft GRNs can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      // Soft-delete lines
      await trx('grn_lines')
        .where({ grn_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      // Soft-delete header
      const [deleted] = await trx('goods_receipt_notes')
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

  // ──────── CONFIRM (draft → confirmed) ────────

  async confirmGRN(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const grn = await trx('goods_receipt_notes')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!grn) throw new Error('Goods receipt note not found');

      if (grn.status !== 'draft') {
        throw new Error(`Cannot confirm. Current status: "${grn.status}". Only draft GRNs can be confirmed.`);
      }

      // Update GRN status to confirmed
      const [confirmed] = await trx('goods_receipt_notes')
        .where({ id, company_id: companyId })
        .update({
          status: 'confirmed',
          updated_by: userId,
        })
        .returning('*');

      // Update PO received quantities if linked to a PO
      if (grn.purchase_order_id) {
        const grnLines = await trx('grn_lines')
          .where({ grn_id: id, company_id: companyId, is_deleted: false });

        const lineReceipts = grnLines
          .filter((line: any) => line.po_line_id)
          .map((line: any) => ({
            line_id: line.po_line_id,
            received_qty: parseFloat(line.quantity_accepted),
          }));

        if (lineReceipts.length > 0) {
          await purchaseOrderService.updateReceivedQuantity(
            grn.purchase_order_id,
            companyId,
            lineReceipts,
            userId,
            trx
          );
        }
      }

      return confirmed;
    });
  }

  // ──────── CANCEL (draft → cancelled) ────────

  async cancelGRN(id: string, companyId: string, userId: string) {
    const grn = await this.getById(id, companyId);
    if (!grn) throw new Error('Goods receipt note not found');

    if (grn.status !== 'draft') {
      throw new Error(`Cannot cancel. Current status: "${grn.status}". Only draft GRNs can be cancelled.`);
    }

    const [cancelled] = await this.db('goods_receipt_notes')
      .where({ id, company_id: companyId })
      .update({
        status: 'cancelled',
        updated_by: userId,
      })
      .returning('*');

    return cancelled;
  }

  // ──────── GET PENDING PO LINES ────────

  async getPendingPOLines(poId: string, companyId: string) {
    const poLines = await this.db('purchase_order_lines as pol')
      .where({ 'pol.purchase_order_id': poId, 'pol.company_id': companyId, 'pol.is_deleted': false })
      .leftJoin('items as i', 'pol.item_id', 'i.id')
      .leftJoin('units_of_measurement as u', 'pol.uom_id', 'u.id')
      .select(
        'pol.id as po_line_id',
        'pol.item_id',
        'i.item_code',
        'i.name as item_name',
        'pol.quantity as ordered_quantity',
        'pol.received_quantity',
        'pol.uom_id',
        'u.code as uom_code',
        'pol.unit_price as unit_cost'
      )
      .orderBy('pol.line_number');

    return poLines
      .map((line: any) => {
        const ordered = parseFloat(line.ordered_quantity) || 0;
        const received = parseFloat(line.received_quantity) || 0;
        const pending = Math.max(0, ordered - received);
        return {
          ...line,
          ordered_quantity: ordered,
          received_quantity: received,
          pending_quantity: pending,
        };
      })
      .filter((line: any) => line.pending_quantity > 0);
  }
}

export const goodsReceiptNoteService = new GoodsReceiptNoteService();
