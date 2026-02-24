import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Update CHECK constraint to include all document types
  await knex.raw(`ALTER TABLE document_sequences DROP CONSTRAINT IF EXISTS chk_ds_type;`);
  await knex.raw(`ALTER TABLE document_sequences ADD CONSTRAINT chk_ds_type CHECK (document_type IN ('quotation', 'sales_order', 'invoice', 'credit_note', 'po', 'grn', 'vendor_bill', 'debit_note', 'work_order', 'delivery_challan', 'payment_receipt', 'payment_made', 'purchase_requisition', 'stock_adjustment', 'scrap_entry', 'production_entry', 'stock_transfer'));`);

  // 2. Insert missing sequences for all existing company/branch combos
  const newTypes = [
    { type: 'stock_adjustment', prefix: 'SA-' },
    { type: 'scrap_entry', prefix: 'SCR-' },
    { type: 'production_entry', prefix: 'PE-' },
    { type: 'stock_transfer', prefix: 'ST-' },
  ];

  for (const { type, prefix } of newTypes) {
    await knex.raw(`
      INSERT INTO document_sequences (company_id, branch_id, document_type, prefix_pattern, pad_length, financial_year_id)
      SELECT DISTINCT company_id, branch_id, '${type}', '${prefix}', 4, financial_year_id
      FROM document_sequences
      WHERE document_type = 'po'
        AND is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM document_sequences ds2
          WHERE ds2.company_id = document_sequences.company_id
            AND ds2.branch_id = document_sequences.branch_id
            AND ds2.document_type = '${type}'
            AND ds2.is_deleted = false
        );
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('document_sequences')
    .whereIn('document_type', ['stock_adjustment', 'scrap_entry', 'production_entry', 'stock_transfer'])
    .del();

  await knex.raw(`ALTER TABLE document_sequences DROP CONSTRAINT IF EXISTS chk_ds_type;`);
  await knex.raw(`ALTER TABLE document_sequences ADD CONSTRAINT chk_ds_type CHECK (document_type IN ('quotation', 'sales_order', 'invoice', 'credit_note', 'po', 'grn', 'vendor_bill', 'debit_note', 'work_order', 'delivery_challan', 'payment_receipt', 'payment_made', 'purchase_requisition'));`);
}
