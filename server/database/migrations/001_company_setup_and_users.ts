import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // Extensions (must be first)
  // ============================================================

  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // ============================================================
  // Trigger functions
  // ============================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

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

  // ============================================================
  // 1. companies
  // ============================================================

  await knex.schema.createTable('companies', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('name', 255).notNullable();
    t.string('display_name', 255);
    t.text('logo_path');
    t.string('address_line1', 255);
    t.string('address_line2', 255);
    t.string('city', 100);
    t.string('state', 100);
    t.string('pincode', 10);
    t.string('country', 100).notNullable().defaultTo('India');
    t.string('phone', 20);
    t.string('email', 255);
    t.string('website', 255);
    t.string('gstin', 15).unique();
    t.string('pan', 10).unique();
    t.string('tan', 10);
    t.string('cin', 25);
    t.string('base_currency', 3).notNullable().defaultTo('INR');
    t.integer('financial_year_start').notNullable().defaultTo(4);
    t.string('license_key', 255);
    t.date('license_valid_until');
    t.string('license_tier', 50).defaultTo('starter');
    t.integer('max_users').defaultTo(3);
    t.integer('max_branches').defaultTo(1);
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
  });

  await knex.raw(`ALTER TABLE companies ADD CONSTRAINT chk_companies_tier CHECK (license_tier IN ('starter', 'professional', 'enterprise'));`);
  await knex.raw(`CREATE TRIGGER trg_companies_upd BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_companies_ver BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 2. financial_years
  // ============================================================

  await knex.schema.createTable('financial_years', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('year_code', 20).notNullable();
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.boolean('is_locked').notNullable().defaultTo(false);
    t.timestamp('locked_at', { useTz: true });
    t.uuid('locked_by');
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
    t.unique(['company_id', 'year_code']);
  });

  await knex.raw(`ALTER TABLE financial_years ADD CONSTRAINT chk_fy_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_financial_years_upd BEFORE UPDATE ON financial_years FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_financial_years_ver BEFORE UPDATE ON financial_years FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 3. branches
  // ============================================================

  await knex.schema.createTable('branches', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('code', 20).notNullable();
    t.string('name', 255).notNullable();
    t.string('address_line1', 255);
    t.string('address_line2', 255);
    t.string('city', 100);
    t.string('state', 100);
    t.string('pincode', 10);
    t.string('phone', 20);
    t.string('email', 255);
    t.string('gstin', 15);
    t.boolean('is_main_branch').notNullable().defaultTo(false);
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
    t.unique(['company_id', 'code']);
  });

  await knex.raw(`ALTER TABLE branches ADD CONSTRAINT chk_branches_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_branches_upd BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_branches_ver BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 4. warehouses
  // ============================================================

  await knex.schema.createTable('warehouses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('code', 20).notNullable();
    t.string('name', 255).notNullable();
    t.text('address');
    t.string('warehouse_type', 50).notNullable().defaultTo('main');
    t.boolean('is_default').notNullable().defaultTo(false);
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
  });

  await knex.raw(`ALTER TABLE warehouses ADD CONSTRAINT chk_wh_type CHECK (warehouse_type IN ('main', 'raw_material', 'finished_goods', 'scrap'));`);
  await knex.raw(`ALTER TABLE warehouses ADD CONSTRAINT chk_wh_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_warehouses_upd BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_warehouses_ver BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 5. roles
  // ============================================================

  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('name', 100).notNullable();
    t.text('description');
    t.integer('hierarchy_level').notNullable().defaultTo(1);
    t.boolean('is_system_role').notNullable().defaultTo(false);
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
    t.unique(['company_id', 'name']);
  });

  await knex.raw(`ALTER TABLE roles ADD CONSTRAINT chk_roles_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_roles_upd BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_roles_ver BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 6. permissions
  // ============================================================

  await knex.schema.createTable('permissions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('module', 100).notNullable();
    t.string('action', 50).notNullable();
    t.text('description');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
  });

  await knex.raw(`CREATE TRIGGER trg_permissions_upd BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);

  // ============================================================
  // 7. role_permissions
  // ============================================================

  await knex.schema.createTable('role_permissions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('role_id').notNullable().references('id').inTable('roles');
    t.uuid('permission_id').notNullable().references('id').inTable('permissions');
    t.boolean('is_granted').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
  });

  await knex.raw(`CREATE TRIGGER trg_role_permissions_upd BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);

  // ============================================================
  // 8. field_permissions
  // ============================================================

  await knex.schema.createTable('field_permissions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('role_id').notNullable().references('id').inTable('roles');
    t.string('entity_type', 100).notNullable();
    t.string('field_name', 100).notNullable();
    t.boolean('is_visible').notNullable().defaultTo(true);
    t.boolean('is_editable').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
  });

  await knex.raw(`CREATE TRIGGER trg_field_permissions_upd BEFORE UPDATE ON field_permissions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);

  // ============================================================
  // 9. users
  // ============================================================

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('username', 100).notNullable();
    t.string('email', 255).notNullable();
    t.string('password_hash', 255).notNullable();
    t.string('full_name', 255).notNullable();
    t.uuid('role_id').notNullable().references('id').inTable('roles');
    t.uuid('branch_id').references('id').inTable('branches');
    t.string('phone', 20);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('last_login_at', { useTz: true });
    t.boolean('force_password_change').notNullable().defaultTo(false);
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
    t.unique(['company_id', 'username']);
    t.unique(['company_id', 'email']);
  });

  await knex.raw(`ALTER TABLE users ADD CONSTRAINT chk_users_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_users_upd BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_users_ver BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // Indexes
  // ============================================================

  await knex.raw(`CREATE INDEX idx_fy_company ON financial_years(company_id);`);
  await knex.raw(`CREATE INDEX idx_fy_active ON financial_years(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_branches_company ON branches(company_id);`);
  await knex.raw(`CREATE INDEX idx_branches_active ON branches(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_wh_company ON warehouses(company_id);`);
  await knex.raw(`CREATE INDEX idx_wh_branch ON warehouses(branch_id);`);
  await knex.raw(`CREATE INDEX idx_wh_active ON warehouses(company_id, branch_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_roles_company ON roles(company_id);`);
  await knex.raw(`CREATE INDEX idx_roles_active ON roles(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_users_company ON users(company_id);`);
  await knex.raw(`CREATE INDEX idx_users_active ON users(company_id) WHERE is_deleted = FALSE;`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('field_permissions');
  await knex.schema.dropTableIfExists('role_permissions');
  await knex.schema.dropTableIfExists('permissions');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('roles');
  await knex.schema.dropTableIfExists('warehouses');
  await knex.schema.dropTableIfExists('branches');
  await knex.schema.dropTableIfExists('financial_years');
  await knex.schema.dropTableIfExists('companies');
  await knex.raw('DROP FUNCTION IF EXISTS trigger_increment_version() CASCADE;');
  await knex.raw('DROP FUNCTION IF EXISTS trigger_set_updated_at() CASCADE;');
}
