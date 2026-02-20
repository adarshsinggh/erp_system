// =============================================================
// File: server/services/sync.service.ts
// Module: Sync & Multi-Device — Phase 15 (Step 50)
// Description:
//   - Delta sync: pull changed rows since last sync timestamp
//   - Push changes from client devices with conflict detection
//   - Conflict resolution (last-write-wins with version check)
//   - Device registration and tracking
//   - Sync status management across all tables
//   - Bulk sync for initial setup of new client machines
//
// Architecture:
//   Machine 1 = Server (PostgreSQL + Fastify + UI)
//   Machines 2-4 = Clients (UI only, REST calls to server)
//   All writes go to server. Clients pull delta changes.
//   Future: Cloud sync endpoint for mobile / remote access.
// =============================================================

import { BaseService } from './base.service';
import { Knex } from 'knex';

// ─────────────────────────────────────────────────────────────
// All syncable tables in the system
// ─────────────────────────────────────────────────────────────

const SYNCABLE_TABLES = [
  // Company & Setup
  'companies', 'financial_years', 'branches', 'warehouses',
  // Users & Access
  'roles', 'permissions', 'role_permissions', 'field_permissions', 'users', 'user_sessions',
  // Master Data
  'customers', 'vendors', 'contact_persons', 'addresses', 'manufacturers', 'brands',
  // Items & Products
  'item_categories', 'units_of_measurement', 'uom_conversions', 'items', 'products',
  'location_definitions', 'item_vendor_mapping', 'item_alternatives',
  // BOM
  'bom_headers', 'bom_lines',
  // Tax & Numbering
  'tax_masters', 'document_sequences',
  // Sales
  'sales_quotations', 'sales_quotation_lines', 'sales_orders', 'sales_order_lines',
  'sales_invoices', 'sales_invoice_lines', 'credit_notes',
  // Purchase
  'purchase_requisitions', 'purchase_requisition_lines',
  'purchase_orders', 'purchase_order_lines',
  'goods_receipt_notes', 'grn_lines',
  'vendor_bills', 'vendor_bill_lines', 'debit_notes',
  // Inventory
  'stock_ledger', 'stock_summary', 'stock_batches', 'stock_reservations',
  'stock_transfers', 'stock_transfer_lines',
  'stock_adjustments', 'stock_adjustment_lines',
  'delivery_challans', 'delivery_challan_lines',
  // Manufacturing
  'work_orders', 'work_order_materials', 'production_entries', 'scrap_entries',
  // Finance
  'chart_of_accounts', 'ledger_entries', 'payment_receipts', 'payment_made',
  'bank_accounts', 'bank_reconciliation',
  // Approvals
  'approval_matrix', 'approval_queue',
  // Alerts
  'alert_rules', 'notifications', 'scheduled_tasks',
  // Audit & System (selectively)
  'document_links', 'custom_field_definitions', 'custom_field_values',
  'entity_notes', 'entity_attachments', 'entity_activity', 'backup_history',
] as const;

// Tables with company_id column (almost all)
const COMPANY_SCOPED_TABLES = new Set(SYNCABLE_TABLES);

// ─────────────────────────────────────────────────────────────

interface SyncPullRequest {
  device_id: string;
  last_synced_at?: string;  // ISO timestamp — pull everything after this
  tables?: string[];        // Optional: specific tables to pull
  page_size?: number;       // Rows per table per request
}

interface SyncPushRequest {
  device_id: string;
  changes: {
    table_name: string;
    rows: Record<string, any>[];
  }[];
}

interface ConflictRecord {
  table_name: string;
  record_id: string;
  server_version: number;
  client_version: number;
  resolution: 'server_wins' | 'client_wins';
  server_data: Record<string, any>;
  client_data: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────

class SyncService extends BaseService {
  constructor() {
    super('companies');
  }

  // ═══════════════════════════════════════════════════════════
  // DEVICE REGISTRATION
  // ═══════════════════════════════════════════════════════════

  /**
   * Register a client device for sync tracking
   */
  async registerDevice(companyId: string, deviceInfo: {
    device_id: string;
    device_name: string;
    device_type: 'server' | 'client' | 'mobile';
    ip_address?: string;
  }, userId: string) {
    // Store in companies.metadata.devices[]
    const company = await this.db('companies').where({ id: companyId }).first();
    const metadata = company?.metadata || {};
    const devices: any[] = metadata.devices || [];

    const existingIdx = devices.findIndex((d: any) => d.device_id === deviceInfo.device_id);
    const deviceRecord = {
      ...deviceInfo,
      registered_by: userId,
      registered_at: existingIdx >= 0 ? devices[existingIdx].registered_at : new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      is_active: true,
    };

    if (existingIdx >= 0) {
      devices[existingIdx] = { ...devices[existingIdx], ...deviceRecord };
    } else {
      devices.push(deviceRecord);
    }

    await this.db('companies')
      .where({ id: companyId })
      .update({ metadata: JSON.stringify({ ...metadata, devices }) });

    return deviceRecord;
  }

  /**
   * List registered devices
   */
  async listDevices(companyId: string) {
    const company = await this.db('companies').where({ id: companyId }).first();
    return (company?.metadata?.devices || []) as any[];
  }

  /**
   * Deactivate a device
   */
  async deactivateDevice(companyId: string, deviceId: string) {
    const company = await this.db('companies').where({ id: companyId }).first();
    const metadata = company?.metadata || {};
    const devices: any[] = metadata.devices || [];

    const idx = devices.findIndex((d: any) => d.device_id === deviceId);
    if (idx < 0) throw new Error('Device not found');

    devices[idx].is_active = false;
    devices[idx].deactivated_at = new Date().toISOString();

    await this.db('companies')
      .where({ id: companyId })
      .update({ metadata: JSON.stringify({ ...metadata, devices }) });

    return { success: true, message: 'Device deactivated' };
  }

  // ═══════════════════════════════════════════════════════════
  // PULL — Client fetches changes from server
  // Delta sync: rows where updated_at > last_synced_at
  // ═══════════════════════════════════════════════════════════

  async pull(companyId: string, request: SyncPullRequest) {
    const { device_id, last_synced_at, tables, page_size = 500 } = request;
    const syncTimestamp = new Date().toISOString();
    const tablesToSync = tables?.length
      ? tables.filter(t => SYNCABLE_TABLES.includes(t as any))
      : [...SYNCABLE_TABLES];

    const result: Record<string, { rows: any[]; count: number; has_more: boolean }> = {};
    let totalRows = 0;

    for (const table of tablesToSync) {
      try {
        let query = this.db(table);

        // Scope by company
        if (COMPANY_SCOPED_TABLES.has(table as any)) {
          query = query.where('company_id', companyId);
        }

        // Delta: only rows changed since last sync
        if (last_synced_at) {
          query = query.where('updated_at', '>', last_synced_at);
        }

        // Order by version for consistent processing
        query = query.orderBy('version', 'asc').limit(page_size + 1);

        const rows = await query.select('*');
        const hasMore = rows.length > page_size;
        const returnRows = hasMore ? rows.slice(0, page_size) : rows;

        if (returnRows.length > 0) {
          result[table] = {
            rows: returnRows,
            count: returnRows.length,
            has_more: hasMore,
          };
          totalRows += returnRows.length;
        }
      } catch {
        // Table might not exist yet (migration pending) — skip silently
      }
    }

    // Update device last_seen
    await this._updateDeviceLastSeen(companyId, device_id);

    return {
      sync_timestamp: syncTimestamp,
      device_id,
      last_synced_at: last_synced_at || null,
      tables_synced: Object.keys(result).length,
      total_rows: totalRows,
      data: result,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PUSH — Client sends changes to server
  // Version-based conflict detection
  // ═══════════════════════════════════════════════════════════

  async push(companyId: string, request: SyncPushRequest, userId: string) {
    const { device_id, changes } = request;
    const conflicts: ConflictRecord[] = [];
    let applied = 0;
    let skipped = 0;

    for (const batch of changes) {
      const { table_name, rows } = batch;

      if (!SYNCABLE_TABLES.includes(table_name as any)) {
        skipped += rows.length;
        continue;
      }

      for (const row of rows) {
        const recordId = row.id;
        if (!recordId) { skipped++; continue; }

        await this.db.transaction(async (trx: Knex.Transaction) => {
          // Check if record exists on server
          const serverRow = await trx(table_name)
            .where({ id: recordId })
            .first();

          if (!serverRow) {
            // New record — insert
            await trx(table_name).insert({
              ...row,
              company_id: companyId,
              device_id,
              sync_status: 'synced',
              last_synced_at: trx.fn.now(),
            });
            applied++;
          } else {
            // Existing — check version for conflict
            const clientVersion = row.version || 1;
            const serverVersion = serverRow.version || 1;

            if (clientVersion >= serverVersion) {
              // Client is same or newer — apply update
              const { id, created_at, ...updateData } = row;
              await trx(table_name)
                .where({ id: recordId })
                .update({
                  ...updateData,
                  device_id,
                  sync_status: 'synced',
                  last_synced_at: trx.fn.now(),
                  updated_by: userId,
                });
              applied++;
            } else {
              // Conflict: server has newer version — server wins
              conflicts.push({
                table_name,
                record_id: recordId,
                server_version: serverVersion,
                client_version: clientVersion,
                resolution: 'server_wins',
                server_data: serverRow,
                client_data: row,
              });
              skipped++;
            }
          }
        });
      }
    }

    // Update device last_seen
    await this._updateDeviceLastSeen(companyId, device_id);

    return {
      device_id,
      applied,
      skipped,
      conflicts_count: conflicts.length,
      conflicts,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SYNC STATUS MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  /**
   * Mark rows as synced after successful pull by client
   */
  async markSynced(companyId: string, confirmations: {
    table_name: string;
    record_ids: string[];
  }[]) {
    let totalMarked = 0;

    for (const batch of confirmations) {
      if (!SYNCABLE_TABLES.includes(batch.table_name as any)) continue;

      const count = await this.db(batch.table_name)
        .where('company_id', companyId)
        .whereIn('id', batch.record_ids)
        .update({
          sync_status: 'synced',
          last_synced_at: this.db.fn.now(),
        });

      totalMarked += count;
    }

    return { marked_count: totalMarked };
  }

  /**
   * Get pending sync count per table
   */
  async getSyncStatus(companyId: string) {
    const results: Record<string, { pending: number; conflict: number }> = {};

    for (const table of SYNCABLE_TABLES) {
      try {
        const counts = await this.db(table)
          .where('company_id', companyId)
          .select(
            this.db.raw("COUNT(*) FILTER (WHERE sync_status = 'pending') as pending"),
            this.db.raw("COUNT(*) FILTER (WHERE sync_status = 'conflict') as conflict")
          )
          .first();

        const pending = parseInt(String(counts?.pending || '0'), 10);
        const conflict = parseInt(String(counts?.conflict || '0'), 10);

        if (pending > 0 || conflict > 0) {
          results[table] = { pending, conflict };
        }
      } catch {
        // Table may not exist — skip
      }
    }

    const totals = Object.values(results).reduce(
      (acc, v) => ({ pending: acc.pending + v.pending, conflict: acc.conflict + v.conflict }),
      { pending: 0, conflict: 0 }
    );

    return { tables: results, totals };
  }

  /**
   * Resolve a conflict manually
   */
  async resolveConflict(companyId: string, tableName: string, recordId: string,
    resolution: 'keep_server' | 'keep_client', clientData?: Record<string, any>, userId?: string
  ) {
    if (!SYNCABLE_TABLES.includes(tableName as any)) {
      throw new Error('Invalid table name');
    }

    if (resolution === 'keep_server') {
      // Just mark as synced — server version stays
      await this.db(tableName)
        .where({ id: recordId, company_id: companyId })
        .update({ sync_status: 'synced', last_synced_at: this.db.fn.now() });

      return { resolution: 'keep_server', record_id: recordId };
    }

    if (resolution === 'keep_client' && clientData) {
      // Overwrite with client data
      const { id, created_at, ...updateData } = clientData;
      await this.db(tableName)
        .where({ id: recordId, company_id: companyId })
        .update({
          ...updateData,
          sync_status: 'synced',
          last_synced_at: this.db.fn.now(),
          updated_by: userId,
        });

      return { resolution: 'keep_client', record_id: recordId };
    }

    throw new Error('keep_client resolution requires clientData');
  }

  // ═══════════════════════════════════════════════════════════
  // INITIAL SYNC — Full data dump for new client setup
  // ═══════════════════════════════════════════════════════════

  async initialSync(companyId: string, deviceId: string, options: {
    tables?: string[];
    batch_size?: number;
    offset?: number;
  } = {}) {
    const { tables, batch_size = 1000, offset = 0 } = options;
    const tablesToSync = tables?.length
      ? tables.filter(t => SYNCABLE_TABLES.includes(t as any))
      : [...SYNCABLE_TABLES];

    const result: Record<string, { rows: any[]; count: number; total: number }> = {};
    let totalRows = 0;

    for (const table of tablesToSync) {
      try {
        const total = await this.db(table)
          .where('company_id', companyId)
          .count('* as cnt')
          .first();

        const rows = await this.db(table)
          .where('company_id', companyId)
          .orderBy('created_at', 'asc')
          .limit(batch_size)
          .offset(offset)
          .select('*');

        if (rows.length > 0) {
          result[table] = {
            rows,
            count: rows.length,
            total: parseInt(String(total?.cnt || '0'), 10),
          };
          totalRows += rows.length;
        }
      } catch {
        // skip
      }
    }

    await this._updateDeviceLastSeen(companyId, deviceId);

    return {
      device_id: deviceId,
      batch_size,
      offset,
      tables_included: Object.keys(result).length,
      total_rows: totalRows,
      data: result,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // HEARTBEAT — Client pings server to confirm connectivity
  // ═══════════════════════════════════════════════════════════

  async heartbeat(companyId: string, deviceId: string) {
    await this._updateDeviceLastSeen(companyId, deviceId);

    return {
      server_time: new Date().toISOString(),
      status: 'online',
      device_id: deviceId,
    };
  }

  // ─── Private ───

  private async _updateDeviceLastSeen(companyId: string, deviceId: string) {
    try {
      const company = await this.db('companies').where({ id: companyId }).first();
      const metadata = company?.metadata || {};
      const devices: any[] = metadata.devices || [];
      const idx = devices.findIndex((d: any) => d.device_id === deviceId);

      if (idx >= 0) {
        devices[idx].last_seen_at = new Date().toISOString();
        await this.db('companies')
          .where({ id: companyId })
          .update({ metadata: JSON.stringify({ ...metadata, devices }) });
      }
    } catch {
      // Non-critical — don't fail sync over device tracking
    }
  }
}

export const syncService = new SyncService();