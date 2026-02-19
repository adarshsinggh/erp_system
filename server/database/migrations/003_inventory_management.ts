// =============================================================
// File: server/database/migrations/003_inventory_management.ts
// Module: Inventory Management — Phase 7
// Description: Creates all 8 inventory tables:
//              stock_ledger, stock_summary, stock_batches,
//              stock_reservations, stock_transfers,
//              stock_transfer_lines, stock_adjustments,
//              stock_adjustment_lines.
//              (delivery_challans & delivery_challan_lines are
//               assumed created in a sales-phase migration or
//               will be added here if not yet present.)
// =============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // 45. stock_ledger
  // Core append-only inventory ledger.
  // Every movement (GRN, production, dispatch, transfer, adjustment, scrap)
  // creates an entry. Running balance per item+warehouse.
  // ============================================================
  await knex.schema.createTable('stock_ledger', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.uuid('warehouse_id').notNullable().references('id').inTable('warehouses');
    t.uuid('item_id').references('id').inTable('items');
    t.uuid('product_id').references('id').inTable('products');
    t.string('transaction_type', 50).notNullable();
    t.date('transaction_date').notNullable();
    t.string('reference_type', 50).notNullable();
    t.uuid('reference_id').notNullable();
    t.string('reference_number', 100);
    t.decimal('quantity_in', 15, 3).notNullable().defaultTo(0);
    t.decimal('quantity_out', 15, 3).notNullable().defaultTo(0);
    t.decimal('balance_quantity', 15, 3).notNullable().defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_cost', 15, 4);
    t.decimal('total_value', 15, 2);
    t.decimal('balance_value', 15, 2);
    t.uuid('batch_id');
    t.string('serial_number', 100);
    t.text('narration');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);

    // CHECK constraints via raw
    t.check(
      `transaction_type IN ('grn_receipt', 'production_in', 'production_out', 'sales_dispatch', 'transfer_in', 'transfer_out', 'adjustment', 'scrap')`,
      [],
      'chk_stock_ledger_txn_type'
    );
    t.check(
      `reference_type IN ('grn', 'work_order', 'invoice', 'transfer', 'adjustment', 'delivery_challan')`,
      [],
      'chk_stock_ledger_ref_type'
    );
    t.check(
      `sync_status IN ('pending', 'synced', 'conflict')`,
      [],
      'chk_stock_ledger_sync'
    );
  });

  // Indexes for stock_ledger
  await knex.schema.raw('CREATE INDEX idx_stock_ledger_company_id ON stock_ledger(company_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_ledger_branch_id ON stock_ledger(branch_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_ledger_warehouse_id ON stock_ledger(warehouse_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_ledger_item_id ON stock_ledger(item_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_ledger_product_id ON stock_ledger(product_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_ledger_transaction_type ON stock_ledger(transaction_type)');
  await knex.schema.raw('CREATE INDEX idx_stock_ledger_transaction_date ON stock_ledger(transaction_date)');
  await knex.schema.raw('CREATE INDEX idx_stock_ledger_reference ON stock_ledger(reference_type, reference_id)');

  // Triggers
  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_ledger_upd
      BEFORE UPDATE ON stock_ledger
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);

  // ============================================================
  // 46. stock_summary
  // Materialized stock per item/product per warehouse.
  // Updated atomically on every stock movement.
  // ============================================================
  await knex.schema.createTable('stock_summary', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.uuid('warehouse_id').notNullable().references('id').inTable('warehouses');
    t.uuid('item_id').references('id').inTable('items');
    t.uuid('product_id').references('id').inTable('products');
    t.decimal('available_quantity', 15, 3).notNullable().defaultTo(0);
    t.decimal('reserved_quantity', 15, 3).notNullable().defaultTo(0);
    t.decimal('on_order_quantity', 15, 3).notNullable().defaultTo(0);
    t.decimal('in_production_quantity', 15, 3).notNullable().defaultTo(0);
    t.decimal('free_quantity', 15, 3).notNullable().defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('valuation_rate', 15, 4);
    t.decimal('total_value', 15, 2);
    t.date('last_purchase_date');
    t.decimal('last_purchase_rate', 15, 2);
    t.date('last_sale_date');
    t.date('last_movement_date');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.uuid('updated_by');
    t.integer('version').notNullable().defaultTo(1);
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.timestamp('last_synced_at', { useTz: true });
    t.string('device_id', 100);

    t.check(
      `sync_status IN ('pending', 'synced', 'conflict')`,
      [],
      'chk_stock_summary_sync'
    );
  });

  // Unique constraint: one summary row per item/product per warehouse
  await knex.schema.raw(`
    CREATE UNIQUE INDEX uq_stock_summary_item_wh
    ON stock_summary (company_id, warehouse_id, COALESCE(item_id, '00000000-0000-0000-0000-000000000000'), COALESCE(product_id, '00000000-0000-0000-0000-000000000000'))
  `);

  await knex.schema.raw('CREATE INDEX idx_stock_summary_company_id ON stock_summary(company_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_summary_warehouse_id ON stock_summary(company_id, warehouse_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_summary_item_id ON stock_summary(item_id) WHERE item_id IS NOT NULL');
  await knex.schema.raw('CREATE INDEX idx_stock_summary_product_id ON stock_summary(product_id) WHERE product_id IS NOT NULL');

  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_summary_upd
      BEFORE UPDATE ON stock_summary
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_summary_ver
      BEFORE UPDATE ON stock_summary
      FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 47. stock_batches
  // Batch/lot tracking for items.
  // ============================================================
  await knex.schema.createTable('stock_batches', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.string('batch_number', 100).notNullable();
    t.date('manufacturing_date');
    t.date('expiry_date');
    t.uuid('vendor_id').references('id').inTable('vendors');
    t.uuid('grn_id');
    t.decimal('initial_quantity', 15, 3).notNullable();
    t.decimal('current_quantity', 15, 3).notNullable();
    t.decimal('unit_cost', 15, 4);
    t.string('status', 20).notNullable().defaultTo('active');
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
      `status IN ('active', 'depleted', 'expired', 'quarantine')`,
      [],
      'chk_stock_batches_status'
    );
    t.check(
      `sync_status IN ('pending', 'synced', 'conflict')`,
      [],
      'chk_stock_batches_sync'
    );
  });

  await knex.schema.raw('CREATE INDEX idx_stock_batches_company_id ON stock_batches(company_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_batches_item_id ON stock_batches(item_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_batches_co ON stock_batches(company_id) WHERE is_deleted = FALSE');
  await knex.schema.raw(`
    CREATE UNIQUE INDEX uq_stock_batches_item_batch
    ON stock_batches(company_id, item_id, batch_number) WHERE is_deleted = FALSE
  `);

  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_batches_upd
      BEFORE UPDATE ON stock_batches
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_batches_ver
      BEFORE UPDATE ON stock_batches
      FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 48. stock_reservations
  // Reserves stock for confirmed sales orders / work orders.
  // ============================================================
  await knex.schema.createTable('stock_reservations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.uuid('warehouse_id').notNullable().references('id').inTable('warehouses');
    t.uuid('item_id').references('id').inTable('items');
    t.uuid('product_id').references('id').inTable('products');
    t.decimal('reserved_quantity', 15, 3).notNullable().defaultTo(0);
    t.decimal('fulfilled_quantity', 15, 3).notNullable().defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.string('reference_type', 50).notNullable();
    t.uuid('reference_id').notNullable();
    t.uuid('reference_line_id');
    t.date('reserved_until');
    t.string('status', 20).notNullable().defaultTo('active');
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
      `reference_type IN ('sales_order', 'work_order')`,
      [],
      'chk_stock_reservations_ref_type'
    );
    t.check(
      `status IN ('active', 'fulfilled', 'released', 'expired')`,
      [],
      'chk_stock_reservations_status'
    );
    t.check(
      `sync_status IN ('pending', 'synced', 'conflict')`,
      [],
      'chk_stock_reservations_sync'
    );
  });

  await knex.schema.raw('CREATE INDEX idx_stock_reservations_company_id ON stock_reservations(company_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_reservations_comp ON stock_reservations(company_id, branch_id) WHERE is_deleted = FALSE');
  await knex.schema.raw('CREATE INDEX idx_stock_reservations_ref ON stock_reservations(reference_type, reference_id)');

  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_reservations_upd
      BEFORE UPDATE ON stock_reservations
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_reservations_ver
      BEFORE UPDATE ON stock_reservations
      FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 49. stock_transfers
  // Inter-warehouse and inter-branch transfers.
  // ============================================================
  await knex.schema.createTable('stock_transfers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('transfer_number', 50).notNullable();
    t.date('transfer_date').notNullable();
    t.uuid('from_branch_id').notNullable().references('id').inTable('branches');
    t.uuid('from_warehouse_id').notNullable().references('id').inTable('warehouses');
    t.uuid('to_branch_id').notNullable().references('id').inTable('branches');
    t.uuid('to_warehouse_id').notNullable().references('id').inTable('warehouses');
    t.string('transfer_type', 30).notNullable().defaultTo('inter_warehouse');
    t.text('reason');
    t.string('status', 30).notNullable().defaultTo('draft');
    t.uuid('dispatched_by');
    t.uuid('received_by');
    t.uuid('approved_by');
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

    t.unique(['company_id', 'transfer_number']);
    t.check(
      `transfer_type IN ('inter_warehouse', 'inter_branch')`,
      [],
      'chk_stock_transfers_type'
    );
    t.check(
      `status IN ('draft', 'approved', 'in_transit', 'received', 'cancelled')`,
      [],
      'chk_stock_transfers_status'
    );
    t.check(
      `sync_status IN ('pending', 'synced', 'conflict')`,
      [],
      'chk_stock_transfers_sync'
    );
  });

  await knex.schema.raw('CREATE INDEX idx_stock_transfers_company_id ON stock_transfers(company_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_transfers_co ON stock_transfers(company_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_transfers_upd
      BEFORE UPDATE ON stock_transfers
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_transfers_ver
      BEFORE UPDATE ON stock_transfers
      FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 50. stock_transfer_lines
  // ============================================================
  await knex.schema.createTable('stock_transfer_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('transfer_id').notNullable().references('id').inTable('stock_transfers').onDelete('CASCADE');
    t.integer('line_number').notNullable();
    t.uuid('item_id').references('id').inTable('items');
    t.uuid('product_id').references('id').inTable('products');
    t.decimal('quantity', 15, 3).notNullable();
    t.decimal('received_quantity', 15, 3).defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.uuid('batch_id');
    t.decimal('unit_cost', 15, 4);
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

    t.check(
      `sync_status IN ('pending', 'synced', 'conflict')`,
      [],
      'chk_stock_transfer_lines_sync'
    );
  });

  await knex.schema.raw('CREATE INDEX idx_stock_transfer_lines_company_id ON stock_transfer_lines(company_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_transfer_lines_transfer_id ON stock_transfer_lines(transfer_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_transfer_lines_co ON stock_transfer_lines(company_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_transfer_lines_upd
      BEFORE UPDATE ON stock_transfer_lines
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_transfer_lines_ver
      BEFORE UPDATE ON stock_transfer_lines
      FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 51. stock_adjustments
  // Physical count adjustments. Requires approval.
  // ============================================================
  await knex.schema.createTable('stock_adjustments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('adjustment_number', 50).notNullable();
    t.date('adjustment_date').notNullable();
    t.uuid('warehouse_id').notNullable().references('id').inTable('warehouses');
    t.string('reason', 50).notNullable();
    t.text('reason_detail');
    t.string('status', 30).notNullable().defaultTo('draft');
    t.uuid('approved_by');
    t.timestamp('approved_at', { useTz: true });
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

    t.unique(['company_id', 'adjustment_number']);
    t.check(
      `reason IN ('physical_count', 'damage', 'theft', 'correction', 'opening_stock')`,
      [],
      'chk_stock_adjustments_reason'
    );
    t.check(
      `status IN ('draft', 'approved', 'posted', 'cancelled')`,
      [],
      'chk_stock_adjustments_status'
    );
    t.check(
      `sync_status IN ('pending', 'synced', 'conflict')`,
      [],
      'chk_stock_adjustments_sync'
    );
  });

  await knex.schema.raw('CREATE INDEX idx_stock_adjustments_company_id ON stock_adjustments(company_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_adjustments_comp ON stock_adjustments(company_id, branch_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_adjustments_upd
      BEFORE UPDATE ON stock_adjustments
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_adjustments_ver
      BEFORE UPDATE ON stock_adjustments
      FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);

  // ============================================================
  // 52. stock_adjustment_lines
  // ============================================================
  await knex.schema.createTable('stock_adjustment_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('adjustment_id').notNullable().references('id').inTable('stock_adjustments').onDelete('CASCADE');
    t.integer('line_number').notNullable();
    t.uuid('item_id').references('id').inTable('items');
    t.uuid('product_id').references('id').inTable('products');
    t.decimal('system_quantity', 15, 3).notNullable();
    t.decimal('actual_quantity', 15, 3).notNullable();
    t.decimal('adjustment_quantity', 15, 3).notNullable();
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_cost', 15, 4);
    t.decimal('total_value', 15, 2);
    t.uuid('batch_id');
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

    t.check(
      `sync_status IN ('pending', 'synced', 'conflict')`,
      [],
      'chk_stock_adjustment_lines_sync'
    );
  });

  await knex.schema.raw('CREATE INDEX idx_stock_adjustment_lin_company_id ON stock_adjustment_lines(company_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_adjustment_lin_adjustment_id ON stock_adjustment_lines(adjustment_id)');
  await knex.schema.raw('CREATE INDEX idx_stock_adjustment_lin_co ON stock_adjustment_lines(company_id) WHERE is_deleted = FALSE');

  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_adjustment_lines_upd
      BEFORE UPDATE ON stock_adjustment_lines
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  `);
  await knex.schema.raw(`
    CREATE TRIGGER trg_stock_adjustment_lines_ver
      BEFORE UPDATE ON stock_adjustment_lines
      FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stock_adjustment_lines');
  await knex.schema.dropTableIfExists('stock_adjustments');
  await knex.schema.dropTableIfExists('stock_transfer_lines');
  await knex.schema.dropTableIfExists('stock_transfers');
  await knex.schema.dropTableIfExists('stock_reservations');
  await knex.schema.dropTableIfExists('stock_batches');
  await knex.schema.dropTableIfExists('stock_summary');
  await knex.schema.dropTableIfExists('stock_ledger');
}