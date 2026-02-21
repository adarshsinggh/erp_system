import { BaseService, ListOptions } from './base.service';

export interface CreateCustomerInput {
  company_id: string;
  customer_code: string;
  customer_type?: 'company' | 'individual';
  name: string;
  display_name?: string;
  gstin?: string;
  pan?: string;
  tan?: string;
  credit_limit?: number;
  payment_terms_days?: number;
  currency_code?: string;
  tds_applicable?: boolean;
  tds_section?: string;
  tds_rate?: number;
  opening_balance?: number;
  opening_balance_type?: 'debit' | 'credit';
  status?: string;
  tags?: string[];
  // Nested
  contact_persons?: ContactPersonInput[];
  addresses?: AddressInput[];
  created_by?: string;
}

export interface ContactPersonInput {
  name: string;
  designation?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  is_primary?: boolean;
}

export interface AddressInput {
  address_type?: 'billing' | 'shipping';
  label?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  phone?: string;
  is_default?: boolean;
}

class CustomerService extends BaseService {
  constructor() {
    super('customers');
  }

  async generateCustomerCode(companyId: string): Promise<string> {
    const result = await this.db('customers')
      .where({ company_id: companyId })
      .whereRaw("customer_code LIKE 'CUST-%'")
      .max('customer_code as max_code')
      .first();

    let nextNumber = 1;
    if (result?.max_code) {
      const match = result.max_code.match(/CUST-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `CUST-${String(nextNumber).padStart(4, '0')}`;
  }

  async createCustomer(input: CreateCustomerInput) {
    const { contact_persons, addresses, ...customerData } = input;

    // Auto-generate customer_code if not provided
    if (!customerData.customer_code) {
      customerData.customer_code = await this.generateCustomerCode(customerData.company_id);
    }

    return await this.db.transaction(async (trx) => {
      // Create customer
      const [customer] = await trx('customers').insert(customerData).returning('*');

      // Create contact persons
      let contacts: any[] = [];
      if (contact_persons && contact_persons.length > 0) {
        contacts = await trx('contact_persons')
          .insert(
            contact_persons.map((cp) => ({
              company_id: input.company_id,
              entity_type: 'customer',
              entity_id: customer.id,
              ...cp,
            }))
          )
          .returning('*');
      }

      // Create addresses
      let addrs: any[] = [];
      if (addresses && addresses.length > 0) {
        addrs = await trx('addresses')
          .insert(
            addresses.map((addr) => ({
              company_id: input.company_id,
              entity_type: 'customer',
              entity_id: customer.id,
              country: 'India',
              ...addr,
            }))
          )
          .returning('*');
      }

      return { ...customer, contact_persons: contacts, addresses: addrs };
    });
  }

  async getCustomerWithDetails(id: string, companyId: string) {
    const customer = await this.getById(id, companyId);
    if (!customer) return null;

    const contact_persons = await this.db('contact_persons')
      .where({ entity_type: 'customer', entity_id: id, company_id: companyId, is_deleted: false });

    const addresses = await this.db('addresses')
      .where({ entity_type: 'customer', entity_id: id, company_id: companyId, is_deleted: false });

    return { ...customer, contact_persons, addresses };
  }

  async listCustomers(options: ListOptions) {
    return this.list({
      ...options,
      searchFields: ['name', 'display_name', 'customer_code', 'gstin'],
    });
  }

  async updateCustomer(id: string, companyId: string, data: any, userId?: string) {
    const { contact_persons, addresses, ...customerData } = data;
    return this.update(id, companyId, customerData, userId);
  }

  // Contact person CRUD
  async addContactPerson(companyId: string, customerId: string, input: ContactPersonInput) {
    const [contact] = await this.db('contact_persons')
      .insert({
        company_id: companyId,
        entity_type: 'customer',
        entity_id: customerId,
        ...input,
      })
      .returning('*');
    return contact;
  }

  async updateContactPerson(id: string, companyId: string, data: Partial<ContactPersonInput>) {
    const [updated] = await this.db('contact_persons')
      .where({ id, company_id: companyId, is_deleted: false })
      .update(data)
      .returning('*');
    return updated;
  }

  async deleteContactPerson(id: string, companyId: string) {
    return this.db('contact_persons')
      .where({ id, company_id: companyId })
      .update({ is_deleted: true, deleted_at: this.db.fn.now() });
  }

  // Address CRUD
  async addAddress(companyId: string, customerId: string, input: AddressInput) {
    const [address] = await this.db('addresses')
      .insert({
        company_id: companyId,
        entity_type: 'customer',
        entity_id: customerId,
        country: 'India',
        ...input,
      })
      .returning('*');
    return address;
  }

  async updateAddress(id: string, companyId: string, data: Partial<AddressInput>) {
    const [updated] = await this.db('addresses')
      .where({ id, company_id: companyId, is_deleted: false })
      .update(data)
      .returning('*');
    return updated;
  }

  async deleteAddress(id: string, companyId: string) {
    return this.db('addresses')
      .where({ id, company_id: companyId })
      .update({ is_deleted: true, deleted_at: this.db.fn.now() });
  }
}

export const customerService = new CustomerService();
