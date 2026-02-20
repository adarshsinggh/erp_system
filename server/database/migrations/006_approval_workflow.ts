// =============================================================
// File: server/database/migrations/006_approval_workflow.ts
// Module: Approval Workflow — Phase 10
// Description: Creates 2 tables:
//              approval_matrix (configurable rules),
//              approval_queue (pending/completed approvals + audit trail)
// =============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // 65. approval_matrix
  // Configurable approval rules per document type, amount range, and role.
  // ============================================================
  await knex.schema.createTable('approval_matrix', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('document_type', 50).notNullable();
    t.decimal('min_amount', 15, 2).notNullable();
    t.decimal('max_amount', 15, 2);
    t.uuid('approver_role_id').notNullable().references('id').inTable('roles');
    t.integer('approval_level').notNullable().defaultTo(1);
    t.boolean('is_mandatory').notNullable().defaultTo(false);
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

    t.check(
      `document_type IN ('sales_order', 'sales_invoice', 'purchase_requisition', 'purchase_order', 'stock_adjustment', 'stock_transfer', 'work_order', 'credit_note', 'debit_note', 'payment_receipt', 'payment_made', 'journal_entry')`,
      [],
      'chk_am_doc_type'
    );
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_am_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_am_company_id ON approval_matrix(company_id)');
  await knex.schema.raw('CREATE INDEX idx_am_doc_type ON approval_matrix(company_id, document_type)');
  await knex.schema.raw('CREATE INDEX idx_am_co ON approval_matrix(company_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_approval_matrix_upd BEFORE UPDATE ON approval_matrix
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_approval_matrix_ver BEFORE UPDATE ON approval_matrix
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 66. approval_queue
  // Pending and completed approvals. Full audit trail.
  // ============================================================
  await knex.schema.createTable('approval_queue', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('document_type', 50).notNullable();
    t.uuid('document_id').notNullable();
    t.string('document_number', 100);
    t.uuid('requested_by').notNullable().references('id').inTable('users');
    t.timestamp('requested_at', { useTz: true }).notNullable();
    t.uuid('approver_id').references('id').inTable('users');
    t.integer('approval_level').notNullable().defaultTo(1);
    t.string('action', 20).notNullable();
    t.timestamp('action_at', { useTz: true });
    t.text('comments');
    t.decimal('amount', 15, 2);
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

    t.check(`action IN ('pending', 'approved', 'rejected', 'modified')`, [], 'chk_aq_action');
    t.check(
      `document_type IN ('sales_order', 'sales_invoice', 'purchase_requisition', 'purchase_order', 'stock_adjustment', 'stock_transfer', 'work_order', 'credit_note', 'debit_note', 'payment_receipt', 'payment_made', 'journal_entry')`,
      [],
      'chk_aq_doc_type'
    );
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_aq_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_aq_company_id ON approval_queue(company_id)');
  await knex.schema.raw('CREATE INDEX idx_aq_doc_type ON approval_queue(document_type)');
  await knex.schema.raw('CREATE INDEX idx_aq_doc_id ON approval_queue(document_id)');
  await knex.schema.raw('CREATE INDEX idx_aq_approver ON approval_queue(approver_id) WHERE action = \'pending\'');
  await knex.schema.raw('CREATE INDEX idx_aq_requested_by ON approval_queue(requested_by)');
  await knex.schema.raw('CREATE INDEX idx_aq_co ON approval_queue(company_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_approval_queue_upd BEFORE UPDATE ON approval_queue
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_approval_queue_ver BEFORE UPDATE ON approval_queue
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('approval_queue');
  await knex.schema.dropTableIfExists('approval_matrix');
}