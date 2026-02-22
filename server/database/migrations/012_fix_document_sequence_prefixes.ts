import type { Knex } from 'knex';

/**
 * Migration 012: Update document sequence prefixes from QT/ → QTN- format
 * Fixes BUG-QTN-001: Quotation number format mismatch
 */
export async function up(knex: Knex): Promise<void> {
  const prefixMap: Record<string, string> = {
    'QT/': 'QTN-',
    'SO/': 'SO-',
    'INV/': 'INV-',
    'CN/': 'CN-',
    'PO/': 'PO-',
    'GRN/': 'GRN-',
    'VB/': 'VB-',
    'DN/': 'DN-',
    'DC/': 'DC-',
    'WO/': 'WO-',
    'REC/': 'REC-',
    'PAY/': 'PAY-',
  };

  for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
    await knex('document_sequences')
      .where('prefix_pattern', oldPrefix)
      .update({ prefix_pattern: newPrefix, pad_length: 4 });
  }
}

export async function down(knex: Knex): Promise<void> {
  const prefixMap: Record<string, string> = {
    'QTN-': 'QT/',
    'SO-': 'SO/',
    'INV-': 'INV/',
    'CN-': 'CN/',
    'PO-': 'PO/',
    'GRN-': 'GRN/',
    'VB-': 'VB/',
    'DN-': 'DN/',
    'DC-': 'DC/',
    'WO-': 'WO/',
    'REC-': 'REC/',
    'PAY-': 'PAY/',
  };

  for (const [oldPrefix, newPrefix] of Object.entries(prefixMap)) {
    await knex('document_sequences')
      .where('prefix_pattern', oldPrefix)
      .update({ prefix_pattern: newPrefix, pad_length: 5 });
  }
}
