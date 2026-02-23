import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('payment_receipts', (t) => {
    t.uuid('invoice_id').references('id').inTable('sales_invoices');
    t.decimal('tds_deducted', 15, 2).defaultTo(0);
    t.string('cheque_number', 50);
    t.date('cheque_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('payment_receipts', (t) => {
    t.dropColumn('invoice_id');
    t.dropColumn('tds_deducted');
    t.dropColumn('cheque_number');
    t.dropColumn('cheque_date');
  });
}
