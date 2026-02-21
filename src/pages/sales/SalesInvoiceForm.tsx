// src/pages/sales/SalesInvoiceForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { salesInvoicesApi, SalesInvoiceDetail, InvoiceLine, InvoicePayment } from '@/api/modules/sales-invoices.api';
import { customersApi, Customer } from '@/api/modules/customers.api';
import { productsApi, Product } from '@/api/modules/products.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { INVOICE_STATUSES, INDIAN_STATES } from '@/lib/constants';
import { formatDate } from '@/lib/formatters';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';

interface FormLine {
  id?: string;
  product_id: string;
  product_code: string;
  product_name: string;
  description: string;
  quantity: number;
  uom_id: string;
  uom_code: string;
  unit_price: number;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  hsn_code: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  warehouse_id?: string;
}

function emptyLine(): FormLine {
  return {
    product_id: '', product_code: '', product_name: '', description: '',
    quantity: 1, uom_id: '', uom_code: '', unit_price: 0,
    discount_type: 'percentage', discount_value: 0, hsn_code: '',
    cgst_rate: 9, sgst_rate: 9, igst_rate: 0,
  };
}

function calcLine(line: FormLine) {
  const subtotal = Number(line.quantity) * Number(line.unit_price);
  const discount = line.discount_type === 'percentage' ? subtotal * Number(line.discount_value) / 100 : Number(line.discount_value);
  const taxable = subtotal - discount;
  const cgst = taxable * Number(line.cgst_rate) / 100;
  const sgst = taxable * Number(line.sgst_rate) / 100;
  const igst = taxable * Number(line.igst_rate) / 100;
  return { subtotal, discount, taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst };
}

function calcTotals(lines: FormLine[], tcsRate: number) {
  let subtotal = 0, totalDiscount = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
  for (const line of lines) {
    const c = calcLine(line);
    subtotal += c.subtotal; totalDiscount += c.discount;
    totalCgst += c.cgst; totalSgst += c.sgst; totalIgst += c.igst;
  }
  const totalTax = totalCgst + totalSgst + totalIgst;
  const taxableTotal = subtotal - totalDiscount;
  const tcsAmount = taxableTotal * tcsRate / 100;
  const grandTotal = taxableTotal + totalTax + tcsAmount;
  return { subtotal, totalDiscount, totalCgst, totalSgst, totalIgst, totalTax, tcsAmount, grandTotal };
}

export function SalesInvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const [form, setForm] = useState({
    customer_id: '', invoice_date: new Date().toISOString().slice(0, 10),
    due_date: '', sales_order_id: '', place_of_supply: '09',
    is_reverse_charge: false, tcs_rate: '0',
    terms_and_conditions: '', internal_notes: '', currency_code: 'INR',
  });
  const [amountPaid, setAmountPaid] = useState(0);
  const [amountDue, setAmountDue] = useState(0);
  const [irn, setIrn] = useState<string | null>(null);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const debouncedCustSearch = useDebounce(customerSearch, 300);

  const [productSearchIdx, setProductSearchIdx] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const debouncedProdSearch = useDebounce(productSearch, 300);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/sales/invoices'),
  });

  useEffect(() => { if (isEdit) loadInvoice(); }, [id]);

  async function loadInvoice() {
    setLoading(true);
    try {
      const res = await salesInvoicesApi.getById(id!);
      const inv = res.data;
      setStatus(inv.status);
      setAmountPaid(inv.amount_paid || 0);
      setAmountDue(inv.amount_due || 0);
      setIrn(inv.irn);
      setPayments(inv.payments || []);
      setForm({
        customer_id: inv.customer_id || '',
        invoice_date: inv.invoice_date ? String(inv.invoice_date).substring(0, 10) : '',
        due_date: inv.due_date ? String(inv.due_date).substring(0, 10) : '',
        sales_order_id: inv.sales_order_id || '',
        place_of_supply: inv.place_of_supply || '09',
        is_reverse_charge: !!inv.is_reverse_charge,
        tcs_rate: inv.tcs_rate ? String(inv.tcs_rate) : '0',
        terms_and_conditions: inv.terms_and_conditions || '',
        internal_notes: inv.internal_notes || '', currency_code: inv.currency_code || 'INR',
      });
      if (inv.customer) { setSelectedCustomer(inv.customer as unknown as Customer); setCustomerSearch(inv.customer.name); }
      if (inv.lines?.length) {
        setLines(inv.lines.map((l: any) => ({
          id: l.id, product_id: l.product_id || '', product_code: l.product_code || '',
          product_name: l.product_name || '', description: l.description || '',
          quantity: l.quantity || 1, uom_id: l.uom_id || '', uom_code: l.uom_code || '',
          unit_price: l.unit_price || 0, discount_type: l.discount_type || 'percentage',
          discount_value: l.discount_value || 0, hsn_code: l.hsn_code || '',
          cgst_rate: l.cgst_rate || 0, sgst_rate: l.sgst_rate || 0, igst_rate: l.igst_rate || 0,
          warehouse_id: l.warehouse_id,
        })));
      }
    } catch (err: any) { toast.error(err.message); navigate('/sales/invoices'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (debouncedCustSearch?.length >= 2)
      customersApi.list({ search: debouncedCustSearch, limit: 10, status: 'active' }).then((r) => setCustomerResults(r.data || [])).catch(() => {});
    else setCustomerResults([]);
  }, [debouncedCustSearch]);

  useEffect(() => {
    if (debouncedProdSearch?.length >= 1)
      productsApi.list({ search: debouncedProdSearch, limit: 10, status: 'active' }).then((r) => setProductResults(r.data || [])).catch(() => {});
    else setProductResults([]);
  }, [debouncedProdSearch]);

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c); setCustomerSearch(c.name);
    setForm((f) => ({ ...f, customer_id: c.id })); setShowCustomerDropdown(false);
  }
  function selectProduct(idx: number, p: Product) {
    setLines((prev) => prev.map((line, i) => i === idx ? {
      ...line, product_id: p.id, product_code: p.product_code, product_name: p.name,
      unit_price: p.selling_price || 0, hsn_code: p.hsn_code || '',
      uom_id: p.primary_uom_id || '', uom_code: p.uom_code || '',
      cgst_rate: p.gst_rate ? p.gst_rate / 2 : 9, sgst_rate: p.gst_rate ? p.gst_rate / 2 : 9, igst_rate: 0,
    } : line));
    setProductSearchIdx(null); setProductSearch('');
  }
  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(idx: number) { if (lines.length > 1) setLines((prev) => prev.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: keyof FormLine, value: any) {
    setLines((prev) => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line));
  }

  // Recalculate tax type when Place of Supply changes
  // Default branch state code is '09' (UP) — inter-state → IGST, intra-state → CGST+SGST
  const BRANCH_STATE = '09';
  function handlePlaceOfSupplyChange(newPos: string) {
    setForm((f) => ({ ...f, place_of_supply: newPos }));
    const isInterState = newPos !== BRANCH_STATE;
    setLines((prev) => prev.map((line) => {
      if (!line.product_id) return line;
      const totalGst = Number(line.cgst_rate) + Number(line.sgst_rate) + Number(line.igst_rate);
      const gstRate = totalGst || 18;
      if (isInterState) {
        return { ...line, cgst_rate: 0, sgst_rate: 0, igst_rate: gstRate };
      } else {
        return { ...line, cgst_rate: gstRate / 2, sgst_rate: gstRate / 2, igst_rate: 0 };
      }
    }));
  }

  async function handleSave() {
    if (!form.customer_id) { toast.error('Please select a customer'); return; }
    if (!form.invoice_date) { toast.error('Please enter invoice date'); return; }
    const validLines = lines.filter((l) => l.product_id && l.quantity > 0);
    if (!validLines.length) { toast.error('Add at least one line item'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form, tcs_rate: parseFloat(form.tcs_rate) || 0,
        lines: validLines.map((l, i) => {
          const lineSubtotal = Number(l.quantity) * Number(l.unit_price);
          const discountAmt = l.discount_type === 'percentage'
            ? lineSubtotal * Number(l.discount_value) / 100
            : Number(l.discount_value);
          return {
            id: l.id, line_number: i + 1, product_id: l.product_id, description: l.description,
            quantity: l.quantity, uom_id: l.uom_id, unit_price: l.unit_price,
            discount_amount: discountAmt, hsn_code: l.hsn_code,
            warehouse_id: l.warehouse_id,
          };
        }),
      };
      if (isEdit) { await salesInvoicesApi.update(id!, payload); toast.success('Invoice updated'); loadInvoice(); }
      else { const res = await salesInvoicesApi.create(payload as any); toast.success('Invoice created'); navigate(`/sales/invoices/${res.data.id}`); }
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: string) {
    try {
      if (action === 'approve') { await salesInvoicesApi.approve(id!); toast.success('Invoice approved'); }
      else if (action === 'cancel') { await salesInvoicesApi.cancel(id!); toast.success('Invoice cancelled'); }
      loadInvoice();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete() {
    try { await salesInvoicesApi.delete(id!); toast.success('Invoice deleted'); navigate('/sales/invoices'); }
    catch (err: any) { toast.error(err.message); }
  }

  const totals = calcTotals(lines, parseFloat(form.tcs_rate) || 0);

  function getActions() {
    const a: any[] = [];
    if (isDraft) {
      a.push({ label: saving ? 'Saving...' : 'Save Draft', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving });
      if (isEdit) {
        a.push({ label: 'Approve', variant: 'default', onClick: () => handleAction('approve') });
        a.push({ label: 'Delete', variant: 'danger', onClick: () => setDeleteConfirm(true) });
      }
    }
    if (status === 'pending_approval')
      a.push({ label: 'Approve', variant: 'primary', onClick: () => handleAction('approve') });
    if (status !== 'cancelled' && status !== 'paid' && isEdit)
      a.push({ label: 'Cancel', variant: 'danger', onClick: () => setCancelConfirm(true) });
    if (isEdit && (status === 'approved' || status === 'partially_paid'))
      a.push({ label: 'Record Payment', variant: 'default', onClick: () => navigate(`/sales/payments/new?invoice_id=${id}&customer_id=${form.customer_id}`) });
    return a;
  }

  if (loading) return (
    <div className="space-y-4 animate-fade-in">
      <div className="skeleton h-8 w-64 rounded" />
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div>
        <div className="skeleton h-40 rounded" />
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title={isEdit ? 'Sales Invoice' : 'New Sales Invoice'}
        subtitle={selectedCustomer?.name} actions={getActions()} />

      {isEdit && (
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={status} statusMap={INVOICE_STATUSES} />
          {irn && <span className="text-xs text-gray-500 font-mono">IRN: {irn}</span>}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Customer" required className="relative">
            <Input value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
              onFocus={() => setShowCustomerDropdown(true)} placeholder="Search customer..." disabled={readonly} />
            {showCustomerDropdown && customerResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {customerResults.map((c) => (
                  <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{c.customer_code}</span>
                  </button>
                ))}
              </div>
            )}
          </FormField>
          <FormField label="Invoice Date" required>
            <Input type="date" value={form.invoice_date} onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Due Date">
            <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Place of Supply">
            <Select value={form.place_of_supply} onChange={(e) => handlePlaceOfSupplyChange(e.target.value)}
              options={Object.entries(INDIAN_STATES).map(([code, name]) => ({ value: code, label: `${code} - ${name}` }))}
              disabled={readonly} />
          </FormField>
          <FormField label="TCS Rate (%)">
            <Input type="number" value={form.tcs_rate} onChange={(e) => setForm((f) => ({ ...f, tcs_rate: e.target.value }))}
              disabled={readonly} min={0} step={0.01} />
          </FormField>
          <FormField label="Reverse Charge">
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" checked={form.is_reverse_charge}
                onChange={(e) => setForm((f) => ({ ...f, is_reverse_charge: e.target.checked }))}
                disabled={readonly} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm text-gray-600">Applicable</span>
            </label>
          </FormField>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Line Items</h3>
        <div className="overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 w-8 text-gray-500 font-medium">#</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Product</th>
                <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Qty</th>
                <th className="text-left py-2 px-2 w-16 text-gray-500 font-medium">UOM</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Price</th>
                <th className="text-right py-2 px-2 w-28 text-gray-500 font-medium">Discount</th>
                <th className="text-left py-2 px-2 w-20 text-gray-500 font-medium">HSN</th>
                <th className="text-right py-2 px-2 w-16 text-gray-500 font-medium">Tax</th>
                <th className="text-right py-2 px-2 w-28 text-gray-500 font-medium">Total</th>
                {!readonly && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const lc = calcLine(line);
                return (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="py-2 px-2 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="py-2 px-2 relative">
                      {readonly ? (
                        <span className="text-xs">{line.product_code} - {line.product_name}</span>
                      ) : (
                        <>
                          <Input value={productSearchIdx === idx ? productSearch : (line.product_code ? `${line.product_code} - ${line.product_name}` : '')}
                            onChange={(e) => { setProductSearchIdx(idx); setProductSearch(e.target.value); }}
                            onFocus={() => setProductSearchIdx(idx)} placeholder="Search product..." className="!py-1 !text-xs h-8" />
                          {productSearchIdx === idx && productResults.length > 0 && (
                            <div className="absolute z-50 top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto min-w-[320px]">
                              {productResults.map((p) => (
                                <button key={p.id} type="button" onClick={() => selectProduct(idx, p)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">
                                  <span className="font-mono font-medium">{p.product_code}</span>
                                  <span className="ml-2">{p.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500">{line.uom_code || '—'}</td>
                    <td className="py-2 px-2">
                      <Input type="number" value={line.unit_price} onChange={(e) => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                        disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <select value={line.discount_type} onChange={(e) => updateLine(idx, 'discount_type', e.target.value)}
                          disabled={readonly} className="text-xs border border-gray-300 rounded px-1 py-1 h-8 bg-white">
                          <option value="percentage">%</option>
                          <option value="fixed">₹</option>
                        </select>
                        <Input type="number" value={line.discount_value} onChange={(e) => updateLine(idx, 'discount_value', parseFloat(e.target.value) || 0)}
                          disabled={readonly} className="!py-1 !text-xs h-8 text-right w-16" min={0} />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500 font-mono">{line.hsn_code || '—'}</td>
                    <td className="py-2 px-2 text-xs text-gray-500 text-right">
                      {Number(line.igst_rate) > 0 ? `${Number(line.igst_rate)}%` : `${Number(line.cgst_rate) + Number(line.sgst_rate)}%`}
                    </td>
                    <td className="py-2 px-2 text-right"><AmountDisplay value={lc.total} compact /></td>
                    {!readonly && (
                      <td className="py-2 px-2">
                        <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-30">×</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!readonly && <button onClick={addLine} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">+ Add Line</button>}

        {/* Tax Summary */}
        <div className="flex justify-end mt-4">
          <div className="w-80 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><AmountDisplay value={totals.subtotal} /></div>
            {totals.totalDiscount > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="text-red-600">-<AmountDisplay value={totals.totalDiscount} /></span></div>}
            {totals.totalCgst > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><AmountDisplay value={totals.totalCgst} /></div>}
            {totals.totalSgst > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><AmountDisplay value={totals.totalSgst} /></div>}
            {totals.totalIgst > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><AmountDisplay value={totals.totalIgst} /></div>}
            {totals.tcsAmount > 0 && <div className="flex justify-between"><span className="text-gray-500">TCS ({form.tcs_rate}%)</span><AmountDisplay value={totals.tcsAmount} /></div>}
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
              <span>Grand Total</span><AmountDisplay value={totals.grandTotal} />
            </div>
            {isEdit && status !== 'draft' && (
              <>
                <div className="flex justify-between pt-1"><span className="text-gray-500">Paid</span><span className="text-green-600"><AmountDisplay value={amountPaid} /></span></div>
                <div className="flex justify-between font-semibold"><span className="text-gray-700">Amount Due</span><span className={amountDue > 0 ? 'text-red-600' : ''}><AmountDisplay value={amountDue} /></span></div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Payments History */}
      {isEdit && payments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment History</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-gray-500 font-medium">Receipt #</th>
                <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                <th className="text-left py-2 text-gray-500 font-medium">Mode</th>
                <th className="text-right py-2 text-gray-500 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2">
                    <Link to={`/sales/payments/${p.id}`} className="font-mono text-xs text-brand-700 hover:text-brand-800">{p.receipt_number}</Link>
                  </td>
                  <td className="py-2 text-xs">{formatDate(p.receipt_date)}</td>
                  <td className="py-2 text-xs capitalize">{p.payment_mode?.replace('_', ' ')}</td>
                  <td className="py-2 text-right"><AmountDisplay value={p.amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Terms & Conditions">
            <Textarea value={form.terms_and_conditions} onChange={(e) => setForm((f) => ({ ...f, terms_and_conditions: e.target.value }))} rows={3} disabled={readonly} />
          </FormField>
          <FormField label="Internal Notes">
            <Textarea value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} rows={3} disabled={readonly} />
          </FormField>
        </div>
      </div>

      <ConfirmDialog open={deleteConfirm} title="Delete Invoice" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
      <ConfirmDialog open={cancelConfirm} title="Cancel Invoice" message="This will cancel the invoice. Outstanding amounts will be reversed."
        variant="danger" confirmLabel="Cancel Invoice" onConfirm={() => { setCancelConfirm(false); handleAction('cancel'); }} onCancel={() => setCancelConfirm(false)} />
    </div>
  );
}