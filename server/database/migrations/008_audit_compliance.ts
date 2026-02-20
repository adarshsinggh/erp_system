// =============================================================
// File: server/database/migrations/008_audit_compliance.ts
// Module: Audit, Compliance & Data Protection — Phase 14
// Description: Creates 8 tables:
//   audit_log, document_links, custom_field_definitions,
//   custom_field_values, entity_notes, entity_attachments,
//   entity_activity, backup_history
// =============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {

  // ============================================================
  // 70. audit_log — Append-only audit trail
  // ============================================================
  await knex.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id').primary();
    t.uuid('company_id').notNullable();
    t.string('table_name', 100).notNullable();
    t.uuid('record_id').notNullable();
    t.string('action', 10).notNullable();
    t.jsonb('old_values');
    t.jsonb('new_values');
    t.specificType('changed_fields', 'TEXT[]');
    t.uuid('user_id').notNullable();
    t.string('user_name', 255);
    t.string('ip_address', 45);
    t.string('device_id', 100);
    t.timestamp('performed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('session_id');
  });

  await knex.raw(`ALTER TABLE audit_log ADD CONSTRAINT chk_al_action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))`);
  await knex.raw('CREATE INDEX idx_audit_log_company_id ON audit_log(company_id)');
  await knex.raw('CREATE INDEX idx_audit_log_table_name ON audit_log(table_name)');
  await knex.raw('CREATE INDEX idx_audit_log_record_id ON audit_log(record_id)');
  await knex.raw('CREATE INDEX idx_audit_log_performed_at ON audit_log(performed_at)');
  await knex.raw('CREATE INDEX idx_audit_log_user ON audit_log(company_id, user_id)');

  // ============================================================
  // 71. document_links — Parent-child traceability
  // ============================================================
  await knex.schema.createTable('document_links', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable();
    t.string('parent_type', 50).notNullable();
    t.uuid('parent_id').notNullable();
    t.string('child_type', 50).notNullable();
    t.uuid('child_id').notNullable();
    t.string('link_type', 30).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
  });

  await knex.raw(`ALTER TABLE document_links ADD CONSTRAINT chk_dl_link CHECK (link_type IN ('converted', 'generated', 'referenced'))`);
  await knex.raw('CREATE INDEX idx_dl_company_id ON document_links(company_id)');
  await knex.raw('CREATE INDEX idx_dl_parent ON document_links(parent_type, parent_id)');
  await knex.raw('CREATE INDEX idx_dl_child ON document_links(child_type, child_id)');
  await knex.raw(`CREATE TRIGGER trg_document_links_upd BEFORE UPDATE ON document_links FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`);

  // ============================================================
  // 72. custom_field_definitions
  // ============================================================
  await knex.schema.createTable('custom_field_definitions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('entity_type', 100).notNullable();
    t.string('field_name', 100).notNullable();
    t.string('field_label', 255).notNullable();
    t.string('field_type', 30).notNullable();
    t.boolean('is_required').notNullable().defaultTo(false);
    t.text('default_value');
    t.jsonb('options');
    t.integer('sort_order').defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.timestamp('deleted_at', { useTz: true });
    t.uuid('deleted_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);
  });

  await knex.raw(`ALTER TABLE custom_field_definitions ADD CONSTRAINT chk_cfd_type CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'select', 'multi_select'))`);
  await knex.raw(`ALTER TABLE custom_field_definitions ADD CONSTRAINT chk_cfd_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'))`);
  await knex.raw('CREATE INDEX idx_cfd_company_id ON custom_field_definitions(company_id)');
  await knex.raw('CREATE INDEX idx_cfd_co ON custom_field_definitions(company_id) WHERE is_deleted = FALSE');
  await knex.raw('CREATE INDEX idx_cfd_entity ON custom_field_definitions(company_id, entity_type)');
  await knex.raw(`CREATE TRIGGER trg_cfd_upd BEFORE UPDATE ON custom_field_definitions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`);
  await knex.raw(`CREATE TRIGGER trg_cfd_ver BEFORE UPDATE ON custom_field_definitions FOR EACH ROW EXECUTE FUNCTION trigger_increment_version()`);

  // ============================================================
  // 73. custom_field_values
  // ============================================================
  await knex.schema.createTable('custom_field_values', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable();
    t.uuid('definition_id').notNullable().references('id').inTable('custom_field_definitions');
    t.string('entity_type', 100).notNullable();
    t.uuid('entity_id').notNullable();
    t.text('value_text');
    t.decimal('value_number', 15, 4);
    t.date('value_date');
    t.boolean('value_boolean');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);
  });

  await knex.raw(`ALTER TABLE custom_field_values ADD CONSTRAINT chk_cfv_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'))`);
  await knex.raw('CREATE INDEX idx_cfv_company_id ON custom_field_values(company_id)');
  await knex.raw('CREATE INDEX idx_cfv_definition ON custom_field_values(definition_id)');
  await knex.raw('CREATE INDEX idx_cfv_entity ON custom_field_values(entity_type, entity_id)');
  await knex.raw(`CREATE TRIGGER trg_cfv_upd BEFORE UPDATE ON custom_field_values FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`);
  await knex.raw(`CREATE TRIGGER trg_cfv_ver BEFORE UPDATE ON custom_field_values FOR EACH ROW EXECUTE FUNCTION trigger_increment_version()`);

  // ============================================================
  // 74. entity_notes
  // ============================================================
  await knex.schema.createTable('entity_notes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable();
    t.string('entity_type', 100).notNullable();
    t.uuid('entity_id').notNullable();
    t.text('note_text').notNullable();
    t.boolean('is_internal').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.timestamp('deleted_at', { useTz: true });
    t.uuid('deleted_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);
  });

  await knex.raw(`ALTER TABLE entity_notes ADD CONSTRAINT chk_en_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'))`);
  await knex.raw('CREATE INDEX idx_en_entity ON entity_notes(entity_type, entity_id)');
  await knex.raw(`CREATE TRIGGER trg_en_upd BEFORE UPDATE ON entity_notes FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`);
  await knex.raw(`CREATE TRIGGER trg_en_ver BEFORE UPDATE ON entity_notes FOR EACH ROW EXECUTE FUNCTION trigger_increment_version()`);

  // ============================================================
  // 75. entity_attachments
  // ============================================================
  await knex.schema.createTable('entity_attachments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable();
    t.string('entity_type', 100).notNullable();
    t.uuid('entity_id').notNullable();
    t.string('file_name', 255).notNullable();
    t.text('file_path').notNullable();
    t.integer('file_size');
    t.string('mime_type', 100);
    t.string('description', 255);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.timestamp('deleted_at', { useTz: true });
    t.uuid('deleted_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);
  });

  await knex.raw(`ALTER TABLE entity_attachments ADD CONSTRAINT chk_ea_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'))`);
  await knex.raw('CREATE INDEX idx_ea_entity ON entity_attachments(entity_type, entity_id)');
  await knex.raw(`CREATE TRIGGER trg_ea_upd BEFORE UPDATE ON entity_attachments FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`);
  await knex.raw(`CREATE TRIGGER trg_ea_ver BEFORE UPDATE ON entity_attachments FOR EACH ROW EXECUTE FUNCTION trigger_increment_version()`);

  // ============================================================
  // 76. entity_activity
  // ============================================================
  await knex.schema.createTable('entity_activity', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable();
    t.string('entity_type', 100).notNullable();
    t.uuid('entity_id').notNullable();
    t.string('activity_type', 50).notNullable();
    t.text('description').notNullable();
    t.string('old_value', 255);
    t.string('new_value', 255);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
  });

  await knex.raw(`ALTER TABLE entity_activity ADD CONSTRAINT chk_eact_type CHECK (activity_type IN ('status_change', 'note_added', 'approval', 'edit', 'system'))`);
  await knex.raw('CREATE INDEX idx_eact_entity ON entity_activity(entity_type, entity_id)');
  await knex.raw('CREATE INDEX idx_eact_created ON entity_activity(created_at)');
  await knex.raw(`CREATE TRIGGER trg_eact_upd BEFORE UPDATE ON entity_activity FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`);

  // ============================================================
  // 77. backup_history
  // ============================================================
  await knex.schema.createTable('backup_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('backup_type', 30).notNullable();
    t.text('file_path').notNullable();
    t.bigInteger('file_size');
    t.string('checksum', 128);
    t.boolean('is_encrypted').notNullable().defaultTo(false);
    t.string('encryption_method', 50);
    t.string('status', 20).notNullable();
    t.text('error_message');
    t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('completed_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.timestamp('deleted_at', { useTz: true });
    t.uuid('deleted_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);
  });

  await knex.raw(`ALTER TABLE backup_history ADD CONSTRAINT chk_bh_type CHECK (backup_type IN ('full', 'incremental'))`);
  await knex.raw(`ALTER TABLE backup_history ADD CONSTRAINT chk_bh_status CHECK (status IN ('running', 'completed', 'failed'))`);
  await knex.raw(`ALTER TABLE backup_history ADD CONSTRAINT chk_bh_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'))`);
  await knex.raw('CREATE INDEX idx_bh_company ON backup_history(company_id)');
  await knex.raw(`CREATE TRIGGER trg_bh_upd BEFORE UPDATE ON backup_history FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()`);
  await knex.raw(`CREATE TRIGGER trg_bh_ver BEFORE UPDATE ON backup_history FOR EACH ROW EXECUTE FUNCTION trigger_increment_version()`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('backup_history');
  await knex.schema.dropTableIfExists('entity_activity');
  await knex.schema.dropTableIfExists('entity_attachments');
  await knex.schema.dropTableIfExists('entity_notes');
  await knex.schema.dropTableIfExists('custom_field_values');
  await knex.schema.dropTableIfExists('custom_field_definitions');
  await knex.schema.dropTableIfExists('document_links');
  await knex.schema.dropTableIfExists('audit_log');
}