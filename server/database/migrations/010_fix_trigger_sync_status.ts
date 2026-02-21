import { Knex } from 'knex';

/**
 * Migration 010: Fix trigger_increment_version()
 *
 * The original trigger unconditionally sets NEW.sync_status = 'pending',
 * which fails on tables that don't have a sync_status column (e.g. companies).
 * This update makes it conditional — only sets sync_status if the column exists.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION trigger_increment_version()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.version = COALESCE(OLD.version, 0) + 1;
      -- Only set sync_status if the column exists on this table
      IF TG_TABLE_NAME IN (
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'sync_status' AND table_schema = 'public'
      ) THEN
        NEW.sync_status = 'pending';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION trigger_increment_version()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.version = COALESCE(OLD.version, 0) + 1;
      NEW.sync_status = 'pending';
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}
