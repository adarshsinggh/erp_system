import { Knex } from 'knex';
import { getDb } from '../database/connection';

export interface ListOptions {
  companyId: string;
  page?: number;
  limit?: number;
  search?: string;
  searchFields?: string[];
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, any>;
}

export class BaseService {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  protected get db(): Knex {
    return getDb();
  }

  async getById(id: string, companyId: string) {
    return await this.db(this.tableName)
      .where({ id, company_id: companyId, is_deleted: false })
      .first();
  }

  async list(options: ListOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      searchFields = ['name'],
      status,
      sortBy = 'created_at',
      sortOrder = 'desc',
      filters = {},
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db(this.tableName)
      .where({ company_id: companyId, is_deleted: false });

    // Apply status filter
    if (status) {
      query = query.where('status', status);
    }

    // Apply additional filters
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        query = query.where(key, value);
      }
    }

    // Apply search
    if (search && searchFields.length > 0) {
      query = query.where(function () {
        for (const field of searchFields) {
          this.orWhereILike(field, `%${search}%`);
        }
      });
    }

    // Get total count
    const countQuery = query.clone().count('id as total').first();
    const countResult = await countQuery;
    const total = parseInt(String(countResult?.total || '0'), 10);

    // Get paginated data
    const data = await query
      .orderBy(sortBy, sortOrder)
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: Record<string, any>) {
    const [record] = await this.db(this.tableName).insert(data).returning('*');
    return record;
  }

  async update(id: string, companyId: string, data: Record<string, any>, userId?: string) {
    const updateData = { ...data };
    if (userId) updateData.updated_by = userId;

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.company_id;
    delete updateData.created_at;
    delete updateData.created_by;

    const [updated] = await this.db(this.tableName)
      .where({ id, company_id: companyId, is_deleted: false })
      .update(updateData)
      .returning('*');

    return updated;
  }

  async softDelete(id: string, companyId: string, userId?: string) {
    const [deleted] = await this.db(this.tableName)
      .where({ id, company_id: companyId, is_deleted: false })
      .update({
        is_deleted: true,
        deleted_at: this.db.fn.now(),
        deleted_by: userId,
      })
      .returning('*');

    return deleted;
  }
}
