import { BaseService, ListOptions } from './base.service';

// ============================================================
// Category Service
// ============================================================

class CategoryService extends BaseService {
  constructor() {
    super('item_categories');
  }

  async listCategories(companyId: string) {
    return this.db('item_categories')
      .where({ company_id: companyId, is_deleted: false })
      .orderBy('name');
  }

  async createCategory(companyId: string, data: { name: string; code?: string; parent_id?: string; description?: string }, userId?: string) {
    return this.create({ company_id: companyId, ...data, created_by: userId });
  }
}

// ============================================================
// UOM Service
// ============================================================

class UomService extends BaseService {
  constructor() {
    super('units_of_measurement');
  }

  async listUoms(companyId: string) {
    return this.db('units_of_measurement')
      .where({ company_id: companyId, is_deleted: false })
      .orderBy('category')
      .orderBy('name');
  }

  async createUom(companyId: string, data: { code: string; name: string; category?: string; decimal_places?: number }, userId?: string) {
    return this.create({ company_id: companyId, ...data, created_by: userId });
  }

  async getConversions(companyId: string) {
    return this.db('uom_conversions')
      .where({ company_id: companyId, is_deleted: false, is_active: true })
      .join('units_of_measurement as from_uom', 'uom_conversions.from_uom_id', 'from_uom.id')
      .join('units_of_measurement as to_uom', 'uom_conversions.to_uom_id', 'to_uom.id')
      .select(
        'uom_conversions.*',
        'from_uom.code as from_code',
        'from_uom.name as from_name',
        'to_uom.code as to_code',
        'to_uom.name as to_name'
      );
  }

  async addConversion(companyId: string, data: { from_uom_id: string; to_uom_id: string; conversion_factor: number }) {
    const [conv] = await this.db('uom_conversions')
      .insert({ company_id: companyId, ...data })
      .returning('*');
    return conv;
  }
}

// ============================================================
// Brand Service
// ============================================================

class BrandService extends BaseService {
  constructor() {
    super('brands');
  }

  async listBrands(companyId: string) {
    return this.db('brands')
      .where({ company_id: companyId, is_deleted: false })
      .leftJoin('manufacturers', 'brands.manufacturer_id', 'manufacturers.id')
      .select('brands.*', 'manufacturers.name as manufacturer_name')
      .orderBy('brands.name');
  }

  async createBrand(companyId: string, data: { name: string; code?: string; manufacturer_id?: string }, userId?: string) {
    return this.create({ company_id: companyId, ...data, created_by: userId });
  }
}

// ============================================================
// Manufacturer Service
// ============================================================

class ManufacturerService extends BaseService {
  constructor() {
    super('manufacturers');
  }

  async listManufacturers(companyId: string) {
    return this.db('manufacturers')
      .where({ company_id: companyId, is_deleted: false })
      .orderBy('name');
  }

  async createManufacturer(companyId: string, data: { name: string; code?: string; country?: string; website?: string }, userId?: string) {
    return this.create({ company_id: companyId, ...data, created_by: userId });
  }
}

// ============================================================
// Tax Service
// ============================================================

class TaxService extends BaseService {
  constructor() {
    super('tax_masters');
  }

  async listTaxes(companyId: string, taxType?: string) {
    let query = this.db('tax_masters')
      .where({ company_id: companyId, is_deleted: false, is_active: true });
    if (taxType) query = query.where('tax_type', taxType);
    return query.orderBy('rate');
  }

  async createTax(companyId: string, data: {
    tax_name: string; tax_type: string; rate: number;
    cgst_rate?: number; sgst_rate?: number; igst_rate?: number; cess_rate?: number;
  }, userId?: string) {
    return this.create({ company_id: companyId, ...data, created_by: userId });
  }
}

// ============================================================
// Location Definitions Service
// ============================================================

class LocationService extends BaseService {
  constructor() {
    super('location_definitions');
  }

  async listLocations(companyId: string, branchId?: string) {
    let query = this.db('location_definitions')
      .where({ company_id: companyId, is_deleted: false });
    if (branchId) query = query.where('branch_id', branchId);
    return query.orderBy('name');
  }

  async createLocation(companyId: string, data: { branch_id: string; code: string; name: string; description?: string }, userId?: string) {
    return this.create({ company_id: companyId, ...data, created_by: userId });
  }
}

export const categoryService = new CategoryService();
export const uomService = new UomService();
export const brandService = new BrandService();
export const manufacturerService = new ManufacturerService();
export const taxService = new TaxService();
export const locationService = new LocationService();
