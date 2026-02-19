// =============================================================
// File: server/services/stock-transfer.service.ts
// Module: Inventory Management — Phase 7, Step 29
// Description: Stock Transfer service with header+lines CRUD,
//              auto document numbering, approval, dispatch
//              (deducts source warehouse stock via ledger engine),
//              receive (adds destination warehouse stock),
//              partial receiving, and cancel with stock reversal.
// =============================================================

import { Knex } from 'knex';
import { BaseService, ListOptions } from './base.service';
import { inventoryService, StockMovementInput } from './inventory.service';

// ────────────────────────────────────────────────────────────
// Interfaces
// ────────────────────────────────────────────────────────────

export interface StockTransferLineInput {
  line_number: number;
  item_id?: string;
  product_id?: string;
  quantity: number;
  uom_id: string;
  batch_id?: string;
  unit_cost?: number;
  remarks?: string;
}

export interface CreateStockTransferInput {
  company_id: string;
  transfer_date: string;
  from_branch_id: string;
  from_warehouse_id: string;
  to_branch_id: string;
  to_warehouse_id: string;
  transfer_type?: 'inter_warehouse' | 'inter_branch';
  reason?: string;
  metadata?: Record<string, any>;
  lines: StockTransferLineInput[];
  created_by?: string;
}

export interface UpdateStockTransferInput {
  transfer_date?: string;
  from_branch_id?: string;
  from_warehouse_id?: string;
  to_branch_id?: string;
  to_warehouse_id?: string;
  transfer_type?: 'inter_warehouse' | 'inter_branch';
  reason?: string;
  metadata?: Record<string, any>;
  lines?: StockTransferLineInput[];
  updated_by?: string;
}

export interface ReceiveLineInput {
  line_id: string;
  received_quantity: number;
  remarks?: string;
}

export interface ListStockTransfersOptions extends ListOptions {
  from_branch_id?: string;
  to_branch_id?: string;
  from_warehouse_id?: string;
  to_warehouse_id?: string;
  transfer_type?: string;
  from_date?: string;
  to_date?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function parseNum(val: any): number {
  return parseFloat(val) || 0;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

class StockTransferService extends BaseService {
  constructor() {
    super('stock_transfers');
  }

  // ──────── CREATE ────────

  async createTransfer(input: CreateStockTransferInput) {
    const { lines, ...headerInput } = input;

    if (!lines || lines.length === 0) {
      throw new Error('At least one line item is required');
    }

    return await this.db.transaction(async (trx) => {
      // Validate warehouses exist
      const fromWarehouse = await trx('warehouses')
        .where({ id: input.from_warehouse_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!fromWarehouse) throw new Error('Source warehouse not found');

      const toWarehouse = await trx('warehouses')
        .where({ id: input.to_warehouse_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!toWarehouse) throw new Error('Destination warehouse not found');

      // Validate source != destination
      if (input.from_warehouse_id === input.to_warehouse_id) {
        throw new Error('Source and destination warehouse cannot be the same');
      }

      // Validate branches exist
      const fromBranch = await trx('branches')
        .where({ id: input.from_branch_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!fromBranch) throw new Error('Source branch not found');

      const toBranch = await trx('branches')
        .where({ id: input.to_branch_id, company_id: input.company_id, is_deleted: false })
        .first();
      if (!toBranch) throw new Error('Destination branch not found');

      // Auto-detect transfer type if not provided
      let transferType = input.transfer_type;
      if (!transferType) {
        transferType = input.from_branch_id === input.to_branch_id
          ? 'inter_warehouse'
          : 'inter_branch';
      }

      // Validate type consistency
      if (transferType === 'inter_warehouse' && input.from_branch_id !== input.to_branch_id) {
        throw new Error('inter_warehouse transfer requires same branch for source and destination');
      }
      if (transferType === 'inter_branch' && input.from_branch_id === input.to_branch_id) {
        throw new Error('inter_branch transfer requires different branches');
      }

      // Generate document number
      const [numResult] = await trx.raw(
        `SELECT get_next_document_number(?, ?, 'stock_transfer') as doc_number`,
        [input.company_id, input.from_branch_id]
      );
      const transferNumber = numResult?.rows?.[0]?.doc_number || numResult?.[0]?.doc_number || numResult?.doc_number;
      if (!transferNumber) throw new Error('Failed to generate transfer number. Check document_sequences configuration.');

      // Validate lines — each must have item_id or product_id
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.item_id && !line.product_id) {
          throw new Error(`Line ${i + 1}: Either item_id or product_id is required`);
        }
        if (line.item_id) {
          const item = await trx('items')
            .where({ id: line.item_id, company_id: input.company_id, is_deleted: false })
            .first();
          if (!item) throw new Error(`Line ${i + 1}: Item not found: ${line.item_id}`);
        }
        if (line.product_id) {
          const product = await trx('products')
            .where({ id: line.product_id, company_id: input.company_id, is_deleted: false })
            .first();
          if (!product) throw new Error(`Line ${i + 1}: Product not found: ${line.product_id}`);
        }
      }

      // Insert header
      const [header] = await trx('stock_transfers')
        .insert({
          company_id: input.company_id,
          transfer_number: transferNumber,
          transfer_date: input.transfer_date,
          from_branch_id: input.from_branch_id,
          from_warehouse_id: input.from_warehouse_id,
          to_branch_id: input.to_branch_id,
          to_warehouse_id: input.to_warehouse_id,
          transfer_type: transferType,
          reason: input.reason || null,
          status: 'draft',
          metadata: input.metadata || {},
          created_by: input.created_by || null,
        })
        .returning('*');

      // Insert lines
      const lineInserts = lines.map((line) => ({
        company_id: input.company_id,
        transfer_id: header.id,
        line_number: line.line_number,
        item_id: line.item_id || null,
        product_id: line.product_id || null,
        quantity: line.quantity,
        received_quantity: 0,
        uom_id: line.uom_id,
        batch_id: line.batch_id || null,
        unit_cost: line.unit_cost || null,
        remarks: line.remarks || null,
        created_by: input.created_by || null,
      }));

      const insertedLines = await trx('stock_transfer_lines')
        .insert(lineInserts)
        .returning('*');

      return { ...header, lines: insertedLines };
    });
  }

  // ──────── LIST ────────

  async listTransfers(options: ListStockTransfersOptions) {
    const {
      companyId,
      page = 1,
      limit = 50,
      search,
      status,
      from_branch_id,
      to_branch_id,
      from_warehouse_id,
      to_warehouse_id,
      transfer_type,
      from_date,
      to_date,
      sortBy = 'transfer_date',
      sortOrder = 'desc',
    } = options;

    const offset = (page - 1) * limit;

    let query = this.db('stock_transfers as st')
      .where('st.company_id', companyId)
      .andWhere('st.is_deleted', false);

    if (status) query = query.where('st.status', status);
    if (from_branch_id) query = query.where('st.from_branch_id', from_branch_id);
    if (to_branch_id) query = query.where('st.to_branch_id', to_branch_id);
    if (from_warehouse_id) query = query.where('st.from_warehouse_id', from_warehouse_id);
    if (to_warehouse_id) query = query.where('st.to_warehouse_id', to_warehouse_id);
    if (transfer_type) query = query.where('st.transfer_type', transfer_type);
    if (from_date) query = query.where('st.transfer_date', '>=', from_date);
    if (to_date) query = query.where('st.transfer_date', '<=', to_date);
    if (search) {
      query = query.where(function () {
        this.whereILike('st.transfer_number', `%${search}%`)
          .orWhereILike('st.reason', `%${search}%`);
      });
    }

    const countResult = await query.clone().count('st.id as total').first();
    const total = parseInt(String(countResult?.total || '0'), 10);

    const data = await query
      .clone()
      .join('branches as fb', 'st.from_branch_id', 'fb.id')
      .join('branches as tb', 'st.to_branch_id', 'tb.id')
      .join('warehouses as fw', 'st.from_warehouse_id', 'fw.id')
      .join('warehouses as tw', 'st.to_warehouse_id', 'tw.id')
      .select(
        'st.*',
        'fb.name as from_branch_name',
        'tb.name as to_branch_name',
        'fw.name as from_warehouse_name',
        'tw.name as to_warehouse_name'
      )
      .orderBy(`st.${sortBy}`, sortOrder)
      .limit(limit)
      .offset(offset);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ──────── GET WITH DETAILS ────────

  async getTransferWithDetails(id: string, companyId: string) {
    const header = await this.db('stock_transfers as st')
      .join('branches as fb', 'st.from_branch_id', 'fb.id')
      .join('branches as tb', 'st.to_branch_id', 'tb.id')
      .join('warehouses as fw', 'st.from_warehouse_id', 'fw.id')
      .join('warehouses as tw', 'st.to_warehouse_id', 'tw.id')
      .where('st.id', id)
      .andWhere('st.company_id', companyId)
      .andWhere('st.is_deleted', false)
      .select(
        'st.*',
        'fb.name as from_branch_name',
        'tb.name as to_branch_name',
        'fw.name as from_warehouse_name',
        'tw.name as to_warehouse_name'
      )
      .first();

    if (!header) return null;

    const lines = await this.db('stock_transfer_lines as stl')
      .leftJoin('items as i', 'stl.item_id', 'i.id')
      .leftJoin('products as p', 'stl.product_id', 'p.id')
      .leftJoin('units_of_measurement as u', 'stl.uom_id', 'u.id')
      .leftJoin('stock_batches as sb', 'stl.batch_id', 'sb.id')
      .where('stl.transfer_id', id)
      .andWhere('stl.company_id', companyId)
      .andWhere('stl.is_deleted', false)
      .select(
        'stl.*',
        'i.name as item_name',
        'i.item_code',
        'p.name as product_name',
        'p.product_code',
        'u.name as uom_name',
        'u.symbol as uom_symbol',
        'sb.batch_number'
      )
      .orderBy('stl.line_number');

    return { ...header, lines };
  }

  // ──────── UPDATE (draft only) ────────

  async updateTransfer(id: string, companyId: string, input: UpdateStockTransferInput) {
    return await this.db.transaction(async (trx) => {
      const existing = await trx('stock_transfers')
        .where({ id, company_id: companyId, is_deleted: false })
        .first();

      if (!existing) throw new Error('Stock transfer not found');
      if (existing.status !== 'draft') {
        throw new Error(`Cannot update. Current status: "${existing.status}". Only draft transfers can be updated.`);
      }

      // Validate warehouses if changed
      const fromWhId = input.from_warehouse_id || existing.from_warehouse_id;
      const toWhId = input.to_warehouse_id || existing.to_warehouse_id;
      if (fromWhId === toWhId) {
        throw new Error('Source and destination warehouse cannot be the same');
      }

      // Update header
      const headerUpdate: Record<string, any> = {};
      if (input.transfer_date !== undefined) headerUpdate.transfer_date = input.transfer_date;
      if (input.from_branch_id !== undefined) headerUpdate.from_branch_id = input.from_branch_id;
      if (input.from_warehouse_id !== undefined) headerUpdate.from_warehouse_id = input.from_warehouse_id;
      if (input.to_branch_id !== undefined) headerUpdate.to_branch_id = input.to_branch_id;
      if (input.to_warehouse_id !== undefined) headerUpdate.to_warehouse_id = input.to_warehouse_id;
      if (input.transfer_type !== undefined) headerUpdate.transfer_type = input.transfer_type;
      if (input.reason !== undefined) headerUpdate.reason = input.reason;
      if (input.metadata !== undefined) headerUpdate.metadata = input.metadata;
      headerUpdate.updated_by = input.updated_by || null;

      if (Object.keys(headerUpdate).length > 1) {
        await trx('stock_transfers').where({ id }).update(headerUpdate);
      }

      // Replace lines if provided
      if (input.lines && input.lines.length > 0) {
        // Soft-delete old lines
        await trx('stock_transfer_lines')
          .where({ transfer_id: id, company_id: companyId, is_deleted: false })
          .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: input.updated_by });

        // Insert new lines
        const lineInserts = input.lines.map((line) => ({
          company_id: companyId,
          transfer_id: id,
          line_number: line.line_number,
          item_id: line.item_id || null,
          product_id: line.product_id || null,
          quantity: line.quantity,
          received_quantity: 0,
          uom_id: line.uom_id,
          batch_id: line.batch_id || null,
          unit_cost: line.unit_cost || null,
          remarks: line.remarks || null,
          created_by: input.updated_by || null,
        }));

        await trx('stock_transfer_lines').insert(lineInserts);
      }

      // Return updated
      const updated = await trx('stock_transfers').where({ id }).first();
      const updatedLines = await trx('stock_transfer_lines')
        .where({ transfer_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      return { ...updated, lines: updatedLines };
    });
  }

  // ──────── APPROVE (draft → approved) ────────

  async approveTransfer(id: string, companyId: string, userId: string) {
    const transfer = await this.getById(id, companyId);
    if (!transfer) throw new Error('Stock transfer not found');
    if (transfer.status !== 'draft') {
      throw new Error(`Cannot approve. Current status: "${transfer.status}". Only draft transfers can be approved.`);
    }

    const [updated] = await this.db('stock_transfers')
      .where({ id, company_id: companyId })
      .update({
        status: 'approved',
        approved_by: userId,
        updated_by: userId,
      })
      .returning('*');

    return updated;
  }

  // ──────── DISPATCH (approved → in_transit) ────────
  // Deducts stock from source warehouse via stock ledger engine.

  async dispatchTransfer(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const transfer = await trx('stock_transfers')
        .where({ id, company_id: companyId, is_deleted: false })
        .forUpdate()
        .first();

      if (!transfer) throw new Error('Stock transfer not found');
      if (transfer.status !== 'approved') {
        throw new Error(`Cannot dispatch. Current status: "${transfer.status}". Only approved transfers can be dispatched.`);
      }

      const lines = await trx('stock_transfer_lines')
        .where({ transfer_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      if (lines.length === 0) throw new Error('Transfer has no lines');

      // Deduct stock from source warehouse for each line
      for (const line of lines) {
        const qty = parseNum(line.quantity);

        // Resolve unit_cost from stock_summary if not on line
        let unitCost = parseNum(line.unit_cost);
        if (!unitCost) {
          const balance = await inventoryService.getStockBalance(
            companyId,
            transfer.from_warehouse_id,
            line.item_id || undefined,
            line.product_id || undefined
          );
          unitCost = balance?.valuation_rate || 0;

          // Store resolved cost on line for receiving
          await trx('stock_transfer_lines')
            .where({ id: line.id })
            .update({ unit_cost: round4(unitCost) });
        }

        const movement: StockMovementInput = {
          company_id: companyId,
          branch_id: transfer.from_branch_id,
          warehouse_id: transfer.from_warehouse_id,
          item_id: line.item_id || undefined,
          product_id: line.product_id || undefined,
          transaction_type: 'transfer_out',
          transaction_date: transfer.transfer_date,
          reference_type: 'transfer',
          reference_id: id,
          reference_number: transfer.transfer_number,
          direction: 'out',
          quantity: qty,
          uom_id: line.uom_id,
          unit_cost: unitCost,
          batch_id: line.batch_id || undefined,
          narration: `Transfer out to ${transfer.to_warehouse_id} — ${transfer.transfer_number}`,
          created_by: userId,
        };

        await inventoryService.recordMovement(movement, trx);
      }

      // Update status
      const [updated] = await trx('stock_transfers')
        .where({ id })
        .update({
          status: 'in_transit',
          dispatched_by: userId,
          updated_by: userId,
        })
        .returning('*');

      return updated;
    });
  }

  // ──────── RECEIVE (in_transit → received) ────────
  // Adds stock to destination warehouse. Supports partial receiving.

  async receiveTransfer(
    id: string,
    companyId: string,
    userId: string,
    receiveLines?: ReceiveLineInput[]
  ) {
    return await this.db.transaction(async (trx) => {
      const transfer = await trx('stock_transfers')
        .where({ id, company_id: companyId, is_deleted: false })
        .forUpdate()
        .first();

      if (!transfer) throw new Error('Stock transfer not found');
      if (transfer.status !== 'in_transit') {
        throw new Error(`Cannot receive. Current status: "${transfer.status}". Only in_transit transfers can be received.`);
      }

      const lines = await trx('stock_transfer_lines')
        .where({ transfer_id: id, company_id: companyId, is_deleted: false })
        .orderBy('line_number');

      if (lines.length === 0) throw new Error('Transfer has no lines');

      // Determine receive quantities
      let linesToReceive: { line: any; receiveQty: number; remarks?: string }[] = [];

      if (receiveLines && receiveLines.length > 0) {
        // Partial receiving — specific quantities per line
        for (const rl of receiveLines) {
          const line = lines.find((l: any) => l.id === rl.line_id);
          if (!line) throw new Error(`Transfer line not found: ${rl.line_id}`);

          const alreadyReceived = parseNum(line.received_quantity);
          const totalQty = parseNum(line.quantity);
          const newReceived = alreadyReceived + rl.received_quantity;

          if (newReceived > totalQty) {
            throw new Error(
              `Line ${line.line_number}: Cannot receive ${rl.received_quantity}. ` +
              `Sent: ${totalQty}, already received: ${alreadyReceived}`
            );
          }

          if (rl.received_quantity > 0) {
            linesToReceive.push({ line, receiveQty: rl.received_quantity, remarks: rl.remarks });
          }
        }
      } else {
        // Full receiving — receive remaining quantity for all lines
        for (const line of lines) {
          const alreadyReceived = parseNum(line.received_quantity);
          const totalQty = parseNum(line.quantity);
          const remaining = round3(totalQty - alreadyReceived);

          if (remaining > 0) {
            linesToReceive.push({ line, receiveQty: remaining });
          }
        }
      }

      if (linesToReceive.length === 0) {
        throw new Error('No quantities to receive. All lines are already fully received.');
      }

      // Add stock to destination warehouse for each receive line
      for (const { line, receiveQty } of linesToReceive) {
        const unitCost = parseNum(line.unit_cost);

        const movement: StockMovementInput = {
          company_id: companyId,
          branch_id: transfer.to_branch_id,
          warehouse_id: transfer.to_warehouse_id,
          item_id: line.item_id || undefined,
          product_id: line.product_id || undefined,
          transaction_type: 'transfer_in',
          transaction_date: new Date().toISOString().split('T')[0],
          reference_type: 'transfer',
          reference_id: id,
          reference_number: transfer.transfer_number,
          direction: 'in',
          quantity: receiveQty,
          uom_id: line.uom_id,
          unit_cost: unitCost,
          batch_id: line.batch_id || undefined,
          narration: `Transfer in from ${transfer.from_warehouse_id} — ${transfer.transfer_number}`,
          created_by: userId,
        };

        await inventoryService.recordMovement(movement, trx);

        // Update received_quantity on the line
        const newReceived = round3(parseNum(line.received_quantity) + receiveQty);
        await trx('stock_transfer_lines')
          .where({ id: line.id })
          .update({
            received_quantity: newReceived,
            updated_by: userId,
          });
      }

      // Check if all lines fully received
      const updatedLines = await trx('stock_transfer_lines')
        .where({ transfer_id: id, company_id: companyId, is_deleted: false });

      const allFullyReceived = updatedLines.every(
        (l: any) => parseNum(l.received_quantity) >= parseNum(l.quantity)
      );

      // Update transfer status
      const newStatus = allFullyReceived ? 'received' : 'in_transit';
      const updateData: Record<string, any> = {
        status: newStatus,
        updated_by: userId,
      };
      if (allFullyReceived) {
        updateData.received_by = userId;
      }

      const [updated] = await trx('stock_transfers')
        .where({ id })
        .update(updateData)
        .returning('*');

      return {
        ...updated,
        lines: updatedLines,
        fully_received: allFullyReceived,
      };
    });
  }

  // ──────── CANCEL ────────
  // If in_transit: reverse source stock (add back via transfer_in to source).
  // If draft/approved: just cancel, no stock impact.

  async cancelTransfer(id: string, companyId: string, userId: string) {
    return await this.db.transaction(async (trx) => {
      const transfer = await trx('stock_transfers')
        .where({ id, company_id: companyId, is_deleted: false })
        .forUpdate()
        .first();

      if (!transfer) throw new Error('Stock transfer not found');

      const terminalStatuses = ['received', 'cancelled'];
      if (terminalStatuses.includes(transfer.status)) {
        throw new Error(`Cannot cancel. Current status: "${transfer.status}".`);
      }

      // If in_transit, reverse the dispatch by adding stock back to source
      if (transfer.status === 'in_transit') {
        const lines = await trx('stock_transfer_lines')
          .where({ transfer_id: id, company_id: companyId, is_deleted: false });

        for (const line of lines) {
          // Only reverse un-received quantity
          const sentQty = parseNum(line.quantity);
          const receivedQty = parseNum(line.received_quantity);
          const unreceived = round3(sentQty - receivedQty);

          if (unreceived > 0) {
            const unitCost = parseNum(line.unit_cost);

            const movement: StockMovementInput = {
              company_id: companyId,
              branch_id: transfer.from_branch_id,
              warehouse_id: transfer.from_warehouse_id,
              item_id: line.item_id || undefined,
              product_id: line.product_id || undefined,
              transaction_type: 'transfer_in',
              transaction_date: new Date().toISOString().split('T')[0],
              reference_type: 'transfer',
              reference_id: id,
              reference_number: transfer.transfer_number,
              direction: 'in',
              quantity: unreceived,
              uom_id: line.uom_id,
              unit_cost: unitCost,
              batch_id: line.batch_id || undefined,
              narration: `Transfer cancelled — stock returned to source — ${transfer.transfer_number}`,
              created_by: userId,
            };

            await inventoryService.recordMovement(movement, trx);
          }
        }
      }

      // Update status to cancelled
      const [updated] = await trx('stock_transfers')
        .where({ id })
        .update({
          status: 'cancelled',
          updated_by: userId,
        })
        .returning('*');

      return updated;
    });
  }

  // ──────── SOFT DELETE (draft only) ────────

  async deleteTransfer(id: string, companyId: string, userId: string) {
    const transfer = await this.getById(id, companyId);
    if (!transfer) throw new Error('Stock transfer not found');
    if (transfer.status !== 'draft') {
      throw new Error('Only draft transfers can be deleted');
    }

    return await this.db.transaction(async (trx) => {
      // Soft-delete lines
      await trx('stock_transfer_lines')
        .where({ transfer_id: id, company_id: companyId, is_deleted: false })
        .update({ is_deleted: true, deleted_at: trx.fn.now(), deleted_by: userId });

      // Soft-delete header
      const [deleted] = await trx('stock_transfers')
        .where({ id, company_id: companyId, is_deleted: false })
        .update({
          is_deleted: true,
          deleted_at: trx.fn.now(),
          deleted_by: userId,
        })
        .returning('*');

      return deleted;
    });
  }
}

export const stockTransferService = new StockTransferService();