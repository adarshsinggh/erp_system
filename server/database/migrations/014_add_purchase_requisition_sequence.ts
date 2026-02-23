import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Update CHECK constraint to include purchase_requisition
  await knex.raw(`ALTER TABLE document_sequences DROP CONSTRAINT IF EXISTS chk_ds_type;`);
  await knex.raw(`ALTER TABLE document_sequences ADD CONSTRAINT chk_ds_type CHECK (document_type IN ('quotation', 'sales_order', 'invoice', 'credit_note', 'po', 'grn', 'vendor_bill', 'debit_note', 'work_order', 'delivery_challan', 'payment_receipt', 'payment_made', 'purchase_requisition'));`);

  // 2. Insert purchase_requisition sequence for every existing company/branch that already has sequences
  await knex.raw(`
    INSERT INTO document_sequences (company_id, branch_id, document_type, prefix_pattern, pad_length, financial_year_id)
    SELECT DISTINCT company_id, branch_id, 'purchase_requisition', 'PR-', 4, financial_year_id
    FROM document_sequences
    WHERE document_type = 'po'
      AND is_deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM document_sequences ds2
        WHERE ds2.company_id = document_sequences.company_id
          AND ds2.branch_id = document_sequences.branch_id
          AND ds2.document_type = 'purchase_requisition'
          AND ds2.is_deleted = false
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove purchase_requisition sequences
  await knex('document_sequences')
    .where({ document_type: 'purchase_requisition' })
    .del();

  // Restore original CHECK constraint
  await knex.raw(`ALTER TABLE document_sequences DROP CONSTRAINT IF EXISTS chk_ds_type;`);
  await knex.raw(`ALTER TABLE document_sequences ADD CONSTRAINT chk_ds_type CHECK (document_type IN ('quotation', 'sales_order', 'invoice', 'credit_note', 'po', 'grn', 'vendor_bill', 'debit_note', 'work_order', 'delivery_challan', 'payment_receipt', 'payment_made'));`);
}
