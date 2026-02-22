// =============================================================
// File: server/database/migrations/011_fix_orphaned_accounts.ts
// Description: Fix orphaned accounts that were created without
//              a parent_id and appear at root level incorrectly.
//              Specifically fixes "Factory Rent" (5999) which
//              should be under "Expenses" (5000).
// =============================================================

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Fix any expense accounts at root level (no parent_id) that are not the
  // root "Expenses" group (code 5000). Move them under the Expenses root.
  await knex.raw(`
    UPDATE chart_of_accounts AS child
    SET
      parent_id = parent.id,
      level = 1,
      path = parent.path || '/' || child.account_code
    FROM chart_of_accounts AS parent
    WHERE child.parent_id IS NULL
      AND child.account_type = 'expense'
      AND child.account_code != '5000'
      AND child.is_deleted = false
      AND parent.account_code = '5000'
      AND parent.account_type = 'expense'
      AND parent.is_deleted = false
      AND parent.company_id = child.company_id
  `);

  // Same fix for any orphaned revenue accounts (not code 4000)
  await knex.raw(`
    UPDATE chart_of_accounts AS child
    SET
      parent_id = parent.id,
      level = 1,
      path = parent.path || '/' || child.account_code
    FROM chart_of_accounts AS parent
    WHERE child.parent_id IS NULL
      AND child.account_type = 'revenue'
      AND child.account_code != '4000'
      AND child.is_deleted = false
      AND parent.account_code = '4000'
      AND parent.account_type = 'revenue'
      AND parent.is_deleted = false
      AND parent.company_id = child.company_id
  `);

  // Same fix for orphaned asset accounts (not code 1000)
  await knex.raw(`
    UPDATE chart_of_accounts AS child
    SET
      parent_id = parent.id,
      level = 1,
      path = parent.path || '/' || child.account_code
    FROM chart_of_accounts AS parent
    WHERE child.parent_id IS NULL
      AND child.account_type = 'asset'
      AND child.account_code != '1000'
      AND child.is_deleted = false
      AND parent.account_code = '1000'
      AND parent.account_type = 'asset'
      AND parent.is_deleted = false
      AND parent.company_id = child.company_id
  `);

  // Same fix for orphaned liability accounts (not code 2000)
  await knex.raw(`
    UPDATE chart_of_accounts AS child
    SET
      parent_id = parent.id,
      level = 1,
      path = parent.path || '/' || child.account_code
    FROM chart_of_accounts AS parent
    WHERE child.parent_id IS NULL
      AND child.account_type = 'liability'
      AND child.account_code != '2000'
      AND child.is_deleted = false
      AND parent.account_code = '2000'
      AND parent.account_type = 'liability'
      AND parent.is_deleted = false
      AND parent.company_id = child.company_id
  `);

  // Same fix for orphaned equity accounts (not code 3000)
  await knex.raw(`
    UPDATE chart_of_accounts AS child
    SET
      parent_id = parent.id,
      level = 1,
      path = parent.path || '/' || child.account_code
    FROM chart_of_accounts AS parent
    WHERE child.parent_id IS NULL
      AND child.account_type = 'equity'
      AND child.account_code != '3000'
      AND child.is_deleted = false
      AND parent.account_code = '3000'
      AND parent.account_type = 'equity'
      AND parent.is_deleted = false
      AND parent.company_id = child.company_id
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Cannot reliably reverse — accounts may have been legitimately orphaned
  // No-op
}
