import { BaseService, ListOptions } from './base.service';

export interface CreateProductInput {
  company_id: string;
  product_code: string;
  name: string;
  description?: string;
  product_type?: 'finished_goods' | 'semi_finished';
  category_id?: string;
  brand_id?: string;
  primary_uom_id: string;
  hsn_code?: string;
  gst_rate?: number;
  selling_price?: number;
  standard_cost?: number;
  min_stock_threshold?: number;
  reorder_quantity?: number;
  max_stock_level?: number;
  batch_tracking?: boolean;
  serial_tracking?: boolean;
  warranty_months?: number;
  weight?: number;
  weight_uom?: string;
  manufacturing_location_id?: string;
  tags?: string[];
  created_by?: string;
}

class ProductService extends BaseService {
  constructor() {
    super('products');
  }

  async createProduct(input: CreateProductInput) {
    return this.create(input);
  }

  async getProductWithDetails(id: string, companyId: string) {
    const product = await this.db('products')
      .where({ 'products.id': id, 'products.company_id': companyId, 'products.is_deleted': false })
      .leftJoin('item_categories', 'products.category_id', 'item_categories.id')
      .leftJoin('brands', 'products.brand_id', 'brands.id')
      .leftJoin('units_of_measurement as uom', 'products.primary_uom_id', 'uom.id')
      .select(
        'products.*',
        'item_categories.name as category_name',
        'brands.name as brand_name',
        'uom.code as uom_code',
        'uom.name as uom_name'
      )
      .first();

    if (!product) return null;

    // Get active BOM
    let active_bom: any = null;
    let bom_lines: any[] = [];
    let bom_versions: any[] = [];

    try {
      active_bom = await this.db('bom_headers')
        .where({ product_id: id, company_id: companyId, status: 'active', is_deleted: false })
        .orderBy('bom_version', 'desc')
        .first() || null;

      if (active_bom) {
        bom_lines = await this.db('bom_lines')
          .where({ bom_header_id: active_bom.id, 'bom_lines.company_id': companyId, 'bom_lines.is_deleted': false })
          .leftJoin('items', 'bom_lines.component_item_id', 'items.id')
          .leftJoin('products as sub_product', 'bom_lines.component_product_id', 'sub_product.id')
          .leftJoin('units_of_measurement as uom', 'bom_lines.uom_id', 'uom.id')
          .select(
            'bom_lines.*',
            'items.item_code',
            'items.name as item_name',
            'sub_product.product_code',
            'sub_product.name as sub_product_name',
            'uom.code as uom_code'
          )
          .orderBy('bom_lines.line_number');
      }

      // Get all BOM versions
      bom_versions = await this.db('bom_headers')
        .where({ product_id: id, company_id: companyId, is_deleted: false })
        .select('id', 'bom_code', 'bom_version', 'status', 'effective_from', 'effective_to')
        .orderBy('bom_version', 'desc');
    } catch {
      // Gracefully handle BOM query failures — product details should still load
    }

    return { ...product, active_bom, bom_lines, bom_versions };
  }

  async listProducts(options: ListOptions & { product_type?: string; category_id?: string }) {
    const { product_type, category_id, ...baseOptions } = options;
    const filters: Record<string, any> = {};
    if (product_type) filters.product_type = product_type;
    if (category_id) filters.category_id = category_id;

    return this.list({
      ...baseOptions,
      searchFields: ['name', 'product_code', 'hsn_code', 'description'],
      filters,
    });
  }

  async updateProduct(id: string, companyId: string, data: Partial<CreateProductInput>, userId?: string) {
    return this.update(id, companyId, data, userId);
  }
}

export const productService = new ProductService();
