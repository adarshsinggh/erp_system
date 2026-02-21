import { BaseService, ListOptions } from './base.service';

export interface CreateBomInput {
  company_id: string;
  product_id: string;
  bom_code?: string;
  bom_version?: number;
  description?: string;
  output_quantity: number;
  output_uom_id?: string;
  expected_yield_pct?: number;
  effective_from?: string;
  effective_to?: string;
  lines: BomLineInput[];
  created_by?: string;
}

export interface BomLineInput {
  line_number: number;
  component_type: 'item' | 'product';
  component_item_id?: string;
  component_product_id?: string;
  quantity: number;
  uom_id: string;
  wastage_pct?: number;
  is_critical?: boolean;
  notes?: string;
}

class BomService extends BaseService {
  constructor() {
    super('bom_headers');
  }

  async createBom(input: CreateBomInput) {
    const { lines, ...headerData } = input;

    // Auto-populate output_uom_id from the product if not provided
    if (!headerData.output_uom_id) {
      const product = await this.db('products')
        .where({ id: input.product_id, company_id: input.company_id, is_deleted: false })
        .select('primary_uom_id')
        .first();
      if (product?.primary_uom_id) {
        headerData.output_uom_id = product.primary_uom_id;
      }
    }

    // Auto-generate bom_code if not provided
    if (!headerData.bom_code) {
      const product = await this.db('products')
        .where({ id: input.product_id })
        .select('product_code')
        .first();
      headerData.bom_code = `BOM-${product?.product_code || 'NEW'}`;
    }

    return await this.db.transaction(async (trx) => {
      // Auto-determine version
      const latestVersion = await trx('bom_headers')
        .where({ product_id: input.product_id, company_id: input.company_id, is_deleted: false })
        .max('bom_version as max_version')
        .first();

      const nextVersion = (latestVersion?.max_version || 0) + 1;

      const [header] = await trx('bom_headers')
        .insert({
          ...headerData,
          bom_version: nextVersion,
          status: 'draft',
        })
        .returning('*');

      // Insert lines
      const bomLines = await trx('bom_lines')
        .insert(
          lines.map((line) => ({
            company_id: input.company_id,
            bom_header_id: header.id,
            ...line,
          }))
        )
        .returning('*');

      return { ...header, lines: bomLines };
    });
  }

  async getBomWithLines(id: string, companyId: string) {
    const header = await this.getById(id, companyId);
    if (!header) return null;

    const lines = await this.db('bom_lines')
      .where({ bom_header_id: id, company_id: companyId, is_deleted: false })
      .leftJoin('items', 'bom_lines.component_item_id', 'items.id')
      .leftJoin('products as sub_product', 'bom_lines.component_product_id', 'sub_product.id')
      .leftJoin('units_of_measurement as uom', 'bom_lines.uom_id', 'uom.id')
      .select(
        'bom_lines.*',
        'items.item_code',
        'items.name as item_name',
        'items.purchase_price as item_cost',
        'sub_product.product_code',
        'sub_product.name as sub_product_name',
        'sub_product.standard_cost as sub_product_cost',
        'uom.code as uom_code'
      )
      .orderBy('bom_lines.line_number');

    // Calculate total cost
    let total_material_cost = 0;
    for (const line of lines) {
      const unitCost = line.component_type === 'item'
        ? (parseFloat(line.item_cost) || 0)
        : (parseFloat(line.sub_product_cost) || 0);
      const qty = parseFloat(line.quantity) || 0;
      const wastage = parseFloat(line.wastage_pct) || 0;
      total_material_cost += unitCost * qty * (1 + wastage / 100);
    }

    // Get product info
    const product = await this.db('products')
      .where({ id: header.product_id })
      .select('product_code', 'name')
      .first();

    return { ...header, product, lines, total_material_cost };
  }

  async listBoms(options: ListOptions & { product_id?: string; status?: string }) {
    const { product_id, ...baseOptions } = options;
    const filters: Record<string, any> = {};
    if (product_id) filters.product_id = product_id;

    const result = await this.list({
      ...baseOptions,
      searchFields: ['bom_code', 'description'],
      filters,
      sortBy: 'bom_version',
    });

    // Enrich with product names
    if (result.data.length > 0) {
      const productIds = [...new Set(result.data.map((b: any) => b.product_id))];
      const products = await this.db('products')
        .whereIn('id', productIds)
        .select('id', 'product_code', 'name');

      const productMap = new Map(products.map((p: any) => [p.id, p]));
      result.data = result.data.map((bom: any) => ({
        ...bom,
        product: productMap.get(bom.product_id),
      }));
    }

    return result;
  }

  async activateBom(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      // Get this BOM to find its product
      const bom = await trx('bom_headers')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!bom) throw new Error('BOM not found');
      if (bom.status === 'active') throw new Error('BOM is already active');

      // Deactivate other active BOMs for the same product
      await trx('bom_headers')
        .where({ product_id: bom.product_id, company_id: companyId, status: 'active', is_deleted: false })
        .whereNot({ id })
        .update({ status: 'obsolete', updated_by: userId });

      // Activate this BOM
      const [activated] = await trx('bom_headers')
        .where({ id })
        .update({
          status: 'active',
          approved_by: userId,
          approved_at: trx.fn.now(),
          updated_by: userId,
        })
        .returning('*');

      return activated;
    });
  }

  async obsoleteBom(id: string, companyId: string, userId: string) {
    return this.update(id, companyId, { status: 'obsolete' }, userId);
  }

  // Update BOM lines (replace all lines)
  async updateBomLines(bomId: string, companyId: string, lines: BomLineInput[], userId?: string) {
    return await this.db.transaction(async (trx) => {
      // Soft delete existing lines
      await trx('bom_lines')
        .where({ bom_header_id: bomId, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      // Insert new lines
      const newLines = await trx('bom_lines')
        .insert(
          lines.map((line) => ({
            company_id: companyId,
            bom_header_id: bomId,
            ...line,
          }))
        )
        .returning('*');

      return newLines;
    });
  }
}

export const bomService = new BomService();
