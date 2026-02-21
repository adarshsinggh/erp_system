// =============================================================
// File: server/services/purchase-requisition.service.ts
// Module: Purchase Management
// Description: Purchase Requisition service with header+lines
//              CRUD, auto document numbering, approval workflow,
//              status lifecycle (draft -> submitted -> approved
//              -> converted), and rejection handling.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface PurchaseRequisitionLineInput {
  item_id: string;
  description?: string;
  quantity: number;
  uom_id: string;
  estimated_price?: number;
  preferred_vendor_id?: string;
  notes?: string;
}

export interface CreatePurchaseRequisitionInput {
  company_id: string;
  branch_id: string;
  requisition_date: string;
  required_by_date?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requested_by?: string;
  department?: string;
  purpose?: string;
  source?: string;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines: PurchaseRequisitionLineInput[];
  created_by?: string;
}

export interface UpdatePurchaseRequisitionInput {
  requisition_date?: string;
  required_by_date?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  requested_by?: string;
  department?: string;
  purpose?: string;
  source?: string;
  internal_notes?: string;
  metadata?: Record<string, any>;
  lines?: PurchaseRequisitionLineInput[];
  updated_by?: string;
}

export interface ListPurchaseRequisitionsOptions extends ListOptions {
  priority?: string;
  source?: string;
  branch_id?: string;
  from_date?: string;
  to_date?: string;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class PurchaseRequisitionService extends BaseService {
  constructor() {
    super('purchase_requisitions');
  }

  // ──────── CREATE ────────

  async createRequisition(input: CreatePurchaseRequisitionInput) {
    const { lines, source, purpose, ...headerInput } = input;

    if (!lines || lines.length === 0) {
      throw new Error('At least one line item is required');
    }

    return await this.db.transaction(async (trx) => {
      // Validate branch
      const branch = await trx('branches')
        .where({ id: input.branch_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!branch) throw new Error('Branch not found');

      // Auto-generate requisition number
      const docNumberResult = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'purchase_requisition') as doc_number`,
        [input.company_id, input.branch_id]
      );
      const reqNumber = docNumberResult.rows[0].doc_number;

      // Build metadata with source
      const metadata = { ...(input.metadata || {}), ...(source ? { source } : {}) };

      // Insert header
      const [header] = await trx('purchase_requisitions')
        .insert({
          company_id: input.company_id,
          branch_id: input.branch_id,
          requisition_number: reqNumber,
          requisition_date: input.requisition_date,
          required_by_date: input.required_by_date || null,
          priority: input.priority || 'normal',
          requested_by: input.requested_by || input.created_by || null,
          department: input.department || null,
          justification: purpose || null,
          internal_notes: input.internal_notes || null,
          status: 'draft',
          metadata,
          created_by: input.created_by,
        })
        .returning('*');

      // Insert lines
      const insertedLines = await trx('purchase_requisition_lines')
        .insert(
          lines.map((line, index) => ({
            company_id: input.company_id,
            requisition_id: header.id,
            line_number: index + 1,
            item_id: line.item_id,
            description: line.description || null,
            quantity: line.quantity,
            uom_id: line.uom_id,
            estimated_price: line.estimated_price || null,
            preferred_vendor_id: line.preferred_vendor_id || null,
            remarks: line.notes || null,
            created_by: input.created_by,
          }))
        )
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── GET BY ID (with enrichment) ────────

  async getRequisitionWithDetails(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    // Lines with item + UOM + preferred vendor info
    const lines = await this.db('purchase_requisition_lines as prl')
      .where({ 'prl.requisition_id': id, 'prl.company_id': companyId, 'prl.is_deleted': false })
      .leftJoin('items as i', 'prl.item_id', 'i.id')
      .leftJoin('units_of_measurement as u', 'prl.uom_id', 'u.id')
      .leftJoin('vendors as v', 'prl.preferred_vendor_id', 'v.id')
      .select(
        'prl.*',
        'i.item_code',
        'i.name as item_name',
        'u.code as uom_code',
        'u.name as uom_name',
        'v.vendor_code as preferred_vendor_code',
        'v.name as preferred_vendor_name'
      )
      .orderBy('prl.line_number');

    // Branch
    const branch = await this.db('branches')
      .where({ id: header.branch_id })
      .select('id', 'code', 'name', 'state', 'gstin')
      .first();

    return {
      ...header,
      lines,
      branch,
    };
  }

  // ──────── LIST ────────

  async listRequisitions(options: ListPurchaseRequisitionsOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      sortBy = 'requisition_date',
      sortOrder = 'desc',
      priority,
      source,
      branch_id,
      from_date,
      to_date,
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('purchase_requisitions')
      .where({ company_id: companyId, is_deleted: false });

    if (status) query = query.where('status', status);
    if (priority) query = query.where('priority', priority);
    if (branch_id) query = query.where('branch_id', branch_id);
    if (from_date) query = query.where('requisition_date', '>=', from_date);
    if (to_date) query = query.where('requisition_date', '<=', to_date);

    if (source) {
      query = query.whereRaw(`metadata->>'source' = ?`, [source]);
    }

    if (search) {
      query = query.where(function () {
        this.orWhereILike('requisition_number', `%${search}%`);
        this.orWhereILike('justification', `%${search}%`);
        this.orWhereILike('department', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);

    // Enrich with branch names
    if (data.length > 0) {
      const branchIds = [...new Set(data.map((pr: any) => pr.branch_id))];
      const branches = await this.db('branches')
        .whereIn('id', branchIds)
        .select('id', 'code', 'name');

      const branchMap = new Map(branches.map((b: any) => [b.id, b]));
      for (const pr of data) {
        (pr as any).branch = branchMap.get(pr.branch_id);
      }
    }

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── UPDATE (draft only) ────────

  async updateRequisition(id: string, companyId: string, input: UpdatePurchaseRequisitionInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('purchase_requisitions')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Purchase requisition not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot edit purchase requisition in "${existing.status}" status. Only draft requisitions can be edited.`);
      }

      const { lines, source, purpose, ...headerUpdates } = input;

      // Map purpose -> justification
      if (purpose !== undefined) {
        (headerUpdates as any).justification = purpose;
      }

      // Merge source into metadata
      if (source !== undefined) {
        const currentMetadata = existing.metadata || {};
        (headerUpdates as any).metadata = { ...currentMetadata, source };
      }

      // If lines are provided, replace them
      if (lines && lines.length > 0) {
        // Soft-delete old lines
        await trx('purchase_requisition_lines')
          .where({ requisition_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Insert new lines
        await trx('purchase_requisition_lines')
          .insert(
            lines.map((line, index) => ({
              company_id: companyId,
              requisition_id: id,
              line_number: index + 1,
              item_id: line.item_id,
              description: line.description || null,
              quantity: line.quantity,
              uom_id: line.uom_id,
              estimated_price: line.estimated_price || null,
              preferred_vendor_id: line.preferred_vendor_id || null,
              remarks: line.notes || null,
              created_by: input.updated_by,
            }))
          );
      }

      // Clean fields that should not be updated
      delete (headerUpdates as any).company_id;
      delete (headerUpdates as any).branch_id;
      delete (headerUpdates as any).requisition_number;
      delete (headerUpdates as any).status;

      if (Object.keys(headerUpdates).length > 0) {
        await trx('purchase_requisitions')
          .where({ id })
          .update({ ...headerUpdates, updated_by: input.updated_by });
      }

      const updated = await trx('purchase_requisitions').where({ id }).first();
      const updatedLines = await trx('purchase_requisition_lines')
        .where({ requisition_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteRequisition(id: string, companyId: string, userId: string) {
    const pr = await this.getById(id, companyId);
    if (!pr) throw new Error('Purchase requisition not found');

    if (pr.status !== 'draft') {
      throw new Error('Only draft purchase requisitions can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      // Soft-delete lines
      await trx('purchase_requisition_lines')
        .where({ requisition_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      // Soft-delete header
      const [deleted] = await trx('purchase_requisitions')
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

  // ──────── SUBMIT (draft -> submitted) ────────

  async submitRequisition(id: string, companyId: string, userId: string) {
    const pr = await this.getById(id, companyId);
    if (!pr) throw new Error('Purchase requisition not found');

    if (pr.status !== 'draft') {
      throw new Error(`Cannot submit. Current status: "${pr.status}". Only draft requisitions can be submitted.`);
    }

    const [submitted] = await this.db('purchase_requisitions')
      .where({ id, company_id: companyId })
      .update({
        status: 'submitted',
        updated_by: userId,
      })
      .returning('*');

    return submitted;
  }

  // ──────── APPROVE (submitted -> approved) ────────

  async approveRequisition(id: string, companyId: string, userId: string) {
    const pr = await this.getById(id, companyId);
    if (!pr) throw new Error('Purchase requisition not found');

    if (pr.status !== 'submitted') {
      throw new Error(`Cannot approve. Current status: "${pr.status}". Only submitted requisitions can be approved.`);
    }

    const [approved] = await this.db('purchase_requisitions')
      .where({ id, company_id: companyId })
      .update({
        status: 'approved',
        approved_by: userId,
        approved_at: this.db.fn.now(),
        updated_by: userId,
      })
      .returning('*');

    return approved;
  }

  // ──────── REJECT (submitted -> rejected) ────────

  async rejectRequisition(id: string, companyId: string, userId: string, reason: string) {
    const pr = await this.getById(id, companyId);
    if (!pr) throw new Error('Purchase requisition not found');

    if (pr.status !== 'submitted') {
      throw new Error(`Cannot reject. Current status: "${pr.status}". Only submitted requisitions can be rejected.`);
    }

    // Store rejection reason in metadata
    const currentMetadata = pr.metadata || {};
    const metadata = { ...currentMetadata, rejection_reason: reason };

    const [rejected] = await this.db('purchase_requisitions')
      .where({ id, company_id: companyId })
      .update({
        status: 'rejected',
        metadata,
        updated_by: userId,
      })
      .returning('*');

    return rejected;
  }

  // ──────── CONVERT TO PO (approved -> converted) ────────
  // Note: Actual PO creation is handled by PurchaseOrderService.createFromRequisition.
  // This method only marks the requisition as converted if called directly.

  async convertToPo(id: string, companyId: string, userId: string) {
    const pr = await this.getById(id, companyId);
    if (!pr) throw new Error('Purchase requisition not found');

    if (pr.status !== 'approved') {
      throw new Error(`Cannot convert. Current status: "${pr.status}". Only approved requisitions can be converted.`);
    }

    const [converted] = await this.db('purchase_requisitions')
      .where({ id, company_id: companyId })
      .update({
        status: 'converted',
        updated_by: userId,
      })
      .returning('*');

    return converted;
  }
}

export const purchaseRequisitionService = new PurchaseRequisitionService();
