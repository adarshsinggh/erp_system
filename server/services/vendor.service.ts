import { BaseService, ListOptions } from './base.service';

export interface CreateVendorInput {
  company_id: string;
  vendor_code: string;
  vendor_type?: 'company' | 'individual';
  name: string;
  display_name?: string;
  gstin?: string;
  pan?: string;
  msme_registered?: boolean;
  msme_number?: string;
  payment_terms_days?: number;
  currency_code?: string;
  is_preferred?: boolean;
  tds_applicable?: boolean;
  tds_section?: string;
  tds_rate?: number;
  opening_balance?: number;
  opening_balance_type?: 'debit' | 'credit';
  status?: string;
  tags?: string[];
  contact_persons?: { name: string; designation?: string; phone?: string; mobile?: string; email?: string; is_primary?: boolean }[];
  addresses?: { address_type?: string; label?: string; address_line1: string; address_line2?: string; city: string; state: string; pincode: string; phone?: string; is_default?: boolean }[];
  created_by?: string;
}

class VendorService extends BaseService {
  constructor() {
    super('vendors');
  }

  async createVendor(input: CreateVendorInput) {
    const { contact_persons, addresses, ...vendorData } = input;

    return await this.db.transaction(async (trx) => {
      const [vendor] = await trx('vendors').insert(vendorData).returning('*');

      let contacts: any[] = [];
      if (contact_persons && contact_persons.length > 0) {
        contacts = await trx('contact_persons')
          .insert(contact_persons.map((cp) => ({
            company_id: input.company_id,
            entity_type: 'vendor',
            entity_id: vendor.id,
            ...cp,
          })))
          .returning('*');
      }

      let addrs: any[] = [];
      if (addresses && addresses.length > 0) {
        addrs = await trx('addresses')
          .insert(addresses.map((addr) => ({
            company_id: input.company_id,
            entity_type: 'vendor',
            entity_id: vendor.id,
            country: 'India',
            ...addr,
          })))
          .returning('*');
      }

      return { ...vendor, contact_persons: contacts, addresses: addrs };
    });
  }

  async getVendorWithDetails(id: string, companyId: string) {
    const vendor = await this.getById(id, companyId);
    if (!vendor) return null;

    const contact_persons = await this.db('contact_persons')
      .where({ entity_type: 'vendor', entity_id: id, company_id: companyId, is_deleted: false });

    const addresses = await this.db('addresses')
      .where({ entity_type: 'vendor', entity_id: id, company_id: companyId, is_deleted: false });

    // Get items this vendor supplies
    let supplied_items: any[] = [];
    try {
      supplied_items = await this.db('item_vendor_mapping')
        .where({ vendor_id: id, company_id: companyId, is_deleted: false, is_active: true })
        .leftJoin('items', 'item_vendor_mapping.item_id', 'items.id')
        .select(
          'item_vendor_mapping.*',
          'items.item_code',
          'items.name as item_name'
        );
    } catch {
      // item_vendor_mapping query may fail if no mappings exist — gracefully return empty
    }

    return { ...vendor, contact_persons, addresses, supplied_items };
  }

  async listVendors(options: ListOptions) {
    return this.list({
      ...options,
      searchFields: ['name', 'display_name', 'vendor_code', 'gstin'],
    });
  }

  async updateVendor(id: string, companyId: string, data: any, userId?: string) {
    const { contact_persons, addresses, ...vendorData } = data;
    return this.update(id, companyId, vendorData, userId);
  }

  // Item-Vendor mapping
  async mapItemToVendor(companyId: string, data: {
    item_id: string;
    vendor_id: string;
    vendor_item_code?: string;
    vendor_price?: number;
    lead_time_days?: number;
    minimum_order_qty?: number;
    priority?: number;
  }) {
    const [mapping] = await this.db('item_vendor_mapping')
      .insert({ company_id: companyId, ...data })
      .returning('*');
    return mapping;
  }

  async updateItemVendorMapping(id: string, companyId: string, data: any) {
    const [updated] = await this.db('item_vendor_mapping')
      .where({ id, company_id: companyId, is_deleted: false })
      .update(data)
      .returning('*');
    return updated;
  }

  async removeItemVendorMapping(id: string, companyId: string) {
    return this.db('item_vendor_mapping')
      .where({ id, company_id: companyId })
      .update({ is_deleted: true, deleted_at: this.db.fn.now() });
  }
}

export const vendorService = new VendorService();
