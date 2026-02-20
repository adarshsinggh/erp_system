// =============================================================
// File: server/services/gst-compliance.service.ts
// Module: GST Compliance — Phase 14 (Step 48)
// Description:
//   - GSTR-1 data preparation (outward supplies)
//   - GSTR-3B summary preparation (monthly return)
//   - HSN-wise summary
//   - E-invoice readiness check
//   - E-way bill data extraction
//   All reports return structured JSON ready for filing tools.
// =============================================================

import { BaseService } from './base.service';

class GSTComplianceService extends BaseService {
  constructor() {
    super('sales_invoices');
  }

  // ═══════════════════════════════════════════════════════════
  // GSTR-1: Outward Supplies — B2B, B2C, Credit Notes
  // ═══════════════════════════════════════════════════════════

  /**
   * GSTR-1 B2B: Invoices to registered dealers (with GSTIN)
   */
  async gstr1B2B(companyId: string, period: { month: number; year: number }) {
    const startDate = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    const endDate = new Date(period.year, period.month, 0).toISOString().split('T')[0]; // last day

    return this.db('sales_invoices as si')
      .join('customers as c', 'si.customer_id', 'c.id')
      .join('sales_invoice_lines as sil', 'si.id', 'sil.invoice_id')
      .where('si.company_id', companyId)
      .where('si.is_deleted', false)
      .where('sil.is_deleted', false)
      .whereNotIn('si.status', ['draft', 'cancelled'])
      .where('si.invoice_date', '>=', startDate)
      .where('si.invoice_date', '<=', endDate)
      .whereNotNull('c.gstin')
      .where('c.gstin', '!=', '')
      .select(
        'c.gstin as receiver_gstin',
        'c.name as receiver_name',
        'si.invoice_number', 'si.invoice_date',
        'si.grand_total as invoice_value',
        'si.place_of_supply',
        'si.reverse_charge',
        'sil.hsn_code',
        'sil.taxable_amount',
        'sil.cgst_rate', 'sil.cgst_amount',
        'sil.sgst_rate', 'sil.sgst_amount',
        'sil.igst_rate', 'sil.igst_amount',
        'sil.total_amount as line_total'
      )
      .orderBy(['si.invoice_date', 'si.invoice_number']);
  }

  /**
   * GSTR-1 B2C: Invoices to unregistered dealers (no GSTIN)
   */
  async gstr1B2C(companyId: string, period: { month: number; year: number }) {
    const startDate = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    const endDate = new Date(period.year, period.month, 0).toISOString().split('T')[0];

    return this.db('sales_invoices as si')
      .join('customers as c', 'si.customer_id', 'c.id')
      .where('si.company_id', companyId)
      .where('si.is_deleted', false)
      .whereNotIn('si.status', ['draft', 'cancelled'])
      .where('si.invoice_date', '>=', startDate)
      .where('si.invoice_date', '<=', endDate)
      .where(function () {
        this.whereNull('c.gstin').orWhere('c.gstin', '');
      })
      .select(
        'si.place_of_supply',
        this.db.raw('SUM(si.taxable_amount) as total_taxable'),
        this.db.raw('SUM(si.cgst_amount) as total_cgst'),
        this.db.raw('SUM(si.sgst_amount) as total_sgst'),
        this.db.raw('SUM(si.igst_amount) as total_igst'),
        this.db.raw('SUM(si.grand_total) as total_value'),
        this.db.raw('COUNT(si.id) as invoice_count')
      )
      .groupBy('si.place_of_supply');
  }

  /**
   * GSTR-1 Credit/Debit Notes
   */
  async gstr1CreditNotes(companyId: string, period: { month: number; year: number }) {
    const startDate = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    const endDate = new Date(period.year, period.month, 0).toISOString().split('T')[0];

    return this.db('credit_notes as cn')
      .join('customers as c', 'cn.customer_id', 'c.id')
      .leftJoin('sales_invoices as si', 'cn.invoice_id', 'si.id')
      .where('cn.company_id', companyId)
      .where('cn.is_deleted', false)
      .whereNotIn('cn.status', ['draft', 'cancelled'])
      .where('cn.credit_note_date', '>=', startDate)
      .where('cn.credit_note_date', '<=', endDate)
      .select(
        'c.gstin as receiver_gstin', 'c.name as receiver_name',
        'cn.credit_note_number', 'cn.credit_note_date',
        'cn.reason',
        'si.invoice_number as original_invoice',
        'cn.subtotal', 'cn.cgst_amount', 'cn.sgst_amount', 'cn.igst_amount',
        'cn.grand_total'
      )
      .orderBy('cn.credit_note_date');
  }

  // ═══════════════════════════════════════════════════════════
  // GSTR-3B: Monthly Summary Return
  // ═══════════════════════════════════════════════════════════

  async gstr3BSummary(companyId: string, period: { month: number; year: number }) {
    const startDate = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    const endDate = new Date(period.year, period.month, 0).toISOString().split('T')[0];

    // 3.1 — Outward supplies (sales invoices)
    const outward = await this.db('sales_invoices')
      .where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['draft', 'cancelled'])
      .where('invoice_date', '>=', startDate)
      .where('invoice_date', '<=', endDate)
      .select(
        this.db.raw('SUM(taxable_amount) as total_taxable'),
        this.db.raw('SUM(cgst_amount) as total_cgst'),
        this.db.raw('SUM(sgst_amount) as total_sgst'),
        this.db.raw('SUM(igst_amount) as total_igst'),
        this.db.raw('SUM(cess_amount) as total_cess'),
        this.db.raw('COUNT(id) as invoice_count')
      )
      .first();

    // 3.1 — Credit notes (reduce outward)
    const creditNotes = await this.db('credit_notes')
      .where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['draft', 'cancelled'])
      .where('credit_note_date', '>=', startDate)
      .where('credit_note_date', '<=', endDate)
      .select(
        this.db.raw('SUM(cgst_amount) as cn_cgst'),
        this.db.raw('SUM(sgst_amount) as cn_sgst'),
        this.db.raw('SUM(igst_amount) as cn_igst'),
        this.db.raw('SUM(grand_total) as cn_total')
      )
      .first();

    // 4 — Input tax credit (vendor bills)
    const inward = await this.db('vendor_bills')
      .where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['draft', 'cancelled'])
      .where('bill_date', '>=', startDate)
      .where('bill_date', '<=', endDate)
      .select(
        this.db.raw('SUM(taxable_amount) as total_taxable'),
        this.db.raw('SUM(cgst_amount) as input_cgst'),
        this.db.raw('SUM(sgst_amount) as input_sgst'),
        this.db.raw('SUM(igst_amount) as input_igst'),
        this.db.raw('COUNT(id) as bill_count')
      )
      .first();

    // Debit notes (reduce input)
    const debitNotes = await this.db('debit_notes')
      .where({ company_id: companyId, is_deleted: false })
      .whereNotIn('status', ['draft', 'cancelled'])
      .where('debit_note_date', '>=', startDate)
      .where('debit_note_date', '<=', endDate)
      .select(
        this.db.raw('SUM(cgst_amount) as dn_cgst'),
        this.db.raw('SUM(sgst_amount) as dn_sgst'),
        this.db.raw('SUM(igst_amount) as dn_igst')
      )
      .first();

    const p = (v: any) => parseFloat(v || '0');

    const netOutputCGST = p(outward?.total_cgst) - p(creditNotes?.cn_cgst);
    const netOutputSGST = p(outward?.total_sgst) - p(creditNotes?.cn_sgst);
    const netOutputIGST = p(outward?.total_igst) - p(creditNotes?.cn_igst);

    const netInputCGST = p(inward?.input_cgst) - p(debitNotes?.dn_cgst);
    const netInputSGST = p(inward?.input_sgst) - p(debitNotes?.dn_sgst);
    const netInputIGST = p(inward?.input_igst) - p(debitNotes?.dn_igst);

    return {
      period: { month: period.month, year: period.year },
      section_3_1: {
        outward_taxable: p(outward?.total_taxable),
        output_cgst: netOutputCGST,
        output_sgst: netOutputSGST,
        output_igst: netOutputIGST,
        output_cess: p(outward?.total_cess),
        invoice_count: parseInt(outward?.invoice_count || '0', 10),
        credit_note_adjustment: p(creditNotes?.cn_total),
      },
      section_4: {
        inward_taxable: p(inward?.total_taxable),
        input_cgst: netInputCGST,
        input_sgst: netInputSGST,
        input_igst: netInputIGST,
        bill_count: parseInt(inward?.bill_count || '0', 10),
        debit_note_adjustment: p(debitNotes?.dn_cgst) + p(debitNotes?.dn_sgst) + p(debitNotes?.dn_igst),
      },
      section_6: {
        payable_cgst: Math.max(0, netOutputCGST - netInputCGST),
        payable_sgst: Math.max(0, netOutputSGST - netInputSGST),
        payable_igst: Math.max(0, netOutputIGST - netInputIGST),
        total_payable: Math.max(0, netOutputCGST - netInputCGST)
          + Math.max(0, netOutputSGST - netInputSGST)
          + Math.max(0, netOutputIGST - netInputIGST),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // HSN-WISE SUMMARY
  // ═══════════════════════════════════════════════════════════

  async hsnSummary(companyId: string, period: { month: number; year: number }) {
    const startDate = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    const endDate = new Date(period.year, period.month, 0).toISOString().split('T')[0];

    return this.db('sales_invoice_lines as sil')
      .join('sales_invoices as si', 'sil.invoice_id', 'si.id')
      .where('si.company_id', companyId)
      .where('si.is_deleted', false)
      .where('sil.is_deleted', false)
      .whereNotIn('si.status', ['draft', 'cancelled'])
      .where('si.invoice_date', '>=', startDate)
      .where('si.invoice_date', '<=', endDate)
      .whereNotNull('sil.hsn_code')
      .select(
        'sil.hsn_code',
        this.db.raw('SUM(sil.quantity) as total_quantity'),
        this.db.raw('SUM(sil.taxable_amount) as total_taxable'),
        this.db.raw('SUM(sil.cgst_amount) as total_cgst'),
        this.db.raw('SUM(sil.sgst_amount) as total_sgst'),
        this.db.raw('SUM(sil.igst_amount) as total_igst'),
        this.db.raw('SUM(sil.total_amount) as total_value')
      )
      .groupBy('sil.hsn_code')
      .orderBy('sil.hsn_code');
  }

  // ═══════════════════════════════════════════════════════════
  // E-INVOICE READINESS CHECK
  // ═══════════════════════════════════════════════════════════

  async eInvoiceReadiness(companyId: string, invoiceId: string) {
    const invoice = await this.db('sales_invoices as si')
      .join('customers as c', 'si.customer_id', 'c.id')
      .join('companies as co', 'si.company_id', 'co.id')
      .where({ 'si.id': invoiceId, 'si.company_id': companyId, 'si.is_deleted': false })
      .select('si.*', 'c.gstin as buyer_gstin', 'c.name as buyer_name', 'co.gstin as seller_gstin', 'co.name as seller_name')
      .first();

    if (!invoice) throw new Error('Invoice not found');

    const issues: string[] = [];

    if (!invoice.seller_gstin) issues.push('Company GSTIN not configured');
    if (!invoice.buyer_gstin) issues.push('Customer GSTIN missing');
    if (!invoice.place_of_supply) issues.push('Place of supply missing');

    const lines = await this.db('sales_invoice_lines')
      .where({ invoice_id: invoiceId, is_deleted: false });

    for (const line of lines) {
      if (!line.hsn_code) issues.push(`Line ${line.line_number}: HSN code missing`);
    }

    return {
      invoice_number: invoice.invoice_number,
      is_ready: issues.length === 0,
      issues,
      irn: invoice.irn || null,
      irn_generated: !!invoice.irn,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // E-WAY BILL DATA EXTRACTION
  // ═══════════════════════════════════════════════════════════

  async eWayBillData(companyId: string, challanId: string) {
    const challan = await this.db('delivery_challans as dc')
      .join('sales_invoices as si', 'dc.invoice_id', 'si.id')
      .join('customers as c', 'si.customer_id', 'c.id')
      .join('companies as co', 'dc.company_id', 'co.id')
      .where({ 'dc.id': challanId, 'dc.company_id': companyId, 'dc.is_deleted': false })
      .select(
        'dc.*',
        'si.invoice_number', 'si.invoice_date', 'si.grand_total',
        'c.gstin as consignee_gstin', 'c.name as consignee_name',
        'co.gstin as consignor_gstin', 'co.name as consignor_name'
      )
      .first();

    if (!challan) throw new Error('Delivery challan not found');

    const lines = await this.db('delivery_challan_lines as dcl')
      .leftJoin('items as i', 'dcl.item_id', 'i.id')
      .leftJoin('products as p', 'dcl.product_id', 'p.id')
      .where({ 'dcl.challan_id': challanId, 'dcl.is_deleted': false })
      .select(
        'dcl.*',
        this.db.raw("COALESCE(i.hsn_code, p.hsn_code) as hsn_code"),
        this.db.raw("COALESCE(i.name, p.name) as item_name")
      );

    return {
      document_type: 'delivery_challan',
      document_number: challan.challan_number,
      document_date: challan.challan_date,
      consignor: { gstin: challan.consignor_gstin, name: challan.consignor_name },
      consignee: { gstin: challan.consignee_gstin, name: challan.consignee_name },
      transporter: challan.transporter_name || null,
      vehicle_number: challan.vehicle_number || null,
      lr_number: challan.lr_number || null,
      eway_bill_number: challan.eway_bill_number || null,
      invoice_number: challan.invoice_number,
      invoice_value: parseFloat(challan.grand_total || 0),
      items: lines.map((l: any) => ({
        hsn_code: l.hsn_code, name: l.item_name,
        quantity: parseFloat(l.quantity), value: parseFloat(l.line_total || 0),
      })),
    };
  }
}

export const gstComplianceService = new GSTComplianceService();