import { Knex } from 'knex';

/**
 * This seed is meant to be run AFTER a company is created.
 * It populates default UOMs, tax rates, and document sequences.
 *
 * Usage: npm run seed:run
 *
 * It finds the first company and seeds data for it.
 */
export async function seed(knex: Knex): Promise<void> {
  // Find the first company
  const company = await knex('companies').where('is_deleted', false).first();
  if (!company) {
    console.log('No company found. Run setup first.');
    return;
  }

  const companyId = company.id;

  // Find the main branch
  const branch = await knex('branches')
    .where({ company_id: companyId, is_main_branch: true, is_deleted: false })
    .first();

  // Find the active financial year
  const fy = await knex('financial_years')
    .where({ company_id: companyId, is_active: true, is_deleted: false })
    .first();

  // ============================================================
  // 1. Units of Measurement
  // ============================================================

  const existingUoms = await knex('units_of_measurement')
    .where({ company_id: companyId, is_deleted: false })
    .count('id as count')
    .first();

  if (parseInt(String(existingUoms?.count || '0'), 10) === 0) {
    await knex('units_of_measurement').insert([
      { company_id: companyId, code: 'PCS', name: 'Pieces', category: 'quantity', decimal_places: 0 },
      { company_id: companyId, code: 'NOS', name: 'Numbers', category: 'quantity', decimal_places: 0 },
      { company_id: companyId, code: 'KG', name: 'Kilograms', category: 'weight', decimal_places: 3 },
      { company_id: companyId, code: 'GM', name: 'Grams', category: 'weight', decimal_places: 2 },
      { company_id: companyId, code: 'TON', name: 'Metric Ton', category: 'weight', decimal_places: 3 },
      { company_id: companyId, code: 'LTR', name: 'Litres', category: 'volume', decimal_places: 3 },
      { company_id: companyId, code: 'ML', name: 'Millilitres', category: 'volume', decimal_places: 2 },
      { company_id: companyId, code: 'MTR', name: 'Metres', category: 'length', decimal_places: 3 },
      { company_id: companyId, code: 'CM', name: 'Centimetres', category: 'length', decimal_places: 2 },
      { company_id: companyId, code: 'MM', name: 'Millimetres', category: 'length', decimal_places: 2 },
      { company_id: companyId, code: 'FT', name: 'Feet', category: 'length', decimal_places: 2 },
      { company_id: companyId, code: 'IN', name: 'Inches', category: 'length', decimal_places: 2 },
      { company_id: companyId, code: 'SQM', name: 'Square Metres', category: 'area', decimal_places: 3 },
      { company_id: companyId, code: 'SQFT', name: 'Square Feet', category: 'area', decimal_places: 2 },
      { company_id: companyId, code: 'SET', name: 'Sets', category: 'quantity', decimal_places: 0 },
      { company_id: companyId, code: 'BOX', name: 'Boxes', category: 'quantity', decimal_places: 0 },
      { company_id: companyId, code: 'PAIR', name: 'Pairs', category: 'quantity', decimal_places: 0 },
      { company_id: companyId, code: 'ROLL', name: 'Rolls', category: 'quantity', decimal_places: 0 },
      { company_id: companyId, code: 'BAG', name: 'Bags', category: 'quantity', decimal_places: 0 },
      { company_id: companyId, code: 'PKT', name: 'Packets', category: 'quantity', decimal_places: 0 },
    ]);

    console.log('[Seed] UOMs created');

    // UOM Conversions
    const uoms = await knex('units_of_measurement')
      .where({ company_id: companyId, is_deleted: false })
      .select('id', 'code');

    const uomMap: Record<string, string> = {};
    uoms.forEach((u: any) => { uomMap[u.code] = u.id; });

    await knex('uom_conversions').insert([
      { company_id: companyId, from_uom_id: uomMap['KG'], to_uom_id: uomMap['GM'], conversion_factor: 1000 },
      { company_id: companyId, from_uom_id: uomMap['GM'], to_uom_id: uomMap['KG'], conversion_factor: 0.001 },
      { company_id: companyId, from_uom_id: uomMap['TON'], to_uom_id: uomMap['KG'], conversion_factor: 1000 },
      { company_id: companyId, from_uom_id: uomMap['KG'], to_uom_id: uomMap['TON'], conversion_factor: 0.001 },
      { company_id: companyId, from_uom_id: uomMap['LTR'], to_uom_id: uomMap['ML'], conversion_factor: 1000 },
      { company_id: companyId, from_uom_id: uomMap['ML'], to_uom_id: uomMap['LTR'], conversion_factor: 0.001 },
      { company_id: companyId, from_uom_id: uomMap['MTR'], to_uom_id: uomMap['CM'], conversion_factor: 100 },
      { company_id: companyId, from_uom_id: uomMap['CM'], to_uom_id: uomMap['MM'], conversion_factor: 10 },
      { company_id: companyId, from_uom_id: uomMap['MTR'], to_uom_id: uomMap['MM'], conversion_factor: 1000 },
      { company_id: companyId, from_uom_id: uomMap['MTR'], to_uom_id: uomMap['FT'], conversion_factor: 3.28084 },
      { company_id: companyId, from_uom_id: uomMap['FT'], to_uom_id: uomMap['IN'], conversion_factor: 12 },
      { company_id: companyId, from_uom_id: uomMap['SQM'], to_uom_id: uomMap['SQFT'], conversion_factor: 10.7639 },
    ]);

    console.log('[Seed] UOM conversions created');
  }

  // ============================================================
  // 2. Tax Masters (Indian GST rates)
  // ============================================================

  const existingTax = await knex('tax_masters')
    .where({ company_id: companyId, is_deleted: false })
    .count('id as count')
    .first();

  if (parseInt(String(existingTax?.count || '0'), 10) === 0) {
    await knex('tax_masters').insert([
      { company_id: companyId, tax_name: 'GST 0%', tax_type: 'gst', rate: 0, cgst_rate: 0, sgst_rate: 0, igst_rate: 0 },
      { company_id: companyId, tax_name: 'GST 5%', tax_type: 'gst', rate: 5, cgst_rate: 2.5, sgst_rate: 2.5, igst_rate: 5 },
      { company_id: companyId, tax_name: 'GST 12%', tax_type: 'gst', rate: 12, cgst_rate: 6, sgst_rate: 6, igst_rate: 12 },
      { company_id: companyId, tax_name: 'GST 18%', tax_type: 'gst', rate: 18, cgst_rate: 9, sgst_rate: 9, igst_rate: 18 },
      { company_id: companyId, tax_name: 'GST 28%', tax_type: 'gst', rate: 28, cgst_rate: 14, sgst_rate: 14, igst_rate: 28 },
      { company_id: companyId, tax_name: 'TDS 194C - 1%', tax_type: 'tds', rate: 1, cgst_rate: null, sgst_rate: null, igst_rate: null },
      { company_id: companyId, tax_name: 'TDS 194C - 2%', tax_type: 'tds', rate: 2, cgst_rate: null, sgst_rate: null, igst_rate: null },
      { company_id: companyId, tax_name: 'TDS 194J - 10%', tax_type: 'tds', rate: 10, cgst_rate: null, sgst_rate: null, igst_rate: null },
      { company_id: companyId, tax_name: 'TCS 206C - 0.1%', tax_type: 'tcs', rate: 0.1, cgst_rate: null, sgst_rate: null, igst_rate: null },
    ]);

    console.log('[Seed] Tax masters created');
  }

  // ============================================================
  // 3. Document Sequences
  // ============================================================

  const existingSeq = await knex('document_sequences')
    .where({ company_id: companyId, is_deleted: false })
    .count('id as count')
    .first();

  if (parseInt(String(existingSeq?.count || '0'), 10) === 0 && branch && fy) {
    await knex('document_sequences').insert([
      { company_id: companyId, branch_id: branch.id, document_type: 'quotation', prefix_pattern: 'QTN-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'sales_order', prefix_pattern: 'SO-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'invoice', prefix_pattern: 'INV-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'credit_note', prefix_pattern: 'CN-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'po', prefix_pattern: 'PO-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'grn', prefix_pattern: 'GRN-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'vendor_bill', prefix_pattern: 'VB-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'debit_note', prefix_pattern: 'DN-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'work_order', prefix_pattern: 'WO-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'delivery_challan', prefix_pattern: 'DC-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'payment_receipt', prefix_pattern: 'REC-', pad_length: 4, financial_year_id: fy.id },
      { company_id: companyId, branch_id: branch.id, document_type: 'payment_made', prefix_pattern: 'PAY-', pad_length: 4, financial_year_id: fy.id },
    ]);

    console.log('[Seed] Document sequences created');
  }

  // ============================================================
  // 4. Default Item Categories
  // ============================================================

  const existingCat = await knex('item_categories')
    .where({ company_id: companyId, is_deleted: false })
    .count('id as count')
    .first();

  if (parseInt(String(existingCat?.count || '0'), 10) === 0) {
    await knex('item_categories').insert([
      { company_id: companyId, name: 'Raw Materials', code: 'RM' },
      { company_id: companyId, name: 'Components', code: 'COMP' },
      { company_id: companyId, name: 'Consumables', code: 'CON' },
      { company_id: companyId, name: 'Packing Materials', code: 'PACK' },
      { company_id: companyId, name: 'Finished Goods', code: 'FG' },
      { company_id: companyId, name: 'Semi-Finished Goods', code: 'SFG' },
      { company_id: companyId, name: 'Hydraulic Parts', code: 'HYD' },
      { company_id: companyId, name: 'Seals & Gaskets', code: 'SEAL' },
      { company_id: companyId, name: 'Fasteners', code: 'FAST' },
      { company_id: companyId, name: 'Bearings', code: 'BRG' },
    ]);

    console.log('[Seed] Item categories created');
  }

  console.log('[Seed] All seed data populated successfully');
}
