// =============================================================
// File: server/database/migrations/004_manufacturing.ts
// Module: Manufacturing — Phase 8
// Description: Creates all 4 manufacturing tables:
//              work_orders, work_order_materials,
//              production_entries, scrap_entries
// =============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // 55. work_orders
  // Production orders with full lifecycle:
  // draft → approved → material_issued → in_progress → completed → closed
  // ============================================================
  await knex.schema.createTable('work_orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('work_order_number', 50).notNullable();
    t.date('work_order_date').notNullable();
    t.uuid('product_id').notNullable().references('id').inTable('products');
    t.uuid('bom_header_id').notNullable().references('id').inTable('bom_headers');
    t.decimal('planned_quantity', 15, 3).notNullable();
    t.decimal('completed_quantity', 15, 3).notNullable().defaultTo(0);
    t.decimal('scrap_quantity', 15, 3).notNullable().defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.date('planned_start_date');
    t.date('planned_end_date');
    t.date('actual_start_date');
    t.date('actual_end_date');
    t.uuid('source_warehouse_id').notNullable().references('id').inTable('warehouses');
    t.uuid('target_warehouse_id').notNullable().references('id').inTable('warehouses');
    t.uuid('location_id');
    t.uuid('sales_order_id');
    t.decimal('planned_cost', 15, 2);
    t.decimal('actual_cost', 15, 2);
    t.string('priority', 20).notNullable().defaultTo('normal');
    t.string('status', 30).notNullable().defaultTo('draft');
    t.uuid('approved_by');
    t.timestamp('approved_at', { useTz: true });
    t.text('internal_notes');
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

    t.unique(['company_id', 'work_order_number']);
    t.check(`priority IN ('low', 'normal', 'high', 'urgent')`, [], 'chk_wo_priority');
    t.check(`status IN ('draft', 'approved', 'material_issued', 'in_progress', 'completed', 'closed', 'cancelled')`, [], 'chk_wo_status');
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_wo_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_work_orders_company_id ON work_orders(company_id)');
  await knex.schema.raw('CREATE INDEX idx_work_orders_comp ON work_orders(company_id, branch_id) WHERE is_deleted = FALSE');
  await knex.schema.raw('CREATE INDEX idx_work_orders_product_id ON work_orders(product_id)');
  await knex.schema.raw('CREATE INDEX idx_work_orders_status ON work_orders(status)');
  await knex.schema.raw('CREATE INDEX idx_work_orders_sales_order ON work_orders(sales_order_id) WHERE sales_order_id IS NOT NULL');

  await knex.schema.raw(`
    CREATE TRIGGER trg_work_orders_upd BEFORE UPDATE ON work_orders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_work_orders_ver BEFORE UPDATE ON work_orders
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 56. work_order_materials
  // Materials required/consumed per work order.
  // Tracks planned vs issued vs consumed vs returned vs wastage.
  // ============================================================
  await knex.schema.createTable('work_order_materials', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('work_order_id').notNullable().references('id').inTable('work_orders').onDelete('CASCADE');
    t.integer('line_number').notNullable();
    t.string('component_type', 20).notNullable().defaultTo('item');
    t.uuid('component_item_id').references('id').inTable('items');
    t.uuid('component_product_id').references('id').inTable('products');
    t.uuid('bom_line_id').references('id').inTable('bom_lines');
    t.decimal('planned_quantity', 15, 4).notNullable();
    t.decimal('issued_quantity', 15, 4).notNullable().defaultTo(0);
    t.decimal('consumed_quantity', 15, 4).notNullable().defaultTo(0);
    t.decimal('returned_quantity', 15, 4).notNullable().defaultTo(0);
    t.decimal('wastage_quantity', 15, 4).notNullable().defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_cost', 15, 4);
    t.decimal('total_cost', 15, 2);
    t.uuid('batch_id');
    t.decimal('variance_quantity', 15, 4);
    t.decimal('variance_pct', 5, 2);
    t.text('remarks');
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

    t.check(`component_type IN ('item', 'product')`, [], 'chk_wom_comp_type');
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_wom_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_wom_company_id ON work_order_materials(company_id)');
  await knex.schema.raw('CREATE INDEX idx_wom_work_order_id ON work_order_materials(work_order_id)');
  await knex.schema.raw('CREATE INDEX idx_wom_co ON work_order_materials(company_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_wom_upd BEFORE UPDATE ON work_order_materials
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_wom_ver BEFORE UPDATE ON work_order_materials
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 57. production_entries
  // Records finished goods output from work orders.
  // ============================================================
  await knex.schema.createTable('production_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('work_order_id').notNullable().references('id').inTable('work_orders');
    t.string('entry_number', 50).notNullable();
    t.date('entry_date').notNullable();
    t.uuid('product_id').notNullable().references('id').inTable('products');
    t.decimal('quantity_produced', 15, 3).notNullable();
    t.decimal('scrap_quantity', 15, 3).notNullable().defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.uuid('warehouse_id').notNullable().references('id').inTable('warehouses');
    t.string('batch_number', 100);
    t.specificType('serial_numbers', 'TEXT[]');
    t.decimal('unit_cost', 15, 4);
    t.decimal('total_cost', 15, 2);
    t.text('remarks');
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

    t.unique(['company_id', 'entry_number']);
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_pe_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_pe_company_id ON production_entries(company_id)');
  await knex.schema.raw('CREATE INDEX idx_pe_work_order_id ON production_entries(work_order_id)');
  await knex.schema.raw('CREATE INDEX idx_pe_co ON production_entries(company_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_pe_upd BEFORE UPDATE ON production_entries
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_pe_ver BEFORE UPDATE ON production_entries
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 58. scrap_entries
  // Scrap/wastage from production with reason and disposal tracking.
  // ============================================================
  await knex.schema.createTable('scrap_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('scrap_number', 50).notNullable();
    t.date('scrap_date').notNullable();
    t.uuid('work_order_id').references('id').inTable('work_orders');
    t.uuid('item_id').references('id').inTable('items');
    t.uuid('product_id').references('id').inTable('products');
    t.decimal('quantity', 15, 3).notNullable();
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.string('scrap_reason', 50).notNullable();
    t.text('reason_detail');
    t.decimal('scrap_value', 15, 2);
    t.string('disposal_method', 50);
    t.uuid('warehouse_id').references('id').inTable('warehouses');
    t.string('status', 20).notNullable().defaultTo('recorded');
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

    t.unique(['company_id', 'scrap_number']);
    t.check(`scrap_reason IN ('defective', 'damaged', 'expired', 'process_waste')`, [], 'chk_se_reason');
    t.check(`disposal_method IN ('sell', 'recycle', 'discard')`, [], 'chk_se_disposal');
    t.check(`status IN ('recorded', 'disposed')`, [], 'chk_se_status');
    t.check(`sync_status IN ('pending', 'synced', 'conflict')`, [], 'chk_se_sync');
  });

  await knex.schema.raw('CREATE INDEX idx_se_company_id ON scrap_entries(company_id)');
  await knex.schema.raw('CREATE INDEX idx_se_comp ON scrap_entries(company_id, branch_id) WHERE is_deleted = FALSE');
  await knex.schema.raw('CREATE INDEX idx_se_work_order_id ON scrap_entries(work_order_id) WHERE work_order_id IS NOT NULL');

  await knex.schema.raw(`
    CREATE TRIGGER trg_se_upd BEFORE UPDATE ON scrap_entries
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_se_ver BEFORE UPDATE ON scrap_entries
    FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('scrap_entries');
  await knex.schema.dropTableIfExists('production_entries');
  await knex.schema.dropTableIfExists('work_order_materials');
  await knex.schema.dropTableIfExists('work_orders');
}