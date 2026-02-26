// =============================================================
// Migration 016: Fix Sales Module Bugs
//
// BUG-S1: place_of_supply varchar(5) → varchar(100)
//         The column was too small for full state names
//         (e.g., "Uttar Pradesh" = 13 chars) causing all
//         invoice creation to fail.
//
// BUG-S2: payment_receipts receipt_number unique constraint
//         includes soft-deleted rows, but the next-number
//         generation only counts non-deleted rows.
//         Fixed by service-level code change (not migration).
//
// BUG-S3/S4: Unknown fields passed to DB update.
//         Fixed by service-level code change (not migration).
//
// BUG-S8: payment_receipts status CHECK constraint missing 'bounced'.
//         The service supports cheque bounce workflow, but the
//         constraint only allows draft/confirmed/cancelled.
// =============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // BUG-S1: Widen place_of_supply to accommodate full state names
  await knex.raw(`
    ALTER TABLE sales_invoices
    ALTER COLUMN place_of_supply TYPE varchar(100);
  `);

  // BUG-S8: Add 'bounced' to payment_receipts status constraint
  await knex.raw(`
    ALTER TABLE payment_receipts DROP CONSTRAINT IF EXISTS chk_pr_status;
  `);
  await knex.raw(`
    ALTER TABLE payment_receipts ADD CONSTRAINT chk_pr_status
    CHECK (status IN ('draft', 'confirmed', 'cancelled', 'bounced'));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE sales_invoices
    ALTER COLUMN place_of_supply TYPE varchar(5);
  `);

  await knex.raw(`
    ALTER TABLE payment_receipts DROP CONSTRAINT IF EXISTS chk_pr_status;
  `);
  await knex.raw(`
    ALTER TABLE payment_receipts ADD CONSTRAINT chk_pr_status
    CHECK (status IN ('draft', 'confirmed', 'cancelled'));
  `);
}
