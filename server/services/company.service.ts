import { getDb } from '../database/connection';
import bcrypt from 'bcryptjs';

export interface CreateCompanyInput {
  name: string;
  display_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstin?: string;
  pan?: string;
  tan?: string;
  cin?: string;
  base_currency?: string;
  financial_year_start?: number;
  license_key?: string;
  license_tier?: 'starter' | 'professional' | 'enterprise';
}

export interface SetupCompanyInput {
  company: CreateCompanyInput;
  admin: {
    username: string;
    email: string;
    password: string;
    full_name: string;
    phone?: string;
  };
  branch: {
    name: string;
    code: string;
    city?: string;
    state?: string;
  };
  financial_year: {
    year_code: string;
    start_date: string;
    end_date: string;
  };
}

export class CompanyService {
  /**
   * Full company setup - creates everything in one transaction:
   * company, roles, branch, warehouse, financial year, admin user
   */
  async setupCompany(input: SetupCompanyInput) {
    const db = getDb();

    return await db.transaction(async (trx) => {
      // 1. Create company
      const [company] = await trx('companies')
        .insert({
          name: input.company.name,
          display_name: input.company.display_name || input.company.name,
          address_line1: input.company.address_line1,
          address_line2: input.company.address_line2,
          city: input.company.city,
          state: input.company.state,
          pincode: input.company.pincode,
          country: input.company.country || 'India',
          phone: input.company.phone,
          email: input.company.email,
          website: input.company.website,
          gstin: input.company.gstin || null,
          pan: input.company.pan || null,
          tan: input.company.tan,
          cin: input.company.cin,
          base_currency: input.company.base_currency || 'INR',
          financial_year_start: input.company.financial_year_start || 4,
          license_key: input.company.license_key,
          license_tier: input.company.license_tier || 'starter',
        })
        .returning('*');

      const companyId = company.id;

      // 2. Create default roles
      const roles = await trx('roles')
        .insert([
          { company_id: companyId, name: 'Admin', description: 'Full system access', hierarchy_level: 100, is_system_role: true },
          { company_id: companyId, name: 'Manager', description: 'Department manager with approval rights', hierarchy_level: 75, is_system_role: true },
          { company_id: companyId, name: 'Supervisor', description: 'Team supervisor', hierarchy_level: 50, is_system_role: true },
          { company_id: companyId, name: 'Operator', description: 'Data entry and basic operations', hierarchy_level: 25, is_system_role: true },
          { company_id: companyId, name: 'Viewer', description: 'Read-only access', hierarchy_level: 10, is_system_role: true },
        ])
        .returning('*');

      const adminRole = roles.find((r: any) => r.name === 'Admin');

      // 3. Create main branch
      const [branch] = await trx('branches')
        .insert({
          company_id: companyId,
          code: input.branch.code,
          name: input.branch.name,
          city: input.branch.city,
          state: input.branch.state,
          is_main_branch: true,
        })
        .returning('*');

      // 4. Create default warehouse
      const [warehouse] = await trx('warehouses')
        .insert({
          company_id: companyId,
          branch_id: branch.id,
          code: 'MAIN',
          name: 'Main Warehouse',
          warehouse_type: 'main',
          is_default: true,
        })
        .returning('*');

      // 5. Create financial year
      const [financialYear] = await trx('financial_years')
        .insert({
          company_id: companyId,
          year_code: input.financial_year.year_code,
          start_date: input.financial_year.start_date,
          end_date: input.financial_year.end_date,
          is_active: true,
        })
        .returning('*');

      // 6. Create admin user
      const passwordHash = await bcrypt.hash(input.admin.password, 12);
      const [adminUser] = await trx('users')
        .insert({
          company_id: companyId,
          username: input.admin.username,
          email: input.admin.email,
          password_hash: passwordHash,
          full_name: input.admin.full_name,
          role_id: adminRole.id,
          branch_id: branch.id,
          phone: input.admin.phone,
          is_active: true,
        })
        .returning(['id', 'username', 'email', 'full_name', 'role_id', 'branch_id']);

      return { company, branch, warehouse, financialYear, adminUser, roles };
    });
  }

  async getCompany(companyId: string) {
    const db = getDb();
    return await db('companies').where({ id: companyId, is_deleted: false }).first();
  }

  async listCompanies() {
    const db = getDb();
    return await db('companies').where({ is_deleted: false }).select('*').orderBy('name');
  }

  async updateCompany(companyId: string, data: Partial<CreateCompanyInput>, userId: string) {
    const db = getDb();
    const [updated] = await db('companies')
      .where({ id: companyId, is_deleted: false })
      .update({ ...data, updated_by: userId })
      .returning('*');
    return updated;
  }
}

export const companyService = new CompanyService();
