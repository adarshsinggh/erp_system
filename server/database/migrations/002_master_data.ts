import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // 10. customers
  // ============================================================

  await knex.schema.createTable('customers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('customer_code', 50).notNullable();
    t.string('customer_type', 20).notNullable().defaultTo('company');
    t.string('name', 255).notNullable();
    t.string('display_name', 255);
    t.string('gstin', 15);
    t.string('pan', 10);
    t.string('tan', 10);
    t.decimal('credit_limit', 15, 2).defaultTo(0);
    t.integer('payment_terms_days').defaultTo(30);
    t.string('currency_code', 3).notNullable().defaultTo('INR');
    t.boolean('tds_applicable').notNullable().defaultTo(false);
    t.string('tds_section', 20);
    t.decimal('tds_rate', 5, 2);
    t.decimal('opening_balance', 15, 2).defaultTo(0);
    t.string('opening_balance_type', 10).defaultTo('credit');
    t.string('status', 20).notNullable().defaultTo('active');
    t.specificType('tags', 'TEXT[]');
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
    t.unique(['company_id', 'customer_code']);
  });

  await knex.raw(`ALTER TABLE customers ADD CONSTRAINT chk_cust_type CHECK (customer_type IN ('company', 'individual'));`);
  await knex.raw(`ALTER TABLE customers ADD CONSTRAINT chk_cust_bal CHECK (opening_balance_type IN ('debit', 'credit'));`);
  await knex.raw(`ALTER TABLE customers ADD CONSTRAINT chk_cust_status CHECK (status IN ('active', 'inactive', 'blocked'));`);
  await knex.raw(`ALTER TABLE customers ADD CONSTRAINT chk_cust_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_customers_upd BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_customers_ver BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 11. vendors
  // ============================================================

  await knex.schema.createTable('vendors', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('vendor_code', 50).notNullable();
    t.string('vendor_type', 20).notNullable().defaultTo('company');
    t.string('name', 255).notNullable();
    t.string('display_name', 255);
    t.string('gstin', 15);
    t.string('pan', 10);
    t.boolean('msme_registered').notNullable().defaultTo(false);
    t.string('msme_number', 50);
    t.integer('payment_terms_days').defaultTo(30);
    t.string('currency_code', 3).notNullable().defaultTo('INR');
    t.boolean('is_preferred').notNullable().defaultTo(false);
    t.boolean('tds_applicable').notNullable().defaultTo(false);
    t.string('tds_section', 20);
    t.decimal('tds_rate', 5, 2);
    t.decimal('reliability_score', 5, 2).defaultTo(100.00);
    t.integer('average_lead_days').defaultTo(7);
    t.decimal('opening_balance', 15, 2).defaultTo(0);
    t.string('opening_balance_type', 10).defaultTo('credit');
    t.string('status', 20).notNullable().defaultTo('active');
    t.specificType('tags', 'TEXT[]');
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
    t.unique(['company_id', 'vendor_code']);
  });

  await knex.raw(`ALTER TABLE vendors ADD CONSTRAINT chk_vend_type CHECK (vendor_type IN ('company', 'individual'));`);
  await knex.raw(`ALTER TABLE vendors ADD CONSTRAINT chk_vend_bal CHECK (opening_balance_type IN ('debit', 'credit'));`);
  await knex.raw(`ALTER TABLE vendors ADD CONSTRAINT chk_vend_status CHECK (status IN ('active', 'inactive', 'blocked'));`);
  await knex.raw(`ALTER TABLE vendors ADD CONSTRAINT chk_vend_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_vendors_upd BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_vendors_ver BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 12. contact_persons (polymorphic for customers & vendors)
  // ============================================================

  await knex.schema.createTable('contact_persons', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('entity_type', 20).notNullable();
    t.uuid('entity_id').notNullable();
    t.string('name', 255).notNullable();
    t.string('designation', 100);
    t.string('phone', 20);
    t.string('mobile', 20);
    t.string('email', 255);
    t.boolean('is_primary').notNullable().defaultTo(false);
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

  await knex.raw(`ALTER TABLE contact_persons ADD CONSTRAINT chk_cp_entity CHECK (entity_type IN ('customer', 'vendor'));`);
  await knex.raw(`ALTER TABLE contact_persons ADD CONSTRAINT chk_cp_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_contact_persons_upd BEFORE UPDATE ON contact_persons FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_contact_persons_ver BEFORE UPDATE ON contact_persons FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 13. addresses (polymorphic for customers & vendors)
  // ============================================================

  await knex.schema.createTable('addresses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('entity_type', 20).notNullable();
    t.uuid('entity_id').notNullable();
    t.string('address_type', 20).notNullable().defaultTo('billing');
    t.string('label', 100);
    t.string('address_line1', 255).notNullable();
    t.string('address_line2', 255);
    t.string('city', 100).notNullable();
    t.string('state', 100).notNullable();
    t.string('pincode', 10).notNullable();
    t.string('country', 100).notNullable().defaultTo('India');
    t.string('phone', 20);
    t.boolean('is_default').notNullable().defaultTo(false);
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

  await knex.raw(`ALTER TABLE addresses ADD CONSTRAINT chk_addr_entity CHECK (entity_type IN ('customer', 'vendor'));`);
  await knex.raw(`ALTER TABLE addresses ADD CONSTRAINT chk_addr_type CHECK (address_type IN ('billing', 'shipping'));`);
  await knex.raw(`ALTER TABLE addresses ADD CONSTRAINT chk_addr_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_addresses_upd BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_addresses_ver BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 14. manufacturers
  // ============================================================

  await knex.schema.createTable('manufacturers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('name', 255).notNullable();
    t.string('code', 50);
    t.string('country', 100);
    t.string('website', 255);
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

  await knex.raw(`ALTER TABLE manufacturers ADD CONSTRAINT chk_mfr_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_manufacturers_upd BEFORE UPDATE ON manufacturers FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_manufacturers_ver BEFORE UPDATE ON manufacturers FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 15. brands
  // ============================================================

  await knex.schema.createTable('brands', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('name', 255).notNullable();
    t.string('code', 50);
    t.uuid('manufacturer_id').references('id').inTable('manufacturers');
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

  await knex.raw(`ALTER TABLE brands ADD CONSTRAINT chk_brand_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_brands_upd BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_brands_ver BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 16. item_categories (hierarchical)
  // ============================================================

  await knex.schema.createTable('item_categories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('name', 255).notNullable();
    t.string('code', 50);
    t.uuid('parent_id').references('id').inTable('item_categories');
    t.text('description');
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

  await knex.raw(`ALTER TABLE item_categories ADD CONSTRAINT chk_cat_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_item_categories_upd BEFORE UPDATE ON item_categories FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_item_categories_ver BEFORE UPDATE ON item_categories FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 17. units_of_measurement
  // ============================================================

  await knex.schema.createTable('units_of_measurement', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('code', 20).notNullable();
    t.string('name', 100).notNullable();
    t.string('category', 50);
    t.integer('decimal_places').notNullable().defaultTo(2);
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
    t.unique(['company_id', 'code']);
  });

  await knex.raw(`ALTER TABLE units_of_measurement ADD CONSTRAINT chk_uom_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_uom_upd BEFORE UPDATE ON units_of_measurement FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_uom_ver BEFORE UPDATE ON units_of_measurement FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 18. uom_conversions
  // ============================================================

  await knex.schema.createTable('uom_conversions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('from_uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.uuid('to_uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('conversion_factor', 18, 6).notNullable().defaultTo(1.0);
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

  await knex.raw(`ALTER TABLE uom_conversions ADD CONSTRAINT chk_uomc_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_uom_conv_upd BEFORE UPDATE ON uom_conversions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_uom_conv_ver BEFORE UPDATE ON uom_conversions FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 19. items (raw materials, components)
  // ============================================================

  await knex.schema.createTable('items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('item_code', 50).notNullable();
    t.string('name', 255).notNullable();
    t.text('description');
    t.string('item_type', 30).notNullable().defaultTo('raw_material');
    t.uuid('category_id').references('id').inTable('item_categories');
    t.uuid('brand_id').references('id').inTable('brands');
    t.uuid('manufacturer_id').references('id').inTable('manufacturers');
    t.uuid('primary_uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.uuid('purchase_uom_id').references('id').inTable('units_of_measurement');
    t.string('hsn_code', 20);
    t.decimal('gst_rate', 5, 2);
    t.decimal('purchase_price', 15, 2);
    t.decimal('selling_price', 15, 2);
    t.decimal('min_stock_threshold', 15, 3);
    t.decimal('reorder_quantity', 15, 3);
    t.decimal('max_stock_level', 15, 3);
    t.integer('lead_time_days').defaultTo(7);
    t.string('costing_method', 20).notNullable().defaultTo('weighted_avg');
    t.decimal('standard_cost', 15, 2);
    t.boolean('batch_tracking').notNullable().defaultTo(false);
    t.boolean('serial_tracking').notNullable().defaultTo(false);
    t.integer('shelf_life_days');
    t.decimal('weight', 10, 3);
    t.string('weight_uom', 10);
    t.text('image_path');
    t.string('status', 20).notNullable().defaultTo('active');
    t.specificType('tags', 'TEXT[]');
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
    t.unique(['company_id', 'item_code']);
  });

  await knex.raw(`ALTER TABLE items ADD CONSTRAINT chk_item_type CHECK (item_type IN ('raw_material', 'component', 'consumable', 'packing'));`);
  await knex.raw(`ALTER TABLE items ADD CONSTRAINT chk_item_costing CHECK (costing_method IN ('fifo', 'weighted_avg', 'standard'));`);
  await knex.raw(`ALTER TABLE items ADD CONSTRAINT chk_item_status CHECK (status IN ('active', 'inactive', 'blocked'));`);
  await knex.raw(`ALTER TABLE items ADD CONSTRAINT chk_item_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_items_upd BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_items_ver BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 20. products (finished goods, semi-finished)
  // ============================================================

  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('product_code', 50).notNullable();
    t.string('name', 255).notNullable();
    t.text('description');
    t.string('product_type', 30).notNullable().defaultTo('finished_goods');
    t.uuid('category_id').references('id').inTable('item_categories');
    t.uuid('brand_id').references('id').inTable('brands');
    t.uuid('primary_uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.string('hsn_code', 20);
    t.decimal('gst_rate', 5, 2);
    t.decimal('selling_price', 15, 2);
    t.decimal('standard_cost', 15, 2);
    t.decimal('min_stock_threshold', 15, 3);
    t.decimal('reorder_quantity', 15, 3);
    t.decimal('max_stock_level', 15, 3);
    t.boolean('batch_tracking').notNullable().defaultTo(false);
    t.boolean('serial_tracking').notNullable().defaultTo(false);
    t.integer('warranty_months');
    t.decimal('weight', 10, 3);
    t.string('weight_uom', 10);
    t.uuid('manufacturing_location_id');
    t.text('image_path');
    t.string('status', 20).notNullable().defaultTo('active');
    t.specificType('tags', 'TEXT[]');
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
    t.unique(['company_id', 'product_code']);
  });

  await knex.raw(`ALTER TABLE products ADD CONSTRAINT chk_prod_type CHECK (product_type IN ('finished_goods', 'semi_finished'));`);
  await knex.raw(`ALTER TABLE products ADD CONSTRAINT chk_prod_status CHECK (status IN ('active', 'inactive', 'blocked'));`);
  await knex.raw(`ALTER TABLE products ADD CONSTRAINT chk_prod_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_products_upd BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_products_ver BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 21. location_definitions (shop floor areas)
  // ============================================================

  await knex.schema.createTable('location_definitions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').notNullable().references('id').inTable('branches');
    t.string('code', 50).notNullable();
    t.string('name', 255).notNullable();
    t.text('description');
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

  await knex.raw(`ALTER TABLE location_definitions ADD CONSTRAINT chk_loc_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_loc_def_upd BEFORE UPDATE ON location_definitions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_loc_def_ver BEFORE UPDATE ON location_definitions FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // Add FK for products.manufacturing_location_id now that location_definitions exists
  await knex.raw(`ALTER TABLE products ADD CONSTRAINT fk_prod_mfg_loc FOREIGN KEY (manufacturing_location_id) REFERENCES location_definitions(id);`);

  // ============================================================
  // 22. item_vendor_mapping
  // ============================================================

  await knex.schema.createTable('item_vendor_mapping', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.uuid('vendor_id').notNullable().references('id').inTable('vendors');
    t.string('vendor_item_code', 100);
    t.decimal('vendor_price', 15, 2);
    t.string('currency_code', 3).defaultTo('INR');
    t.integer('lead_time_days');
    t.decimal('minimum_order_qty', 15, 3);
    t.integer('priority').notNullable().defaultTo(1);
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

  await knex.raw(`ALTER TABLE item_vendor_mapping ADD CONSTRAINT chk_ivm_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_ivm_upd BEFORE UPDATE ON item_vendor_mapping FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_ivm_ver BEFORE UPDATE ON item_vendor_mapping FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 23. item_alternatives
  // ============================================================

  await knex.schema.createTable('item_alternatives', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('item_id').notNullable().references('id').inTable('items');
    t.uuid('alternative_item_id').notNullable().references('id').inTable('items');
    t.decimal('conversion_factor', 10, 4).notNullable().defaultTo(1.0);
    t.integer('priority').notNullable();
    t.text('notes');
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

  await knex.raw(`ALTER TABLE item_alternatives ADD CONSTRAINT chk_ia_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_ia_upd BEFORE UPDATE ON item_alternatives FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_ia_ver BEFORE UPDATE ON item_alternatives FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 24. bom_headers
  // ============================================================

  await knex.schema.createTable('bom_headers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('product_id').notNullable().references('id').inTable('products');
    t.string('bom_code', 50).notNullable();
    t.integer('bom_version').notNullable().defaultTo(1);
    t.text('description');
    t.decimal('output_quantity', 15, 3).notNullable().defaultTo(1);
    t.uuid('output_uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('expected_yield_pct', 5, 2).defaultTo(100.00);
    t.date('effective_from').notNullable().defaultTo(knex.fn.now());
    t.date('effective_to');
    t.string('status', 20).notNullable().defaultTo('draft');
    t.uuid('approved_by');
    t.timestamp('approved_at', { useTz: true });
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

  await knex.raw(`ALTER TABLE bom_headers ADD CONSTRAINT chk_bom_status CHECK (status IN ('draft', 'active', 'obsolete'));`);
  await knex.raw(`ALTER TABLE bom_headers ADD CONSTRAINT chk_bom_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_bom_headers_upd BEFORE UPDATE ON bom_headers FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_bom_headers_ver BEFORE UPDATE ON bom_headers FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 25. bom_lines (supports item or product as component)
  // ============================================================

  await knex.schema.createTable('bom_lines', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('bom_header_id').notNullable().references('id').inTable('bom_headers');
    t.integer('line_number').notNullable();
    t.string('component_type', 20).notNullable().defaultTo('item');
    t.uuid('component_item_id').references('id').inTable('items');
    t.uuid('component_product_id').references('id').inTable('products');
    t.decimal('quantity', 15, 4).notNullable();
    t.uuid('uom_id').notNullable().references('id').inTable('units_of_measurement');
    t.decimal('wastage_pct', 5, 2);
    t.boolean('is_critical').notNullable().defaultTo(false);
    t.text('notes');
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

  await knex.raw(`ALTER TABLE bom_lines ADD CONSTRAINT chk_bl_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_bom_lines_upd BEFORE UPDATE ON bom_lines FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_bom_lines_ver BEFORE UPDATE ON bom_lines FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 26. tax_masters
  // ============================================================

  await knex.schema.createTable('tax_masters', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.string('tax_name', 100).notNullable();
    t.string('tax_type', 30).notNullable();
    t.decimal('rate', 5, 2).notNullable();
    t.decimal('cgst_rate', 5, 2);
    t.decimal('sgst_rate', 5, 2);
    t.decimal('igst_rate', 5, 2);
    t.decimal('cess_rate', 5, 2);
    t.date('effective_from').notNullable().defaultTo(knex.fn.now());
    t.date('effective_to');
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

  await knex.raw(`ALTER TABLE tax_masters ADD CONSTRAINT chk_tax_type CHECK (tax_type IN ('gst', 'tds', 'tcs'));`);
  await knex.raw(`ALTER TABLE tax_masters ADD CONSTRAINT chk_tax_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_tax_masters_upd BEFORE UPDATE ON tax_masters FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_tax_masters_ver BEFORE UPDATE ON tax_masters FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // 27. document_sequences
  // ============================================================

  await knex.schema.createTable('document_sequences', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('company_id').notNullable().references('id').inTable('companies');
    t.uuid('branch_id').references('id').inTable('branches');
    t.string('document_type', 50).notNullable();
    t.string('prefix_pattern', 100);
    t.string('suffix_pattern', 100);
    t.integer('current_number').notNullable().defaultTo(0);
    t.integer('pad_length').notNullable().defaultTo(4);
    t.string('reset_on', 20).notNullable().defaultTo('yearly');
    t.uuid('financial_year_id').references('id').inTable('financial_years');
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

  await knex.raw(`ALTER TABLE document_sequences ADD CONSTRAINT chk_ds_type CHECK (document_type IN ('quotation', 'sales_order', 'invoice', 'credit_note', 'po', 'grn', 'vendor_bill', 'debit_note', 'work_order', 'delivery_challan', 'payment_receipt', 'payment_made'));`);
  await knex.raw(`ALTER TABLE document_sequences ADD CONSTRAINT chk_ds_reset CHECK (reset_on IN ('yearly', 'monthly', 'never'));`);
  await knex.raw(`ALTER TABLE document_sequences ADD CONSTRAINT chk_ds_sync CHECK (sync_status IN ('pending', 'synced', 'conflict'));`);
  await knex.raw(`CREATE TRIGGER trg_doc_seq_upd BEFORE UPDATE ON document_sequences FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();`);
  await knex.raw(`CREATE TRIGGER trg_doc_seq_ver BEFORE UPDATE ON document_sequences FOR EACH ROW EXECUTE FUNCTION trigger_increment_version();`);

  // ============================================================
  // Utility function: get_next_document_number
  // ============================================================

  await knex.raw(`
    CREATE OR REPLACE FUNCTION get_next_document_number(
      p_company_id UUID,
      p_branch_id UUID,
      p_document_type VARCHAR
    ) RETURNS VARCHAR AS $$
    DECLARE
      v_seq RECORD;
      v_result VARCHAR;
    BEGIN
      UPDATE document_sequences
      SET current_number = current_number + 1, updated_at = NOW()
      WHERE company_id = p_company_id
        AND (branch_id = p_branch_id OR (branch_id IS NULL AND p_branch_id IS NULL))
        AND document_type = p_document_type
        AND is_active = TRUE AND is_deleted = FALSE
      RETURNING * INTO v_seq;

      IF v_seq IS NULL THEN
        RAISE EXCEPTION 'No active sequence for type: %', p_document_type;
      END IF;

      v_result := COALESCE(v_seq.prefix_pattern, '') ||
                  LPAD(v_seq.current_number::TEXT, v_seq.pad_length, '0') ||
                  COALESCE(v_seq.suffix_pattern, '');
      RETURN v_result;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ============================================================
  // Indexes for this migration
  // ============================================================

  await knex.raw(`CREATE INDEX idx_customers_company ON customers(company_id);`);
  await knex.raw(`CREATE INDEX idx_customers_active ON customers(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_vendors_company ON vendors(company_id);`);
  await knex.raw(`CREATE INDEX idx_vendors_active ON vendors(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_cp_company ON contact_persons(company_id);`);
  await knex.raw(`CREATE INDEX idx_cp_entity ON contact_persons(entity_type, entity_id);`);
  await knex.raw(`CREATE INDEX idx_cp_active ON contact_persons(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_addr_company ON addresses(company_id);`);
  await knex.raw(`CREATE INDEX idx_addr_entity ON addresses(entity_type, entity_id);`);
  await knex.raw(`CREATE INDEX idx_addr_active ON addresses(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_mfr_company ON manufacturers(company_id);`);
  await knex.raw(`CREATE INDEX idx_mfr_active ON manufacturers(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_brands_company ON brands(company_id);`);
  await knex.raw(`CREATE INDEX idx_brands_active ON brands(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_cat_company ON item_categories(company_id);`);
  await knex.raw(`CREATE INDEX idx_cat_active ON item_categories(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_uom_company ON units_of_measurement(company_id);`);
  await knex.raw(`CREATE INDEX idx_uom_active ON units_of_measurement(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_items_company ON items(company_id);`);
  await knex.raw(`CREATE INDEX idx_items_category ON items(category_id);`);
  await knex.raw(`CREATE INDEX idx_items_active ON items(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_products_company ON products(company_id);`);
  await knex.raw(`CREATE INDEX idx_products_category ON products(category_id);`);
  await knex.raw(`CREATE INDEX idx_products_active ON products(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_loc_company ON location_definitions(company_id);`);
  await knex.raw(`CREATE INDEX idx_loc_active ON location_definitions(company_id, branch_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_ivm_company ON item_vendor_mapping(company_id);`);
  await knex.raw(`CREATE INDEX idx_ivm_item ON item_vendor_mapping(item_id);`);
  await knex.raw(`CREATE INDEX idx_ivm_vendor ON item_vendor_mapping(vendor_id);`);
  await knex.raw(`CREATE INDEX idx_ivm_active ON item_vendor_mapping(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_ia_company ON item_alternatives(company_id);`);
  await knex.raw(`CREATE INDEX idx_ia_active ON item_alternatives(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_bom_h_company ON bom_headers(company_id);`);
  await knex.raw(`CREATE INDEX idx_bom_h_product ON bom_headers(product_id);`);
  await knex.raw(`CREATE INDEX idx_bom_h_active ON bom_headers(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_bom_l_company ON bom_lines(company_id);`);
  await knex.raw(`CREATE INDEX idx_bom_l_header ON bom_lines(bom_header_id);`);
  await knex.raw(`CREATE INDEX idx_bom_l_active ON bom_lines(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_tax_company ON tax_masters(company_id);`);
  await knex.raw(`CREATE INDEX idx_tax_active ON tax_masters(company_id) WHERE is_deleted = FALSE;`);
  await knex.raw(`CREATE INDEX idx_ds_company ON document_sequences(company_id);`);
  await knex.raw(`CREATE INDEX idx_ds_active ON document_sequences(company_id, branch_id) WHERE is_deleted = FALSE;`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP FUNCTION IF EXISTS get_next_document_number CASCADE;');
  await knex.schema.dropTableIfExists('document_sequences');
  await knex.schema.dropTableIfExists('tax_masters');
  await knex.schema.dropTableIfExists('bom_lines');
  await knex.schema.dropTableIfExists('bom_headers');
  await knex.schema.dropTableIfExists('item_alternatives');
  await knex.schema.dropTableIfExists('item_vendor_mapping');
  await knex.raw('ALTER TABLE products DROP CONSTRAINT IF EXISTS fk_prod_mfg_loc;');
  await knex.schema.dropTableIfExists('location_definitions');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('items');
  await knex.schema.dropTableIfExists('uom_conversions');
  await knex.schema.dropTableIfExists('units_of_measurement');
  await knex.schema.dropTableIfExists('item_categories');
  await knex.schema.dropTableIfExists('brands');
  await knex.schema.dropTableIfExists('manufacturers');
  await knex.schema.dropTableIfExists('addresses');
  await knex.schema.dropTableIfExists('contact_persons');
  await knex.schema.dropTableIfExists('vendors');
  await knex.schema.dropTableIfExists('customers');
}
