import { BaseService, ListOptions } from './base.service';

export interface CreateItemInput {
  company_id: string;
  item_code: string;
  name: string;
  description?: string;
  item_type?: 'raw_material' | 'component' | 'consumable' | 'packing';
  category_id?: string;
  brand_id?: string;
  manufacturer_id?: string;
  primary_uom_id: string;
  purchase_uom_id?: string;
  hsn_code?: string;
  gst_rate?: number;
  purchase_price?: number;
  selling_price?: number;
  min_stock_threshold?: number;
  reorder_quantity?: number;
  max_stock_level?: number;
  lead_time_days?: number;
  costing_method?: 'fifo' | 'weighted_avg' | 'standard';
  standard_cost?: number;
  batch_tracking?: boolean;
  serial_tracking?: boolean;
  shelf_life_days?: number;
  weight?: number;
  weight_uom?: string;
  tags?: string[];
  created_by?: string;
}

class ItemService extends BaseService {
  constructor() {
    super('items');
  }

  async createItem(input: CreateItemInput) {
    return this.create(input);
  }

  async getItemWithDetails(id: string, companyId: string) {
    const item = await this.db('items')
      .where({ 'items.id': id, 'items.company_id': companyId, 'items.is_deleted': false })
      .leftJoin('item_categories', 'items.category_id', 'item_categories.id')
      .leftJoin('brands', 'items.brand_id', 'brands.id')
      .leftJoin('manufacturers', 'items.manufacturer_id', 'manufacturers.id')
      .leftJoin('units_of_measurement as uom', 'items.primary_uom_id', 'uom.id')
      .select(
        'items.*',
        'item_categories.name as category_name',
        'brands.name as brand_name',
        'manufacturers.name as manufacturer_name',
        'uom.code as uom_code',
        'uom.name as uom_name'
      )
      .first();

    if (!item) return null;

    // Get vendors for this item
    let vendors: any[] = [];
    try {
      vendors = await this.db('item_vendor_mapping')
        .where({ item_id: id, company_id: companyId, is_deleted: false })
        .leftJoin('vendors', 'item_vendor_mapping.vendor_id', 'vendors.id')
        .select(
          'item_vendor_mapping.*',
          'vendors.vendor_code',
          'vendors.name as vendor_name'
        );
    } catch {
      // Gracefully handle if no vendor mappings exist
    }

    // Get alternatives
    let alternatives: any[] = [];
    try {
      alternatives = await this.db('item_alternatives')
        .where({ item_id: id, company_id: companyId, is_deleted: false })
        .leftJoin('items as alt', 'item_alternatives.alternative_item_id', 'alt.id')
        .select(
          'item_alternatives.*',
          'alt.item_code as alt_item_code',
          'alt.name as alt_item_name'
        );
    } catch {
      // Gracefully handle if no alternatives exist
    }

    return { ...item, vendors, alternatives };
  }

  async listItems(options: ListOptions & { item_type?: string; category_id?: string }) {
    const { item_type, category_id, ...baseOptions } = options;
    const filters: Record<string, any> = {};
    if (item_type) filters.item_type = item_type;
    if (category_id) filters.category_id = category_id;

    return this.list({
      ...baseOptions,
      searchFields: ['name', 'item_code', 'hsn_code', 'description'],
      filters,
    });
  }

  async updateItem(id: string, companyId: string, data: Partial<CreateItemInput>, userId?: string) {
    return this.update(id, companyId, data, userId);
  }

  // Item alternatives
  async addAlternative(companyId: string, data: {
    item_id: string;
    alternative_item_id: string;
    conversion_factor?: number;
    priority: number;
    notes?: string;
  }) {
    const [alt] = await this.db('item_alternatives')
      .insert({ company_id: companyId, ...data })
      .returning('*');
    return alt;
  }

  async removeAlternative(id: string, companyId: string) {
    return this.db('item_alternatives')
      .where({ id, company_id: companyId })
      .update({ is_deleted: true, deleted_at: this.db.fn.now() });
  }
}

export const itemService = new ItemService();
