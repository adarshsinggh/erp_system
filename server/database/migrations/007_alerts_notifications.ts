// =============================================================
// File: server/database/migrations/007_alerts_notifications.ts
// Module: Alerts, Notifications & Automation — Phase 12
// Description: Creates 3 tables:
//              alert_rules, notifications, scheduled_tasks
// =============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // 67. alert_rules
  // Configurable alert conditions per item, threshold, or event.
  // ============================================================
  await knex.schema.createTable('alert_rules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('name', 255).notNullable();
    t.string('alert_type', 50).notNullable();
    t.string('entity_type', 50);
    t.uuid('entity_id');
    t.jsonb('condition_json').notNullable();
    t.specificType('notify_role_ids', 'UUID[]');
    t.specificType('notify_user_ids', 'UUID[]');
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
      `alert_type IN ('low_stock', 'overstock', 'payment_due', 'approval_pending', 'consumption_anomaly')`,
      [], 'chk_ar_type'
    );
    t.check(
      `entity_type IN ('items', 'products', 'invoices', 'vendor_bills')`,
      [], 'chk_ar_entity'
    );
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_ar_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_ar_company_id ON alert_rules(company_id)');
  await knex.schema.raw('CREATE INDEX idx_ar_co ON alert_rules(company_id) WHERE is_deleted = FALSE');
  await knex.schema.raw('CREATE INDEX idx_ar_type ON alert_rules(company_id, alert_type)');

  await knex.schema.raw(`
    CREATE TRIGGER trg_alert_rules_upd BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_alert_rules_ver BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 68. notifications
  // Generated alerts waiting to be read/dismissed.
  // ============================================================
  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.string('title', 255).notNullable();
    t.text('message').notNullable();
    t.string('notification_type', 50).notNullable();
    t.string('priority', 20).notNullable().defaultTo('normal');
    t.string('reference_type', 50);
    t.uuid('reference_id');
    t.boolean('is_read').notNullable().defaultTo(false);
    t.timestamp('read_at', { useTz: true });
    t.boolean('is_dismissed').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);

    t.check(`notification_type IN ('alert', 'reminder', 'system')`, [], 'chk_notif_type');
    t.check(`priority IN ('low', 'normal', 'high', 'critical')`, [], 'chk_notif_priority');
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_notif_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_notif_company_id ON notifications(company_id)');
  await knex.schema.raw('CREATE INDEX idx_notif_user_id ON notifications(user_id)');
  await knex.schema.raw('CREATE INDEX idx_notif_unread ON notifications(user_id, is_read) WHERE is_read = FALSE AND is_dismissed = FALSE');
  await knex.schema.raw('CREATE INDEX idx_notif_ref ON notifications(reference_type, reference_id) WHERE reference_id IS NOT NULL');

  await knex.schema.raw(`
    CREATE TRIGGER trg_notifications_upd BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_notifications_ver BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 69. scheduled_tasks
  // Background task schedules: backups, sync, alerts, reports.
  // ============================================================
  await knex.schema.createTable('scheduled_tasks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('task_name', 100).notNullable();
    t.string('task_type', 50).notNullable();
    t.string('schedule_cron', 100).notNullable();
    t.timestamp('last_run_at', { useTz: true });
    t.timestamp('next_run_at', { useTz: true });
    t.string('last_status', 20);
    t.text('last_error');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.jsonb('metadata').defaultTo('{}');
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

    t.check(`task_type IN ('backup', 'sync', 'alert_check', 'report_gen')`, [], 'chk_st_type');
    t.check(`last_status IN ('success', 'failed', 'running')`, [], 'chk_st_status');
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_st_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_st_company_id ON scheduled_tasks(company_id)');
  await knex.schema.raw('CREATE INDEX idx_st_co ON scheduled_tasks(company_id) WHERE is_deleted = FALSE');
  await knex.schema.raw('CREATE INDEX idx_st_next_run ON scheduled_tasks(next_run_at) WHERE is_active = TRUE AND is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_scheduled_tasks_upd BEFORE UPDATE ON scheduled_tasks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_scheduled_tasks_ver BEFORE UPDATE ON scheduled_tasks
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('scheduled_tasks');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('alert_rules');
}