// =============================================================
// File: server/services/audit.service.ts
// Module: Audit Trail — Phase 14 (Step 47)
// Description:
//   - Log every INSERT/UPDATE/DELETE with old/new values
//   - Document linking (parent-child traceability)
//   - Entity activity feed
//   - Entity notes & attachments CRUD
//   - Custom field definitions & values
//   - Query audit history for any record
// =============================================================

import { BaseService } from './base.service';
import { Knex } from 'knex';

// ─────────────────────────────────────────────────────────────

class AuditService extends BaseService {
  constructor() {
    super('audit_log');
  }

  // ═══════════════════════════════════════════════════════════
  // AUDIT LOG
  // ═══════════════════════════════════════════════════════════

  /**
   * Record an audit entry. Called by services after mutations.
   */
  async log(entry: {
    company_id: string;
    table_name: string;
    record_id: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    old_values?: Record<string, any>;
    new_values?: Record<string, any>;
    user_id: string;
    user_name?: string;
    ip_address?: string;
    device_id?: string;
    session_id?: string;
  }, trx?: Knex.Transaction) {
    const changedFields = entry.action === 'UPDATE' && entry.old_values && entry.new_values
      ? Object.keys(entry.new_values).filter(k =>
        JSON.stringify(entry.old_values![k]) !== JSON.stringify(entry.new_values![k])
      )
      : null;

    const db = trx || this.db;
    return db('audit_log').insert({
      company_id: entry.company_id,
      table_name: entry.table_name,
      record_id: entry.record_id,
      action: entry.action,
      old_values: entry.old_values ? JSON.stringify(entry.old_values) : null,
      new_values: entry.new_values ? JSON.stringify(entry.new_values) : null,
      changed_fields: changedFields,
      user_id: entry.user_id,
      user_name: entry.user_name || null,
      ip_address: entry.ip_address || null,
      device_id: entry.device_id || null,
      session_id: entry.session_id || null,
    });
  }

  /**
   * Get audit history for a specific record
   */
  async getRecordHistory(companyId: string, tableName: string, recordId: string, options: {
    page?: number; limit?: number;
  } = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const query = this.db('audit_log')
      .where({ company_id: companyId, table_name: tableName, record_id: recordId });

    const countResult = await query.clone().count('id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .select('*')
      .orderBy('performed_at', 'desc')
      .limit(limit).offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Search audit logs with filters
   */
  async searchAuditLog(companyId: string, options: {
    table_name?: string;
    action?: string;
    user_id?: string;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { table_name, action, user_id, date_from, date_to, page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    let query = this.db('audit_log').where('company_id', companyId);

    if (table_name) query = query.where('table_name', table_name);
    if (action) query = query.where('action', action);
    if (user_id) query = query.where('user_id', user_id);
    if (date_from) query = query.where('performed_at', '>=', date_from);
    if (date_to) query = query.where('performed_at', '<=', date_to + 'T23:59:59Z');

    const countResult = await query.clone().count('id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .select('*')
      .orderBy('performed_at', 'desc')
      .limit(limit).offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ═══════════════════════════════════════════════════════════
  // DOCUMENT LINKS
  // ═══════════════════════════════════════════════════════════

  async createDocumentLink(companyId: string, data: {
    parent_type: string; parent_id: string;
    child_type: string; child_id: string;
    link_type: 'converted' | 'generated' | 'referenced';
  }, userId: string) {
    const [link] = await this.db('document_links')
      .insert({
        company_id: companyId,
        ...data,
        created_by: userId, updated_by: userId,
      })
      .returning('*');
    return link;
  }

  async getDocumentLinks(companyId: string, entityType: string, entityId: string) {
    const asParent = await this.db('document_links')
      .where({ company_id: companyId, parent_type: entityType, parent_id: entityId })
      .select('*').orderBy('created_at');

    const asChild = await this.db('document_links')
      .where({ company_id: companyId, child_type: entityType, child_id: entityId })
      .select('*').orderBy('created_at');

    return { as_parent: asParent, as_child: asChild };
  }

  // ═══════════════════════════════════════════════════════════
  // ENTITY ACTIVITY FEED
  // ═══════════════════════════════════════════════════════════

  async logActivity(companyId: string, data: {
    entity_type: string; entity_id: string;
    activity_type: 'status_change' | 'note_added' | 'approval' | 'edit' | 'system';
    description: string;
    old_value?: string; new_value?: string;
  }, userId: string) {
    const [entry] = await this.db('entity_activity')
      .insert({
        company_id: companyId,
        ...data,
        created_by: userId, updated_by: userId,
      })
      .returning('*');
    return entry;
  }

  async getActivityFeed(companyId: string, entityType: string, entityId: string, options: {
    page?: number; limit?: number;
  } = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const query = this.db('entity_activity')
      .where({ company_id: companyId, entity_type: entityType, entity_id: entityId });

    const countResult = await query.clone().count('id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query.clone()
      .leftJoin('users as u', 'entity_activity.created_by', 'u.id')
      .select('entity_activity.*', 'u.full_name as user_name')
      .orderBy('entity_activity.created_at', 'desc')
      .limit(limit).offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ═══════════════════════════════════════════════════════════
  // ENTITY NOTES
  // ═══════════════════════════════════════════════════════════

  async addNote(companyId: string, data: {
    entity_type: string; entity_id: string; note_text: string; is_internal?: boolean;
  }, userId: string) {
    const [note] = await this.db('entity_notes')
      .insert({
        company_id: companyId, ...data,
        is_internal: data.is_internal ?? false,
        created_by: userId, updated_by: userId,
      })
      .returning('*');
    return note;
  }

  async getNotes(companyId: string, entityType: string, entityId: string) {
    return this.db('entity_notes')
      .where({ company_id: companyId, entity_type: entityType, entity_id: entityId, is_deleted: false })
      .leftJoin('users as u', 'entity_notes.created_by', 'u.id')
      .select('entity_notes.*', 'u.full_name as user_name')
      .orderBy('entity_notes.created_at', 'desc');
  }

  async deleteNote(id: string, companyId: string, userId: string) {
    return this.db('entity_notes')
      .where({ id, company_id: companyId })
      .update({ is_deleted: true, deleted_at: this.db.fn.now(), deleted_by: userId });
  }

  // ═══════════════════════════════════════════════════════════
  // ENTITY ATTACHMENTS
  // ═══════════════════════════════════════════════════════════

  async addAttachment(companyId: string, data: {
    entity_type: string; entity_id: string;
    file_name: string; file_path: string;
    file_size?: number; mime_type?: string; description?: string;
  }, userId: string) {
    const [att] = await this.db('entity_attachments')
      .insert({
        company_id: companyId, ...data,
        created_by: userId, updated_by: userId,
      })
      .returning('*');
    return att;
  }

  async getAttachments(companyId: string, entityType: string, entityId: string) {
    return this.db('entity_attachments')
      .where({ company_id: companyId, entity_type: entityType, entity_id: entityId, is_deleted: false })
      .leftJoin('users as u', 'entity_attachments.created_by', 'u.id')
      .select('entity_attachments.*', 'u.full_name as user_name')
      .orderBy('entity_attachments.created_at', 'desc');
  }

  async deleteAttachment(id: string, companyId: string, userId: string) {
    return this.db('entity_attachments')
      .where({ id, company_id: companyId })
      .update({ is_deleted: true, deleted_at: this.db.fn.now(), deleted_by: userId });
  }

  // ═══════════════════════════════════════════════════════════
  // CUSTOM FIELDS
  // ═══════════════════════════════════════════════════════════

  async createFieldDefinition(companyId: string, data: {
    entity_type: string; field_name: string; field_label: string;
    field_type: string; is_required?: boolean; default_value?: string;
    options?: any; sort_order?: number;
  }, userId: string) {
    if (!['text', 'number', 'date', 'boolean', 'select', 'multi_select'].includes(data.field_type)) {
      throw new Error('field_type must be: text, number, date, boolean, select, multi_select');
    }

    const [def] = await this.db('custom_field_definitions')
      .insert({
        company_id: companyId,
        ...data,
        options: data.options ? JSON.stringify(data.options) : null,
        created_by: userId, updated_by: userId,
      })
      .returning('*');
    return def;
  }

  async getFieldDefinitions(companyId: string, entityType?: string) {
    let query = this.db('custom_field_definitions')
      .where({ company_id: companyId, is_deleted: false, is_active: true });
    if (entityType) query = query.where('entity_type', entityType);
    return query.orderBy('sort_order');
  }

  async setFieldValue(companyId: string, data: {
    definition_id: string; entity_type: string; entity_id: string;
    value_text?: string; value_number?: number; value_date?: string; value_boolean?: boolean;
  }, userId: string) {
    // Upsert: update if exists, insert if not
    const existing = await this.db('custom_field_values')
      .where({
        company_id: companyId,
        definition_id: data.definition_id,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
      })
      .first();

    if (existing) {
      const [updated] = await this.db('custom_field_values')
        .where({ id: existing.id })
        .update({
          value_text: data.value_text ?? null,
          value_number: data.value_number ?? null,
          value_date: data.value_date ?? null,
          value_boolean: data.value_boolean ?? null,
          updated_by: userId,
        })
        .returning('*');
      return updated;
    }

    const [inserted] = await this.db('custom_field_values')
      .insert({
        company_id: companyId, ...data,
        created_by: userId, updated_by: userId,
      })
      .returning('*');
    return inserted;
  }

  async getFieldValues(companyId: string, entityType: string, entityId: string) {
    return this.db('custom_field_values as cfv')
      .join('custom_field_definitions as cfd', 'cfv.definition_id', 'cfd.id')
      .where({
        'cfv.company_id': companyId,
        'cfv.entity_type': entityType,
        'cfv.entity_id': entityId,
        'cfd.is_deleted': false,
      })
      .select(
        'cfv.*', 'cfd.field_name', 'cfd.field_label', 'cfd.field_type'
      )
      .orderBy('cfd.sort_order');
  }
}

export const auditService = new AuditService();