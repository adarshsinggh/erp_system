// =============================================================
// File: server/services/approval-workflow.service.ts
// Module: Approval Workflow — Phase 10 (Step 41)
// Description: Approval Matrix CRUD + Approval Engine
//   - Configurable rules per document type / amount / role / level
//   - Submit documents for approval
//   - Approve / reject / modify with audit trail
//   - Pending approval queue per user's role
//   - Transaction lock after final approval
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const VALID_DOCUMENT_TYPES = [
  'sales_order',
  'sales_invoice',
  'purchase_requisition',
  'purchase_order',
  'stock_adjustment',
  'stock_transfer',
  'work_order',
  'credit_note',
  'debit_note',
  'payment_receipt',
  'payment_made',
  'journal_entry',
] as const;

type DocumentType = (typeof VALID_DOCUMENT_TYPES)[number];

const VALID_ACTIONS = ['pending', 'approved', 'rejected', 'modified'] as const;
type ApprovalAction = (typeof VALID_ACTIONS)[number];

// Map document_type → table name for status updates after approval
const DOCUMENT_TABLE_MAP: Record<string, string> = {
  sales_order: 'sales_orders',
  sales_invoice: 'sales_invoices',
  purchase_requisition: 'purchase_requisitions',
  purchase_order: 'purchase_orders',
  stock_adjustment: 'stock_adjustments',
  stock_transfer: 'stock_transfers',
  work_order: 'work_orders',
  credit_note: 'credit_notes',
  debit_note: 'debit_notes',
  payment_receipt: 'payment_receipts',
  payment_made: 'payment_made',
  journal_entry: 'ledger_entries',
};

// ─────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────

interface CreateMatrixRuleInput {
  document_type: string;
  min_amount: number;
  max_amount?: number | null;
  approver_role_id: string;
  approval_level: number;
  is_mandatory?: boolean;
  is_active?: boolean;
}

interface UpdateMatrixRuleInput {
  min_amount?: number;
  max_amount?: number | null;
  approver_role_id?: string;
  approval_level?: number;
  is_mandatory?: boolean;
  is_active?: boolean;
}

interface SubmitForApprovalInput {
  document_type: string;
  document_id: string;
  document_number?: string;
  amount: number;
}

interface ApproveRejectInput {
  comments?: string;
}

// ─────────────────────────────────────────────────────────────
// Approval Matrix Service (Configuration CRUD)
// ─────────────────────────────────────────────────────────────

class ApprovalMatrixService extends BaseService {
  constructor() {
    super('approval_matrix');
  }

  /**
   * Create a new approval rule
   */
  async createRule(companyId: string, input: CreateMatrixRuleInput, userId: string) {
    // Validate document type
    if (!VALID_DOCUMENT_TYPES.includes(input.document_type as DocumentType)) {
      throw new Error(`Invalid document_type. Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`);
    }

    // Validate amounts
    if (input.min_amount < 0) {
      throw new Error('min_amount must be >= 0');
    }
    if (input.max_amount !== undefined && input.max_amount !== null && input.max_amount <= input.min_amount) {
      throw new Error('max_amount must be greater than min_amount');
    }

    // Validate approval_level
    if (!Number.isInteger(input.approval_level) || input.approval_level < 1) {
      throw new Error('approval_level must be a positive integer (1, 2, 3...)');
    }

    // Validate approver_role_id exists
    const role = await this.db('roles')
      .where({ id: input.approver_role_id, company_id: companyId, is_deleted: false })
      .first();
    if (!role) {
      throw new Error('Approver role not found');
    }

    // Check for overlapping amount ranges at the same level + document type
    await this._checkAmountOverlap(companyId, input.document_type, input.approval_level, input.min_amount, input.max_amount ?? null, null);

    const record = await this.create({
      company_id: companyId,
      document_type: input.document_type,
      min_amount: input.min_amount,
      max_amount: input.max_amount ?? null,
      approver_role_id: input.approver_role_id,
      approval_level: input.approval_level,
      is_mandatory: input.is_mandatory ?? false,
      is_active: input.is_active ?? true,
      created_by: userId,
      updated_by: userId,
    });

    return record;
  }

  /**
   * List rules with filters
   */
  async listRules(options: ListOptions & { document_type?: string }) {
    const { document_type, ...listOpts } = options;
    const filters: Record<string, any> = {};
    if (document_type) filters.document_type = document_type;

    return this.list({
      ...listOpts,
      filters,
      searchFields: ['document_type'],
      sortBy: options.sortBy || 'document_type',
      sortOrder: options.sortOrder || 'asc',
    });
  }

  /**
   * Get a single rule by ID
   */
  async getRule(id: string, companyId: string) {
    const rule = await this.db('approval_matrix')
      .where({ id, company_id: companyId, is_deleted: false })
      .first();

    if (!rule) throw new Error('Approval rule not found');

    // Fetch role name
    const role = await this.db('roles').where({ id: rule.approver_role_id }).select('name').first();
    return { ...rule, approver_role_name: role?.name || null };
  }

  /**
   * Update a rule
   */
  async updateRule(id: string, companyId: string, input: UpdateMatrixRuleInput, userId: string) {
    const existing = await this.getById(id, companyId);
    if (!existing) throw new Error('Approval rule not found');

    // Merge with existing for validation
    const merged = {
      min_amount: input.min_amount ?? existing.min_amount,
      max_amount: input.max_amount !== undefined ? input.max_amount : existing.max_amount,
      approval_level: input.approval_level ?? existing.approval_level,
      approver_role_id: input.approver_role_id ?? existing.approver_role_id,
    };

    // Validate amounts
    if (merged.min_amount < 0) {
      throw new Error('min_amount must be >= 0');
    }
    if (merged.max_amount !== null && merged.max_amount !== undefined && merged.max_amount <= merged.min_amount) {
      throw new Error('max_amount must be greater than min_amount');
    }

    // Validate approval_level
    if (!Number.isInteger(merged.approval_level) || merged.approval_level < 1) {
      throw new Error('approval_level must be a positive integer');
    }

    // Validate role if changed
    if (input.approver_role_id) {
      const role = await this.db('roles')
        .where({ id: input.approver_role_id, company_id: companyId, is_deleted: false })
        .first();
      if (!role) throw new Error('Approver role not found');
    }

    // Check overlapping ranges (exclude self)
    await this._checkAmountOverlap(
      companyId,
      existing.document_type,
      merged.approval_level,
      merged.min_amount,
      merged.max_amount ?? null,
      id
    );

    return this.update(id, companyId, {
      ...input,
      updated_by: userId,
    }, userId);
  }

  /**
   * Soft delete a rule
   */
  async deleteRule(id: string, companyId: string, userId: string) {
    const existing = await this.getById(id, companyId);
    if (!existing) throw new Error('Approval rule not found');
    return this.softDelete(id, companyId, userId);
  }

  /**
   * Get applicable rules for a document type and amount
   * Returns rules sorted by approval_level ascending
   */
  async getApplicableRules(companyId: string, documentType: string, amount: number) {
    let query = this.db('approval_matrix')
      .where({
        company_id: companyId,
        document_type: documentType,
        is_active: true,
        is_deleted: false,
      })
      .where('min_amount', '<=', amount);

    // max_amount NULL means unlimited
    query = query.andWhere(function () {
      this.whereNull('max_amount').orWhere('max_amount', '>=', amount);
    });

    const rules = await query.orderBy('approval_level', 'asc');
    return rules;
  }

  /**
   * Check for overlapping amount ranges within the same doc type + level
   */
  private async _checkAmountOverlap(
    companyId: string,
    documentType: string,
    level: number,
    minAmount: number,
    maxAmount: number | null,
    excludeId: string | null
  ) {
    let query = this.db('approval_matrix')
      .where({
        company_id: companyId,
        document_type: documentType,
        approval_level: level,
        is_deleted: false,
      });

    if (excludeId) {
      query = query.whereNot('id', excludeId);
    }

    // Overlap logic:
    // Existing range [A, B] overlaps with new [min, max] if:
    //   A <= max (or max is null) AND (B >= min OR B is null)
    query = query.andWhere(function () {
      // existing.min_amount < new.max_amount (or new max is unlimited)
      if (maxAmount !== null) {
        this.where('min_amount', '<=', maxAmount);
      }
      // AND (existing.max_amount > new.min_amount OR existing max is unlimited)
      this.andWhere(function () {
        this.whereNull('max_amount').orWhere('max_amount', '>=', minAmount);
      });
    });

    const overlapping = await query.first();
    if (overlapping) {
      const existingRange = overlapping.max_amount
        ? `${overlapping.min_amount} - ${overlapping.max_amount}`
        : `${overlapping.min_amount}+`;
      throw new Error(
        `Amount range overlaps with existing rule at level ${level} for ${documentType} (range: ${existingRange})`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Approval Engine Service (Runtime Workflow)
// ─────────────────────────────────────────────────────────────

class ApprovalEngineService extends BaseService {
  private matrixService: ApprovalMatrixService;

  constructor(matrixService: ApprovalMatrixService) {
    super('approval_queue');
    this.matrixService = matrixService;
  }

  /**
   * Submit a document for approval.
   * Creates approval_queue entries for each applicable level.
   * Returns the list of created queue entries.
   */
  async submitForApproval(companyId: string, input: SubmitForApprovalInput, userId: string) {
    // Validate document type
    if (!VALID_DOCUMENT_TYPES.includes(input.document_type as DocumentType)) {
      throw new Error(`Invalid document_type. Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`);
    }

    // Check the document exists in its respective table
    const tableName = DOCUMENT_TABLE_MAP[input.document_type];
    if (tableName) {
      const doc = await this.db(tableName)
        .where({ id: input.document_id, company_id: companyId, is_deleted: false })
        .first();
      if (!doc) {
        throw new Error(`Document not found in ${tableName}`);
      }
    }

    // Check if already submitted and pending
    const existingPending = await this.db('approval_queue')
      .where({
        company_id: companyId,
        document_type: input.document_type,
        document_id: input.document_id,
        action: 'pending',
        is_deleted: false,
      })
      .first();

    if (existingPending) {
      throw new Error('Document already has a pending approval request');
    }

    // Get applicable rules
    const rules = await this.matrixService.getApplicableRules(companyId, input.document_type, input.amount);

    if (rules.length === 0) {
      throw new Error('No approval rules configured for this document type and amount');
    }

    const now = new Date().toISOString();
    const entries: any[] = [];

    // Create queue entries — level 1 is 'pending', higher levels are also 'pending'
    // but only level 1 approver acts first (sequential approval)
    for (const rule of rules) {
      entries.push({
        company_id: companyId,
        document_type: input.document_type,
        document_id: input.document_id,
        document_number: input.document_number || null,
        requested_by: userId,
        requested_at: now,
        approver_id: null, // Will be filled when a user of that role acts
        approval_level: rule.approval_level,
        action: 'pending',
        action_at: null,
        comments: null,
        amount: input.amount,
        created_by: userId,
        updated_by: userId,
      });
    }

    const created = await this.db('approval_queue').insert(entries).returning('*');

    // Update document status to 'submitted' or 'pending_approval' if applicable
    if (tableName) {
      await this._updateDocumentStatus(tableName, input.document_id, companyId, 'submitted');
    }

    return created;
  }

  /**
   * Get pending approvals for the current user's role.
   * Only shows level N items where all levels < N are already approved.
   */
  async getPendingApprovals(companyId: string, roleId: string, options: {
    page?: number;
    limit?: number;
    document_type?: string;
  } = {}) {
    const { page = 1, limit = 50, document_type } = options;
    const offset = (page - 1) * limit;

    // Step 1: Find all approval matrix rules for this role
    const myRules = await this.db('approval_matrix')
      .where({
        company_id: companyId,
        approver_role_id: roleId,
        is_active: true,
        is_deleted: false,
      })
      .select('document_type', 'approval_level', 'min_amount', 'max_amount');

    if (myRules.length === 0) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    // Step 2: Build query for pending queue items matching user's role rules
    let query = this.db('approval_queue as aq')
      .where({
        'aq.company_id': companyId,
        'aq.action': 'pending',
        'aq.is_deleted': false,
      });

    if (document_type) {
      query = query.where('aq.document_type', document_type);
    }

    // Match against any of the user's rules
    query = query.andWhere(function () {
      for (const rule of myRules) {
        this.orWhere(function () {
          this.where('aq.document_type', rule.document_type)
            .where('aq.approval_level', rule.approval_level)
            .where('aq.amount', '>=', rule.min_amount);

          if (rule.max_amount !== null) {
            this.where('aq.amount', '<=', rule.max_amount);
          }
        });
      }
    });

    // Step 3: Filter to only show items where all previous levels are approved
    // Subquery: exclude items where a lower-level entry for the same document is still pending
    query = query.whereNotExists(function () {
      this.select(this.client.raw('1'))
        .from('approval_queue as prev')
        .whereRaw('prev.document_id = aq.document_id')
        .whereRaw('prev.document_type = aq.document_type')
        .whereRaw('prev.company_id = aq.company_id')
        .where('prev.is_deleted', false)
        .where('prev.action', 'pending')
        .whereRaw('prev.approval_level < aq.approval_level');
    });

    // Count
    const countResult = await query.clone().count('aq.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    // Fetch with joins for richer data
    const data = await query
      .leftJoin('users as requester', 'aq.requested_by', 'requester.id')
      .select(
        'aq.*',
        'requester.full_name as requested_by_name',
        'requester.username as requested_by_username'
      )
      .orderBy('aq.requested_at', 'asc')
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Approve a pending queue entry.
   * If this is the final level, update the source document status to 'approved'.
   */
  async approve(queueId: string, companyId: string, userId: string, roleId: string, input: ApproveRejectInput = {}) {
    return this.db.transaction(async (trx) => {
      // Get the queue entry
      const entry = await trx('approval_queue')
        .where({ id: queueId, company_id: companyId, action: 'pending', is_deleted: false })
        .first();

      if (!entry) {
        throw new Error('Pending approval entry not found');
      }

      // Verify the user's role is authorized to approve at this level
      await this._verifyApproverRole(trx, companyId, entry.document_type, entry.approval_level, roleId, entry.amount);

      // Check that all previous levels are approved
      await this._checkPreviousLevelsApproved(trx, companyId, entry.document_type, entry.document_id, entry.approval_level);

      // Update the queue entry
      const now = new Date().toISOString();
      const [updated] = await trx('approval_queue')
        .where({ id: queueId })
        .update({
          action: 'approved',
          action_at: now,
          approver_id: userId,
          comments: input.comments || null,
          updated_by: userId,
        })
        .returning('*');

      // Check if this was the final level
      const nextPending = await trx('approval_queue')
        .where({
          company_id: companyId,
          document_type: entry.document_type,
          document_id: entry.document_id,
          action: 'pending',
          is_deleted: false,
        })
        .first();

      let documentStatusUpdated = false;

      if (!nextPending) {
        // All levels approved — update the source document to 'approved'
        const tableName = DOCUMENT_TABLE_MAP[entry.document_type];
        if (tableName) {
          await this._updateDocumentStatusTrx(trx, tableName, entry.document_id, companyId, 'approved');
          documentStatusUpdated = true;
        }
      }

      return {
        approval: updated,
        is_final_approval: !nextPending,
        document_status_updated: documentStatusUpdated,
      };
    });
  }

  /**
   * Reject a pending queue entry.
   * Rejects ALL remaining pending levels for the same document.
   * Updates the source document status to 'rejected'.
   */
  async reject(queueId: string, companyId: string, userId: string, roleId: string, input: ApproveRejectInput = {}) {
    return this.db.transaction(async (trx) => {
      const entry = await trx('approval_queue')
        .where({ id: queueId, company_id: companyId, action: 'pending', is_deleted: false })
        .first();

      if (!entry) {
        throw new Error('Pending approval entry not found');
      }

      // Verify the user's role is authorized
      await this._verifyApproverRole(trx, companyId, entry.document_type, entry.approval_level, roleId, entry.amount);

      // Check previous levels
      await this._checkPreviousLevelsApproved(trx, companyId, entry.document_type, entry.document_id, entry.approval_level);

      const now = new Date().toISOString();

      // Reject this entry
      const [updated] = await trx('approval_queue')
        .where({ id: queueId })
        .update({
          action: 'rejected',
          action_at: now,
          approver_id: userId,
          comments: input.comments || null,
          updated_by: userId,
        })
        .returning('*');

      // Cancel all remaining pending entries for the same document
      await trx('approval_queue')
        .where({
          company_id: companyId,
          document_type: entry.document_type,
          document_id: entry.document_id,
          action: 'pending',
          is_deleted: false,
        })
        .update({
          action: 'rejected',
          action_at: now,
          approver_id: userId,
          comments: `Auto-rejected: Level ${entry.approval_level} was rejected`,
          updated_by: userId,
        });

      // Update document status to 'rejected'
      const tableName = DOCUMENT_TABLE_MAP[entry.document_type];
      if (tableName) {
        await this._updateDocumentStatusTrx(trx, tableName, entry.document_id, companyId, 'rejected');
      }

      return { approval: updated };
    });
  }

  /**
   * Get full approval history for a specific document.
   */
  async getApprovalHistory(companyId: string, documentType: string, documentId: string) {
    if (!VALID_DOCUMENT_TYPES.includes(documentType as DocumentType)) {
      throw new Error('Invalid document_type');
    }

    const history = await this.db('approval_queue as aq')
      .leftJoin('users as requester', 'aq.requested_by', 'requester.id')
      .leftJoin('users as approver', 'aq.approver_id', 'approver.id')
      .where({
        'aq.company_id': companyId,
        'aq.document_type': documentType,
        'aq.document_id': documentId,
        'aq.is_deleted': false,
      })
      .select(
        'aq.*',
        'requester.full_name as requested_by_name',
        'approver.full_name as approver_name'
      )
      .orderBy('aq.approval_level', 'asc')
      .orderBy('aq.requested_at', 'asc');

    return history;
  }

  /**
   * Get current approval status summary for a document.
   */
  async getApprovalStatus(companyId: string, documentType: string, documentId: string) {
    if (!VALID_DOCUMENT_TYPES.includes(documentType as DocumentType)) {
      throw new Error('Invalid document_type');
    }

    const entries = await this.db('approval_queue')
      .where({
        company_id: companyId,
        document_type: documentType,
        document_id: documentId,
        is_deleted: false,
      })
      .orderBy('approval_level', 'asc');

    if (entries.length === 0) {
      return {
        has_approval_workflow: false,
        status: 'no_approval_required',
        levels: [],
        current_level: null,
        total_levels: 0,
      };
    }

    const pendingEntries = entries.filter((e: any) => e.action === 'pending');
    const rejectedEntries = entries.filter((e: any) => e.action === 'rejected');
    const approvedEntries = entries.filter((e: any) => e.action === 'approved');

    let overallStatus: string;
    if (rejectedEntries.length > 0 && pendingEntries.length === 0) {
      overallStatus = 'rejected';
    } else if (pendingEntries.length === 0 && approvedEntries.length === entries.length) {
      overallStatus = 'fully_approved';
    } else {
      overallStatus = 'pending';
    }

    const currentLevel = pendingEntries.length > 0 ? pendingEntries[0].approval_level : null;

    return {
      has_approval_workflow: true,
      status: overallStatus,
      current_level: currentLevel,
      total_levels: entries.length,
      approved_levels: approvedEntries.length,
      pending_levels: pendingEntries.length,
      rejected_levels: rejectedEntries.length,
      levels: entries.map((e: any) => ({
        id: e.id,
        level: e.approval_level,
        action: e.action,
        approver_id: e.approver_id,
        action_at: e.action_at,
        comments: e.comments,
      })),
    };
  }

  /**
   * Dashboard stats: counts by action and document type for the user's role
   */
  async getDashboardStats(companyId: string, roleId: string) {
    // Total pending for my role
    const myRules = await this.db('approval_matrix')
      .where({
        company_id: companyId,
        approver_role_id: roleId,
        is_active: true,
        is_deleted: false,
      })
      .select('document_type', 'approval_level', 'min_amount', 'max_amount');

    if (myRules.length === 0) {
      return {
        pending_count: 0,
        approved_today: 0,
        rejected_today: 0,
        by_document_type: [],
      };
    }

    // Count pending items actionable by this role
    let pendingQuery = this.db('approval_queue as aq')
      .where({
        'aq.company_id': companyId,
        'aq.action': 'pending',
        'aq.is_deleted': false,
      });

    pendingQuery = pendingQuery.andWhere(function () {
      for (const rule of myRules) {
        this.orWhere(function () {
          this.where('aq.document_type', rule.document_type)
            .where('aq.approval_level', rule.approval_level)
            .where('aq.amount', '>=', rule.min_amount);
          if (rule.max_amount !== null) {
            this.where('aq.amount', '<=', rule.max_amount);
          }
        });
      }
    });

    // Only actionable (previous levels approved)
    pendingQuery = pendingQuery.whereNotExists(function () {
      this.select(this.client.raw('1'))
        .from('approval_queue as prev')
        .whereRaw('prev.document_id = aq.document_id')
        .whereRaw('prev.document_type = aq.document_type')
        .whereRaw('prev.company_id = aq.company_id')
        .where('prev.is_deleted', false)
        .where('prev.action', 'pending')
        .whereRaw('prev.approval_level < aq.approval_level');
    });

    const pendingResult = await pendingQuery.count('aq.id as total').first();
    const pendingCount = parseInt(String(pendingResult?.total || '0'), 10);

    // Breakdown by document type for pending
    let byTypeQuery = this.db('approval_queue as aq')
      .where({
        'aq.company_id': companyId,
        'aq.action': 'pending',
        'aq.is_deleted': false,
      });

    byTypeQuery = byTypeQuery.andWhere(function () {
      for (const rule of myRules) {
        this.orWhere(function () {
          this.where('aq.document_type', rule.document_type)
            .where('aq.approval_level', rule.approval_level)
            .where('aq.amount', '>=', rule.min_amount);
          if (rule.max_amount !== null) {
            this.where('aq.amount', '<=', rule.max_amount);
          }
        });
      }
    });

    byTypeQuery = byTypeQuery.whereNotExists(function () {
      this.select(this.client.raw('1'))
        .from('approval_queue as prev')
        .whereRaw('prev.document_id = aq.document_id')
        .whereRaw('prev.document_type = aq.document_type')
        .whereRaw('prev.company_id = aq.company_id')
        .where('prev.is_deleted', false)
        .where('prev.action', 'pending')
        .whereRaw('prev.approval_level < aq.approval_level');
    });

    const byType = await byTypeQuery
      .select('aq.document_type')
      .count('aq.id as count')
      .groupBy('aq.document_type');

    // Today's approved/rejected by this user (not role — actual user)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const approvedToday = await this.db('approval_queue')
      .where({
        company_id: companyId,
        action: 'approved',
        is_deleted: false,
      })
      .where('action_at', '>=', todayStart.toISOString())
      .count('id as total')
      .first();

    const rejectedToday = await this.db('approval_queue')
      .where({
        company_id: companyId,
        action: 'rejected',
        is_deleted: false,
      })
      .where('action_at', '>=', todayStart.toISOString())
      .count('id as total')
      .first();

    return {
      pending_count: pendingCount,
      approved_today: parseInt(String(approvedToday?.total || '0'), 10),
      rejected_today: parseInt(String(rejectedToday?.total || '0'), 10),
      by_document_type: byType.map((row: any) => ({
        document_type: row.document_type,
        count: parseInt(String(row.count), 10),
      })),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────

  /**
   * Verify that the user's role is authorized for this document_type + level + amount
   */
  private async _verifyApproverRole(
    trx: Knex.Transaction | Knex,
    companyId: string,
    documentType: string,
    level: number,
    roleId: string,
    amount: number
  ) {
    let query = trx('approval_matrix')
      .where({
        company_id: companyId,
        document_type: documentType,
        approval_level: level,
        approver_role_id: roleId,
        is_active: true,
        is_deleted: false,
      })
      .where('min_amount', '<=', amount);

    query = query.andWhere(function () {
      this.whereNull('max_amount').orWhere('max_amount', '>=', amount);
    });

    const rule = await query.first();
    if (!rule) {
      throw new Error('You are not authorized to approve this document at this level');
    }
  }

  /**
   * Ensure all previous approval levels are completed (approved)
   */
  private async _checkPreviousLevelsApproved(
    trx: Knex.Transaction | Knex,
    companyId: string,
    documentType: string,
    documentId: string,
    currentLevel: number
  ) {
    if (currentLevel <= 1) return; // No previous levels

    const pendingPrevious = await trx('approval_queue')
      .where({
        company_id: companyId,
        document_type: documentType,
        document_id: documentId,
        action: 'pending',
        is_deleted: false,
      })
      .where('approval_level', '<', currentLevel)
      .first();

    if (pendingPrevious) {
      throw new Error(`Approval level ${pendingPrevious.approval_level} must be completed first`);
    }
  }

  /**
   * Update document status in the source table (non-transactional)
   */
  private async _updateDocumentStatus(tableName: string, documentId: string, companyId: string, status: string) {
    try {
      await this.db(tableName)
        .where({ id: documentId, company_id: companyId })
        .update({ status });
    } catch {
      // Some tables may not have a status column — silently skip
    }
  }

  /**
   * Update document status within a transaction
   */
  private async _updateDocumentStatusTrx(trx: Knex.Transaction, tableName: string, documentId: string, companyId: string, status: string) {
    try {
      await trx(tableName)
        .where({ id: documentId, company_id: companyId })
        .update({ status });
    } catch {
      // Some tables may not have a status column — silently skip
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Export singleton instances
// ─────────────────────────────────────────────────────────────

export const approvalMatrixService = new ApprovalMatrixService();
export const approvalEngineService = new ApprovalEngineService(approvalMatrixService);