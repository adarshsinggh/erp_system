// =============================================================
// File: server/database/migrations/009_sales_purchase_tables.ts
// FIXES: Bug #17, #18, #19, #20 — Missing sales_quotations,
//        sales_orders, delivery_challans, sales_invoices tables.
//        Also creates all Purchase tables that were never migrated.
//
// These tables were defined in erp_schema.sql but no migration
// file was ever created to actually build them in the database.
// The service code and frontend UI exist but crash because the
// underlying tables are missing.
// =============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // SALES MODULE
  // ============================================================

  // 29. sales_quotations
  await knex.schema.createTable('sales_quotations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('quotation_number', 50).notNullable();
    t.date('quotation_date').notNullable();
    t.date('valid_until');
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.uuid('contact_person_id').references('id').inTable('contact_persons');
    t.uuid('billing_address_id').references('id').inTable('addresses');
    t.uuid('shipping_address_id').references('id').inTable('addresses');
    t.string('reference_number', 100);
    t.string('currency_code', 3).notNullable().defaultTo('INR');
    t.decimal('exchange_rate', 10, 4).notNullable().defaultTo(1.0);
    t.decimal('subtotal', 15, 2).notNullable().defaultTo(0);
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('cess_amount', 15, 2);
    t.decimal('total_tax', 15, 2).notNullable().defaultTo(0);
    t.decimal('grand_total', 15, 2).notNullable().defaultTo(0);
    t.decimal('round_off', 5, 2).defaultTo(0);
    t.text('terms_and_conditions');
    t.text('internal_notes');
    t.string('status', 30).notNullable().defaultTo('draft');
    t.uuid('converted_to_so_id');
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
    t.unique(['company_id', 'quotation_number']);
  });

  await knex.raw(`ALTER TABLE sales_quotations ADD CONSTRAINT chk_sq_status CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'));`);
  await knex.raw(`ALTER TABLE sales_quotations ADD CONSTRAINT chk_sq_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_sq_upd BEFORE UPDATE ON sales_quotations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_sq_ver BEFORE UPDATE ON sales_quotations FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 30. sales_quotation_lines
  await knex.schema.createTable('sales_quotation_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('quotation_id').notNullable().references('id').inTable('sales_quotations');
    t.integer('line_number').notNullable();
    t.uuid('product_id').notNullable().references('id').inTable('products');
    t.text('description');
    t.decimal('quantity', 15, 3).notNullable();
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_price', 15, 2).notNullable();
    t.string('discount_type', 20);
    t.decimal('discount_value', 15, 2);
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_rate', 5, 2);
    t.decimal('sgst_rate', 5, 2);
    t.decimal('igst_rate', 5, 2);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_amount', 15, 2).notNullable().defaultTo(0);
    t.string('hsn_code', 20);
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

  await knex.raw(`ALTER TABLE sales_quotation_lines ADD CONSTRAINT chk_sql_disc CHECK (discount_type IS NULL OR discount_type IN ('percentage', 'fixed'));`);
  await knex.raw(`ALTER TABLE sales_quotation_lines ADD CONSTRAINT chk_sql_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_sql_upd BEFORE UPDATE ON sales_quotation_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_sql_ver BEFORE UPDATE ON sales_quotation_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 31. sales_orders
  await knex.schema.createTable('sales_orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('order_number', 50).notNullable();
    t.date('order_date').notNullable();
    t.date('expected_delivery_date');
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.uuid('contact_person_id').references('id').inTable('contact_persons');
    t.uuid('billing_address_id').references('id').inTable('addresses');
    t.uuid('shipping_address_id').references('id').inTable('addresses');
    t.uuid('quotation_id').references('id').inTable('sales_quotations');
    t.string('customer_po_number', 100);
    t.string('currency_code', 3).notNullable().defaultTo('INR');
    t.decimal('exchange_rate', 10, 4).notNullable().defaultTo(1.0);
    t.integer('payment_terms_days').defaultTo(30);
    t.decimal('subtotal', 15, 2).notNullable().defaultTo(0);
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('cess_amount', 15, 2);
    t.decimal('total_tax', 15, 2).notNullable().defaultTo(0);
    t.decimal('grand_total', 15, 2).notNullable().defaultTo(0);
    t.decimal('round_off', 5, 2).defaultTo(0);
    t.text('terms_and_conditions');
    t.text('internal_notes');
    t.string('status', 30).notNullable().defaultTo('draft');
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
    t.unique(['company_id', 'order_number']);
  });

  await knex.raw(`ALTER TABLE sales_orders ADD CONSTRAINT chk_so_status CHECK (status IN ('draft', 'confirmed', 'in_progress', 'delivered', 'invoiced', 'completed', 'cancelled'));`);
  await knex.raw(`ALTER TABLE sales_orders ADD CONSTRAINT chk_so_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_so_upd BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_so_ver BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 32. sales_order_lines
  await knex.schema.createTable('sales_order_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('sales_order_id').notNullable().references('id').inTable('sales_orders');
    t.integer('line_number').notNullable();
    t.uuid('product_id').notNullable().references('id').inTable('products');
    t.text('description');
    t.decimal('quantity', 15, 3).notNullable();
    t.decimal('delivered_quantity', 15, 3).notNullable().defaultTo(0);
    t.decimal('invoiced_quantity', 15, 3).notNullable().defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_price', 15, 2).notNullable();
    t.string('discount_type', 20);
    t.decimal('discount_value', 15, 2);
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_rate', 5, 2);
    t.decimal('sgst_rate', 5, 2);
    t.decimal('igst_rate', 5, 2);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_amount', 15, 2).notNullable().defaultTo(0);
    t.string('hsn_code', 20);
    t.uuid('warehouse_id').references('id').inTable('warehouses');
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

  await knex.raw(`ALTER TABLE sales_order_lines ADD CONSTRAINT chk_sol_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_sol_upd BEFORE UPDATE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_sol_ver BEFORE UPDATE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 33. sales_invoices
  await knex.schema.createTable('sales_invoices', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('invoice_number', 50).notNullable();
    t.date('invoice_date').notNullable();
    t.date('due_date');
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.uuid('sales_order_id').references('id').inTable('sales_orders');
    t.uuid('contact_person_id').references('id').inTable('contact_persons');
    t.uuid('billing_address_id').references('id').inTable('addresses');
    t.uuid('shipping_address_id').references('id').inTable('addresses');
    t.string('place_of_supply', 5);
    t.boolean('reverse_charge').notNullable().defaultTo(false);
    t.string('currency_code', 3).notNullable().defaultTo('INR');
    t.decimal('exchange_rate', 10, 4).notNullable().defaultTo(1.0);
    t.decimal('subtotal', 15, 2).notNullable().defaultTo(0);
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('cess_amount', 15, 2);
    t.decimal('total_tax', 15, 2).notNullable().defaultTo(0);
    t.decimal('tcs_rate', 5, 2);
    t.decimal('tcs_amount', 15, 2);
    t.decimal('grand_total', 15, 2).notNullable().defaultTo(0);
    t.decimal('round_off', 5, 2).defaultTo(0);
    t.decimal('amount_paid', 15, 2).notNullable().defaultTo(0);
    t.decimal('balance_due', 15, 2).notNullable().defaultTo(0);
    t.text('terms_and_conditions');
    t.text('internal_notes');
    t.string('irn', 100);
    t.string('irn_date', 20);
    t.string('eway_bill_number', 50);
    t.string('status', 30).notNullable().defaultTo('draft');
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
    t.unique(['company_id', 'invoice_number']);
  });

  await knex.raw(`ALTER TABLE sales_invoices ADD CONSTRAINT chk_si_status CHECK (status IN ('draft', 'approved', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'));`);
  await knex.raw(`ALTER TABLE sales_invoices ADD CONSTRAINT chk_si_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_si_upd BEFORE UPDATE ON sales_invoices FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_si_ver BEFORE UPDATE ON sales_invoices FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 34. sales_invoice_lines
  await knex.schema.createTable('sales_invoice_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('invoice_id').notNullable().references('id').inTable('sales_invoices');
    t.integer('line_number').notNullable();
    t.uuid('product_id').notNullable().references('id').inTable('products');
    t.text('description');
    t.decimal('quantity', 15, 3).notNullable();
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_price', 15, 2).notNullable();
    t.string('discount_type', 20);
    t.decimal('discount_value', 15, 2);
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_rate', 5, 2);
    t.decimal('sgst_rate', 5, 2);
    t.decimal('igst_rate', 5, 2);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_amount', 15, 2).notNullable().defaultTo(0);
    t.string('hsn_code', 20);
    t.uuid('sales_order_line_id');
    t.uuid('warehouse_id').references('id').inTable('warehouses');
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

  await knex.raw(`ALTER TABLE sales_invoice_lines ADD CONSTRAINT chk_sil_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_sil_upd BEFORE UPDATE ON sales_invoice_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_sil_ver BEFORE UPDATE ON sales_invoice_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 35. credit_notes  
  await knex.schema.createTable('credit_notes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('credit_note_number', 50).notNullable();
    t.date('credit_note_date').notNullable();
    t.uuid('customer_id').notNullable().references('id').inTable('customers');
    t.uuid('invoice_id').references('id').inTable('sales_invoices');
    t.string('reason', 50).notNullable();
    t.text('reason_detail');
    t.string('currency_code', 3).notNullable().defaultTo('INR');
    t.decimal('exchange_rate', 10, 4).notNullable().defaultTo(1.0);
    t.decimal('subtotal', 15, 2).notNullable().defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_tax', 15, 2).notNullable().defaultTo(0);
    t.decimal('grand_total', 15, 2).notNullable().defaultTo(0);
    t.text('internal_notes');
    t.string('status', 30).notNullable().defaultTo('draft');
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
    t.unique(['company_id', 'credit_note_number']);
  });

  await knex.raw(`ALTER TABLE credit_notes ADD CONSTRAINT chk_cn_status CHECK (status IN ('draft', 'approved', 'applied', 'cancelled'));`);
  await knex.raw(`ALTER TABLE credit_notes ADD CONSTRAINT chk_cn_reason CHECK (reason IN ('return', 'pricing_error', 'quality_issue', 'goodwill', 'other'));`);
  await knex.raw(`ALTER TABLE credit_notes ADD CONSTRAINT chk_cn_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_cn_upd BEFORE UPDATE ON credit_notes FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_cn_ver BEFORE UPDATE ON credit_notes FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 36. credit_note_lines
  await knex.schema.createTable('credit_note_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('credit_note_id').notNullable().references('id').inTable('credit_notes');
    t.integer('line_number').notNullable();
    t.uuid('product_id').notNullable().references('id').inTable('products');
    t.text('description');
    t.decimal('quantity', 15, 3).notNullable();
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_price', 15, 2).notNullable();
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_rate', 5, 2);
    t.decimal('sgst_rate', 5, 2);
    t.decimal('igst_rate', 5, 2);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_amount', 15, 2).notNullable().defaultTo(0);
    t.string('hsn_code', 20);
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

  await knex.raw(`ALTER TABLE credit_note_lines ADD CONSTRAINT chk_cnl_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_cnl_upd BEFORE UPDATE ON credit_note_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_cnl_ver BEFORE UPDATE ON credit_note_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 37. delivery_challans (if not already created in inventory migration)
  const dcExists = await knex.schema.hasTable('delivery_challans');
  if (!dcExists) {
    await knex.schema.createTable('delivery_challans', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.uuid('branch_id').notNullable().references('id').inTable('branches');
      t.string('challan_number', 50).notNullable();
      t.date('challan_date').notNullable();
      t.uuid('customer_id').notNullable().references('id').inTable('customers');
      t.uuid('sales_order_id').references('id').inTable('sales_orders');
      t.uuid('shipping_address_id').references('id').inTable('addresses');
      t.uuid('warehouse_id').notNullable().references('id').inTable('warehouses');
      t.string('transporter_name', 255);
      t.string('vehicle_number', 50);
      t.string('lr_number', 100);
      t.string('e_way_bill_number', 50);
      t.string('status', 30).notNullable().defaultTo('draft');
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
      t.unique(['company_id', 'challan_number']);
    });

    await knex.raw(`ALTER TABLE delivery_challans ADD CONSTRAINT chk_dc_status CHECK (status IN ('draft', 'dispatched', 'delivered', 'cancelled'));`);
    await knex.raw(`ALTER TABLE delivery_challans ADD CONSTRAINT chk_dc_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
    await knex.raw(`CREATE TRIGGER trg_dc_upd BEFORE UPDATE ON delivery_challans FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
    await knex.raw(`CREATE TRIGGER trg_dc_ver BEFORE UPDATE ON delivery_challans FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

    // 38. delivery_challan_lines
    await knex.schema.createTable('delivery_challan_lines', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.uuid('challan_id').notNullable().references('id').inTable('delivery_challans');
      t.integer('line_number').notNullable();
      t.uuid('product_id').notNullable().references('id').inTable('products');
      t.decimal('quantity', 15, 3).notNullable();
      t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
      t.uuid('sales_order_line_id');
      t.uuid('batch_id');
      t.specificType('serial_numbers', 'TEXT[]');
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
    });

    await knex.raw(`ALTER TABLE delivery_challan_lines ADD CONSTRAINT chk_dcl_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
    await knex.raw(`CREATE TRIGGER trg_dcl_upd BEFORE UPDATE ON delivery_challan_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
    await knex.raw(`CREATE TRIGGER trg_dcl_ver BEFORE UPDATE ON delivery_challan_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);
  }

  // 39. payment_receipts (customer payments against invoices)
  const prExists = await knex.schema.hasTable('payment_receipts');
  if (!prExists) {
    await knex.schema.createTable('payment_receipts', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.uuid('branch_id').notNullable().references('id').inTable('branches');
      t.string('receipt_number', 50).notNullable();
      t.date('receipt_date').notNullable();
      t.uuid('customer_id').notNullable().references('id').inTable('customers');
      t.decimal('amount', 15, 2).notNullable();
      t.string('payment_mode', 30).notNullable().defaultTo('bank_transfer');
      t.string('reference_number', 100);
      t.uuid('bank_account_id').references('id').inTable('bank_accounts');
      t.text('notes');
      t.string('status', 30).notNullable().defaultTo('draft');
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
      t.unique(['company_id', 'receipt_number']);
    });

    await knex.raw(`ALTER TABLE payment_receipts ADD CONSTRAINT chk_pr_status CHECK (status IN ('draft', 'confirmed', 'cancelled'));`);
    await knex.raw(`ALTER TABLE payment_receipts ADD CONSTRAINT chk_pr_mode CHECK (payment_mode IN ('cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other'));`);
    await knex.raw(`ALTER TABLE payment_receipts ADD CONSTRAINT chk_pr_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
    await knex.raw(`CREATE TRIGGER trg_pr_upd BEFORE UPDATE ON payment_receipts FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
    await knex.raw(`CREATE TRIGGER trg_pr_ver BEFORE UPDATE ON payment_receipts FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

    // 40. payment_receipt_allocations
    await knex.schema.createTable('payment_receipt_allocations', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.uuid('receipt_id').notNullable().references('id').inTable('payment_receipts');
      t.uuid('invoice_id').notNullable().references('id').inTable('sales_invoices');
      t.decimal('allocated_amount', 15, 2).notNullable();
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

    await knex.raw(`ALTER TABLE payment_receipt_allocations ADD CONSTRAINT chk_pra_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
    await knex.raw(`CREATE TRIGGER trg_pra_upd BEFORE UPDATE ON payment_receipt_allocations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
    await knex.raw(`CREATE TRIGGER trg_pra_ver BEFORE UPDATE ON payment_receipt_allocations FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);
  }

  // ============================================================
  // PURCHASE MODULE
  // ============================================================

  // 41. purchase_requisitions
  await knex.schema.createTable('purchase_requisitions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('requisition_number', 50).notNullable();
    t.date('requisition_date').notNullable();
    t.date('required_by_date');
    t.string('priority', 20).notNullable().defaultTo('normal');
    t.uuid('requested_by').references('id').inTable('users');
    t.string('department', 100);
    t.text('justification');
    t.text('internal_notes');
    t.string('status', 30).notNullable().defaultTo('draft');
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
    t.unique(['company_id', 'requisition_number']);
  });

  await knex.raw(`ALTER TABLE purchase_requisitions ADD CONSTRAINT chk_preq_status CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled'));`);
  await knex.raw(`ALTER TABLE purchase_requisitions ADD CONSTRAINT chk_preq_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'));`);
  await knex.raw(`ALTER TABLE purchase_requisitions ADD CONSTRAINT chk_preq_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_preq_upd BEFORE UPDATE ON purchase_requisitions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_preq_ver BEFORE UPDATE ON purchase_requisitions FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 42. purchase_requisition_lines
  await knex.schema.createTable('purchase_requisition_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('requisition_id').notNullable().references('id').inTable('purchase_requisitions');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 15, 3).notNullable();
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('estimated_price', 15, 2);
    t.uuid('preferred_vendor_id').references('id').inTable('vendors');
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
  });

  await knex.raw(`ALTER TABLE purchase_requisition_lines ADD CONSTRAINT chk_prl_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_prl_upd BEFORE UPDATE ON purchase_requisition_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_prl_ver BEFORE UPDATE ON purchase_requisition_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 43. purchase_orders
  await knex.schema.createTable('purchase_orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('po_number', 50).notNullable();
    t.date('po_date').notNullable();
    t.date('expected_delivery_date');
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
    t.uuid('requisition_id').references('id').inTable('purchase_requisitions');
    t.string('vendor_quotation_ref', 100);
    t.string('currency_code', 3).notNullable().defaultTo('INR');
    t.decimal('exchange_rate', 10, 4).notNullable().defaultTo(1.0);
    t.integer('payment_terms_days').defaultTo(30);
    t.decimal('subtotal', 15, 2).notNullable().defaultTo(0);
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_tax', 15, 2).notNullable().defaultTo(0);
    t.decimal('grand_total', 15, 2).notNullable().defaultTo(0);
    t.decimal('round_off', 5, 2).defaultTo(0);
    t.text('terms_and_conditions');
    t.text('internal_notes');
    t.uuid('delivery_warehouse_id').references('id').inTable('warehouses');
    t.string('status', 30).notNullable().defaultTo('draft');
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
    t.unique(['company_id', 'po_number']);
  });

  await knex.raw(`ALTER TABLE purchase_orders ADD CONSTRAINT chk_po_status CHECK (status IN ('draft', 'approved', 'sent', 'partially_received', 'received', 'billed', 'completed', 'cancelled'));`);
  await knex.raw(`ALTER TABLE purchase_orders ADD CONSTRAINT chk_po_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_po_upd BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_po_ver BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 44. purchase_order_lines
  await knex.schema.createTable('purchase_order_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('purchase_order_id').notNullable().references('id').inTable('purchase_orders');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 15, 3).notNullable();
    t.decimal('received_quantity', 15, 3).notNullable().defaultTo(0);
    t.decimal('billed_quantity', 15, 3).notNullable().defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_price', 15, 2).notNullable();
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_rate', 5, 2);
    t.decimal('sgst_rate', 5, 2);
    t.decimal('igst_rate', 5, 2);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_amount', 15, 2).notNullable().defaultTo(0);
    t.string('hsn_code', 20);
    t.uuid('warehouse_id').references('id').inTable('warehouses');
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

  await knex.raw(`ALTER TABLE purchase_order_lines ADD CONSTRAINT chk_pol_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_pol_upd BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_pol_ver BEFORE UPDATE ON purchase_order_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 45. goods_receipt_notes
  await knex.schema.createTable('goods_receipt_notes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('grn_number', 50).notNullable();
    t.date('grn_date').notNullable();
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
    t.uuid('purchase_order_id').references('id').inTable('purchase_orders');
    t.uuid('warehouse_id').notNullable().references('id').inTable('warehouses');
    t.string('vendor_challan_number', 100);
    t.date('vendor_challan_date');
    t.text('internal_notes');
    t.string('status', 30).notNullable().defaultTo('draft');
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
    t.unique(['company_id', 'grn_number']);
  });

  await knex.raw(`ALTER TABLE goods_receipt_notes ADD CONSTRAINT chk_grn_status CHECK (status IN ('draft', 'confirmed', 'cancelled'));`);
  await knex.raw(`ALTER TABLE goods_receipt_notes ADD CONSTRAINT chk_grn_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_grn_upd BEFORE UPDATE ON goods_receipt_notes FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_grn_ver BEFORE UPDATE ON goods_receipt_notes FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 46. grn_lines
  await knex.schema.createTable('grn_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('grn_id').notNullable().references('id').inTable('goods_receipt_notes');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.uuid('po_line_id');
    t.decimal('quantity_ordered', 15, 3);
    t.decimal('quantity_received', 15, 3).notNullable();
    t.decimal('quantity_accepted', 15, 3).notNullable();
    t.decimal('quantity_rejected', 15, 3).notNullable().defaultTo(0);
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_cost', 15, 4);
    t.uuid('batch_id');
    t.specificType('serial_numbers', 'TEXT[]');
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
  });

  await knex.raw(`ALTER TABLE grn_lines ADD CONSTRAINT chk_grnl_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_grnl_upd BEFORE UPDATE ON grn_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_grnl_ver BEFORE UPDATE ON grn_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 47. vendor_bills
  await knex.schema.createTable('vendor_bills', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('bill_number', 50).notNullable();
    t.date('bill_date').notNullable();
    t.date('due_date');
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
    t.uuid('purchase_order_id').references('id').inTable('purchase_orders');
    t.uuid('grn_id').references('id').inTable('goods_receipt_notes');
    t.string('vendor_invoice_number', 100);
    t.date('vendor_invoice_date');
    t.string('currency_code', 3).notNullable().defaultTo('INR');
    t.decimal('exchange_rate', 10, 4).notNullable().defaultTo(1.0);
    t.decimal('subtotal', 15, 2).notNullable().defaultTo(0);
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_tax', 15, 2).notNullable().defaultTo(0);
    t.decimal('tds_rate', 5, 2);
    t.decimal('tds_amount', 15, 2);
    t.decimal('grand_total', 15, 2).notNullable().defaultTo(0);
    t.decimal('round_off', 5, 2).defaultTo(0);
    t.decimal('amount_paid', 15, 2).notNullable().defaultTo(0);
    t.decimal('balance_due', 15, 2).notNullable().defaultTo(0);
    t.text('internal_notes');
    t.string('status', 30).notNullable().defaultTo('draft');
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
    t.unique(['company_id', 'bill_number']);
  });

  await knex.raw(`ALTER TABLE vendor_bills ADD CONSTRAINT chk_vb_status CHECK (status IN ('draft', 'approved', 'partially_paid', 'paid', 'overdue', 'cancelled'));`);
  await knex.raw(`ALTER TABLE vendor_bills ADD CONSTRAINT chk_vb_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_vb_upd BEFORE UPDATE ON vendor_bills FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_vb_ver BEFORE UPDATE ON vendor_bills FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 48. vendor_bill_lines
  await knex.schema.createTable('vendor_bill_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('bill_id').notNullable().references('id').inTable('vendor_bills');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 15, 3).notNullable();
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_price', 15, 2).notNullable();
    t.decimal('discount_amount', 15, 2).defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_rate', 5, 2);
    t.decimal('sgst_rate', 5, 2);
    t.decimal('igst_rate', 5, 2);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_amount', 15, 2).notNullable().defaultTo(0);
    t.string('hsn_code', 20);
    t.uuid('grn_line_id');
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

  await knex.raw(`ALTER TABLE vendor_bill_lines ADD CONSTRAINT chk_vbl_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_vbl_upd BEFORE UPDATE ON vendor_bill_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_vbl_ver BEFORE UPDATE ON vendor_bill_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 49. debit_notes
  await knex.schema.createTable('debit_notes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('debit_note_number', 50).notNullable();
    t.date('debit_note_date').notNullable();
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
    t.uuid('bill_id').references('id').inTable('vendor_bills');
    t.string('reason', 50).notNullable();
    t.text('reason_detail');
    t.string('currency_code', 3).notNullable().defaultTo('INR');
    t.decimal('subtotal', 15, 2).notNullable().defaultTo(0);
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_tax', 15, 2).notNullable().defaultTo(0);
    t.decimal('grand_total', 15, 2).notNullable().defaultTo(0);
    t.text('internal_notes');
    t.string('status', 30).notNullable().defaultTo('draft');
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
    t.unique(['company_id', 'debit_note_number']);
  });

  await knex.raw(`ALTER TABLE debit_notes ADD CONSTRAINT chk_dn_status CHECK (status IN ('draft', 'approved', 'applied', 'cancelled'));`);
  await knex.raw(`ALTER TABLE debit_notes ADD CONSTRAINT chk_dn_reason CHECK (reason IN ('return', 'pricing_error', 'quality_issue', 'shortage', 'other'));`);
  await knex.raw(`ALTER TABLE debit_notes ADD CONSTRAINT chk_dn_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_dn_upd BEFORE UPDATE ON debit_notes FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_dn_ver BEFORE UPDATE ON debit_notes FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 50. debit_note_lines
  await knex.schema.createTable('debit_note_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('debit_note_id').notNullable().references('id').inTable('debit_notes');
    t.integer('line_number').notNullable();
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.text('description');
    t.decimal('quantity', 15, 3).notNullable();
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('unit_price', 15, 2).notNullable();
    t.decimal('taxable_amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('cgst_rate', 5, 2);
    t.decimal('sgst_rate', 5, 2);
    t.decimal('igst_rate', 5, 2);
    t.decimal('cgst_amount', 15, 2);
    t.decimal('sgst_amount', 15, 2);
    t.decimal('igst_amount', 15, 2);
    t.decimal('total_amount', 15, 2).notNullable().defaultTo(0);
    t.string('hsn_code', 20);
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

  await knex.raw(`ALTER TABLE debit_note_lines ADD CONSTRAINT chk_dnl_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_dnl_upd BEFORE UPDATE ON debit_note_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_dnl_ver BEFORE UPDATE ON debit_note_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // 51. vendor_payments
  const vpExists = await knex.schema.hasTable('vendor_payments');
  if (!vpExists) {
    await knex.schema.createTable('vendor_payments', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.uuid('branch_id').notNullable().references('id').inTable('branches');
      t.string('payment_number', 50).notNullable();
      t.date('payment_date').notNullable();
      t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
      t.decimal('amount', 15, 2).notNullable();
      t.string('payment_mode', 30).notNullable().defaultTo('bank_transfer');
      t.string('reference_number', 100);
      t.uuid('bank_account_id').references('id').inTable('bank_accounts');
      t.decimal('tds_rate', 5, 2);
      t.decimal('tds_amount', 15, 2);
      t.text('notes');
      t.string('status', 30).notNullable().defaultTo('draft');
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
      t.unique(['company_id', 'payment_number']);
    });

    await knex.raw(`ALTER TABLE vendor_payments ADD CONSTRAINT chk_vp_status CHECK (status IN ('draft', 'confirmed', 'cancelled'));`);
    await knex.raw(`ALTER TABLE vendor_payments ADD CONSTRAINT chk_vp_mode CHECK (payment_mode IN ('cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other'));`);
    await knex.raw(`ALTER TABLE vendor_payments ADD CONSTRAINT chk_vp_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
    await knex.raw(`CREATE TRIGGER trg_vp_upd BEFORE UPDATE ON vendor_payments FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
    await knex.raw(`CREATE TRIGGER trg_vp_ver BEFORE UPDATE ON vendor_payments FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

    // 52. vendor_payment_allocations
    await knex.schema.createTable('vendor_payment_allocations', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.uuid('company_id').notNullable().references('id').inTable('companies');
      t.uuid('payment_id').notNullable().references('id').inTable('vendor_payments');
      t.uuid('bill_id').notNullable().references('id').inTable('vendor_bills');
      t.decimal('allocated_amount', 15, 2).notNullable();
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

    await knex.raw(`ALTER TABLE vendor_payment_allocations ADD CONSTRAINT chk_vpa_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
    await knex.raw(`CREATE TRIGGER trg_vpa_upd BEFORE UPDATE ON vendor_payment_allocations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
    await knex.raw(`CREATE TRIGGER trg_vpa_ver BEFORE UPDATE ON vendor_payment_allocations FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);
  }

  // ============================================================
  // INDEXES for all new tables
  // ============================================================

  // Sales quotations
  await knex.raw(`CREATE INDEX idx_sq_company ON sales_quotations(company_id);`);
  await knex.raw(`CREATE INDEX idx_sq_branch ON sales_quotations(branch_id);`);
  await knex.raw(`CREATE INDEX idx_sq_customer ON sales_quotations(customer_id);`);
  await knex.raw(`CREATE INDEX idx_sq_status ON sales_quotations(status);`);
  await knex.raw(`CREATE INDEX idx_sq_co ON sales_quotations(company_id, branch_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_sql_quotation ON sales_quotation_lines(quotation_id);`);

  // Sales orders
  await knex.raw(`CREATE INDEX idx_so_company ON sales_orders(company_id);`);
  await knex.raw(`CREATE INDEX idx_so_branch ON sales_orders(branch_id);`);
  await knex.raw(`CREATE INDEX idx_so_customer ON sales_orders(customer_id);`);
  await knex.raw(`CREATE INDEX idx_so_status ON sales_orders(status);`);
  await knex.raw(`CREATE INDEX idx_so_co ON sales_orders(company_id, branch_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_sol_order ON sales_order_lines(sales_order_id);`);

  // Sales invoices
  await knex.raw(`CREATE INDEX idx_si_company ON sales_invoices(company_id);`);
  await knex.raw(`CREATE INDEX idx_si_branch ON sales_invoices(branch_id);`);
  await knex.raw(`CREATE INDEX idx_si_customer ON sales_invoices(customer_id);`);
  await knex.raw(`CREATE INDEX idx_si_status ON sales_invoices(status);`);
  await knex.raw(`CREATE INDEX idx_si_co ON sales_invoices(company_id, branch_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_sil_invoice ON sales_invoice_lines(invoice_id);`);

  // Credit notes
  await knex.raw(`CREATE INDEX idx_cn_company ON credit_notes(company_id);`);
  await knex.raw(`CREATE INDEX idx_cn_customer ON credit_notes(customer_id);`);
  await knex.raw(`CREATE INDEX idx_cnl_note ON credit_note_lines(credit_note_id);`);

  // Purchase tables
  await knex.raw(`CREATE INDEX idx_preq_company ON purchase_requisitions(company_id);`);
  await knex.raw(`CREATE INDEX idx_preq_co ON purchase_requisitions(company_id, branch_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_prl_req ON purchase_requisition_lines(requisition_id);`);
  await knex.raw(`CREATE INDEX idx_po_company ON purchase_orders(company_id);`);
  await knex.raw(`CREATE INDEX idx_po_vendor ON purchase_orders(vendor_id);`);
  await knex.raw(`CREATE INDEX idx_po_status ON purchase_orders(status);`);
  await knex.raw(`CREATE INDEX idx_po_co ON purchase_orders(company_id, branch_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_pol_po ON purchase_order_lines(purchase_order_id);`);
  await knex.raw(`CREATE INDEX idx_grn_company ON goods_receipt_notes(company_id);`);
  await knex.raw(`CREATE INDEX idx_grn_co ON goods_receipt_notes(company_id, branch_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_grnl_grn ON grn_lines(grn_id);`);
  await knex.raw(`CREATE INDEX idx_vb_company ON vendor_bills(company_id);`);
  await knex.raw(`CREATE INDEX idx_vb_vendor ON vendor_bills(vendor_id);`);
  await knex.raw(`CREATE INDEX idx_vb_co ON vendor_bills(company_id, branch_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_vbl_bill ON vendor_bill_lines(bill_id);`);
  await knex.raw(`CREATE INDEX idx_dn_company ON debit_notes(company_id);`);
  await knex.raw(`CREATE INDEX idx_dnl_note ON debit_note_lines(debit_note_id);`);
}

export async function down(knex: Knex): Promise<void> {
  // Reverse order
  await knex.schema.dropTableIfExists('vendor_payment_allocations');
  await knex.schema.dropTableIfExists('vendor_payments');
  await knex.schema.dropTableIfExists('debit_note_lines');
  await knex.schema.dropTableIfExists('debit_notes');
  await knex.schema.dropTableIfExists('vendor_bill_lines');
  await knex.schema.dropTableIfExists('vendor_bills');
  await knex.schema.dropTableIfExists('grn_lines');
  await knex.schema.dropTableIfExists('goods_receipt_notes');
  await knex.schema.dropTableIfExists('purchase_order_lines');
  await knex.schema.dropTableIfExists('purchase_orders');
  await knex.schema.dropTableIfExists('purchase_requisition_lines');
  await knex.schema.dropTableIfExists('purchase_requisitions');
  await knex.schema.dropTableIfExists('payment_receipt_allocations');
  await knex.schema.dropTableIfExists('payment_receipts');
  await knex.schema.dropTableIfExists('delivery_challan_lines');
  await knex.schema.dropTableIfExists('delivery_challans');
  await knex.schema.dropTableIfExists('credit_note_lines');
  await knex.schema.dropTableIfExists('credit_notes');
  await knex.schema.dropTableIfExists('sales_invoice_lines');
  await knex.schema.dropTableIfExists('sales_invoices');
  await knex.schema.dropTableIfExists('sales_order_lines');
  await knex.schema.dropTableIfExists('sales_orders');
  await knex.schema.dropTableIfExists('sales_quotation_lines');
  await knex.schema.dropTableIfExists('sales_quotations');
}