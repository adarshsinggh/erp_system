// src/pages/sales/QuotationForm.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { salesQuotationsApi, QuotationDetail, QuotationLine } from '@/api/modules/sales-quotations.api';
import { customersApi, Customer } from '@/api/modules/customers.api';
import { productsApi, Product } from '@/api/modules/products.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { QUOTATION_STATUSES } from '@/lib/constants';
import { formatDate } from '@/lib/formatters';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';

// ─── Line Item Type ─────────────────────────────────────────────
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
  discount_type: 'percentage' | 'amount';
  discount_value: number;
  hsn_code: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
}

function emptyLine(): FormLine {
  return {
    product_id: '', product_code: '', product_name: '', description: '',
    quantity: 1, uom_id: '', uom_code: '', unit_price: 0,
    discount_type: 'percentage', discount_value: 0, hsn_code: '',
    cgst_rate: 9, sgst_rate: 9, igst_rate: 0,
  };
}

// ─── Calculation Helpers ────────────────────────────────────────
function calcLine(line: FormLine) {
  const subtotal = line.quantity * line.unit_price;
  const discount = line.discount_type === 'percentage'
    ? subtotal * line.discount_value / 100
    : line.discount_value;
  const taxable = subtotal - discount;
  const cgst = taxable * line.cgst_rate / 100;
  const sgst = taxable * line.sgst_rate / 100;
  const igst = taxable * line.igst_rate / 100;
  const total = taxable + cgst + sgst + igst;
  return { subtotal, discount, taxable, cgst, sgst, igst, total };
}

function calcTotals(lines: FormLine[]) {
  let subtotal = 0, totalDiscount = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
  for (const line of lines) {
    const c = calcLine(line);
    subtotal += c.subtotal;
    totalDiscount += c.discount;
    totalCgst += c.cgst;
    totalSgst += c.sgst;
    totalIgst += c.igst;
  }
  const totalTax = totalCgst + totalSgst + totalIgst;
  const grandTotal = subtotal - totalDiscount + totalTax;
  return { subtotal, totalDiscount, totalCgst, totalSgst, totalIgst, totalTax, grandTotal };
}

// ─── Component ──────────────────────────────────────────────────
export function QuotationForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [convertConfirm, setConvertConfirm] = useState(false);

  // ─── Header State ─────────────────────────────────────
  const [form, setForm] = useState({
    customer_id: '', quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: '', reference_number: '',
    contact_person_id: '', billing_address_id: '', shipping_address_id: '',
    terms_and_conditions: '', internal_notes: '', currency_code: 'INR',
  });

  // ─── Lines State ──────────────────────────────────────
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  // ─── Customer Search ──────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  // ─── Product Search (per line) ────────────────────────
  const [productSearchIdx, setProductSearchIdx] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const debouncedProductSearch = useDebounce(productSearch, 300);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/sales/quotations'),
  });

  // ─── Load Existing ────────────────────────────────────
  useEffect(() => {
    if (isEdit) loadQuotation();
  }, [id]);

  async function loadQuotation() {
    setLoading(true);
    try {
      const res = await salesQuotationsApi.getById(id!);
      const q = res.data;
      setStatus(q.status);
      setForm({
        customer_id: q.customer_id || '',
        quotation_date: q.quotation_date || '',
        valid_until: q.valid_until || '',
        reference_number: q.reference_number || '',
        contact_person_id: q.contact_person_id || '',
        billing_address_id: q.billing_address_id || '',
        shipping_address_id: q.shipping_address_id || '',
        terms_and_conditions: q.terms_and_conditions || '',
        internal_notes: q.internal_notes || '',
        currency_code: q.currency_code || 'INR',
      });
      if (q.customer) {
        setSelectedCustomer(q.customer as unknown as Customer);
        setCustomerSearch(q.customer.name);
      }
      if (q.lines && q.lines.length > 0) {
        setLines(q.lines.map((l) => ({
          id: l.id, product_id: l.product_id || '', product_code: l.product_code || '',
          product_name: l.product_name || '', description: l.description || '',
          quantity: l.quantity || 1, uom_id: l.uom_id || '', uom_code: l.uom_code || '',
          unit_price: l.unit_price || 0, discount_type: l.discount_type || 'percentage',
          discount_value: l.discount_value || 0, hsn_code: l.hsn_code || '',
          cgst_rate: l.cgst_rate || 0, sgst_rate: l.sgst_rate || 0, igst_rate: l.igst_rate || 0,
        })));
      }
    } catch (err: any) {
      toast.error(err.message);
      navigate('/sales/quotations');
    } finally {
      setLoading(false);
    }
  }

  // ─── Customer Search Effect ───────────────────────────
  useEffect(() => {
    if (debouncedCustomerSearch && debouncedCustomerSearch.length >= 2) {
      customersApi.list({ search: debouncedCustomerSearch, limit: 10, status: 'active' })
        .then((res) => setCustomerResults(res.data || []))
        .catch(() => {});
    } else {
      setCustomerResults([]);
    }
  }, [debouncedCustomerSearch]);

  // ─── Product Search Effect ────────────────────────────
  useEffect(() => {
    if (debouncedProductSearch && debouncedProductSearch.length >= 2) {
      productsApi.list({ search: debouncedProductSearch, limit: 10, status: 'active' })
        .then((res) => setProductResults(res.data || []))
        .catch(() => {});
    } else {
      setProductResults([]);
    }
  }, [debouncedProductSearch]);

  // ─── Customer Select ──────────────────────────────────
  function selectCustomer(c: Customer) {
    setSelectedCustomer(c);
    setCustomerSearch(c.name);
    setForm((f) => ({ ...f, customer_id: c.id }));
    setShowCustomerDropdown(false);
  }

  // ─── Product Select for Line ──────────────────────────
  function selectProduct(idx: number, p: Product) {
    setLines((prev) => prev.map((line, i) => i === idx ? {
      ...line,
      product_id: p.id, product_code: p.product_code, product_name: p.name,
      unit_price: p.selling_price || 0, hsn_code: p.hsn_code || '',
      uom_id: p.primary_uom_id || '', uom_code: p.uom_code || '',
      cgst_rate: p.gst_rate ? p.gst_rate / 2 : 9,
      sgst_rate: p.gst_rate ? p.gst_rate / 2 : 9,
      igst_rate: 0,
    } : line));
    setProductSearchIdx(null);
    setProductSearch('');
  }

  // ─── Line Operations ──────────────────────────────────
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(idx: number) {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine(idx: number, field: keyof FormLine, value: any) {
    setLines((prev) => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line));
  }

  // ─── Save ─────────────────────────────────────────────
  async function handleSave() {
    if (!form.customer_id) { toast.error('Please select a customer'); return; }
    if (!form.quotation_date) { toast.error('Please enter quotation date'); return; }
    const validLines = lines.filter((l) => l.product_id && l.quantity > 0);
    if (validLines.length === 0) { toast.error('Please add at least one line item'); return; }

    setSaving(true);
    try {
      const payload = {
        ...form,
        lines: validLines.map((l, i) => ({
          id: l.id, line_number: i + 1, product_id: l.product_id, description: l.description,
          quantity: l.quantity, uom_id: l.uom_id, unit_price: l.unit_price,
          discount_type: l.discount_type, discount_value: l.discount_value, hsn_code: l.hsn_code,
          cgst_rate: l.cgst_rate, sgst_rate: l.sgst_rate, igst_rate: l.igst_rate,
        })),
      };
      if (isEdit) {
        await salesQuotationsApi.update(id!, payload);
        toast.success('Quotation updated');
      } else {
        const res = await salesQuotationsApi.create(payload as any);
        toast.success('Quotation created');
        navigate(`/sales/quotations/${res.data.id}`);
        return;
      }
      loadQuotation();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Status Actions ───────────────────────────────────
  async function handleAction(action: string) {
    try {
      switch (action) {
        case 'send': await salesQuotationsApi.send(id!); toast.success('Quotation sent'); break;
        case 'accept': await salesQuotationsApi.accept(id!); toast.success('Quotation accepted'); break;
        case 'reject': await salesQuotationsApi.reject(id!); toast.success('Quotation rejected'); break;
        case 'duplicate': {
          const res = await salesQuotationsApi.duplicate(id!);
          toast.success('Quotation duplicated');
          navigate(`/sales/quotations/${res.data.id}`);
          return;
        }
        case 'convert': {
          const res = await salesQuotationsApi.convertToSO(id!);
          toast.success('Converted to Sales Order');
          navigate(`/sales/orders/${res.data.sales_order_id}`);
          return;
        }
      }
      loadQuotation();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDelete() {
    try {
      await salesQuotationsApi.delete(id!);
      toast.success('Quotation deleted');
      navigate('/sales/quotations');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  // ─── Computed ─────────────────────────────────────────
  const totals = calcTotals(lines);

  // ─── Actions based on status ──────────────────────────
  function getActions() {
    const actions: { label: string; variant: string; onClick: () => void; shortcut?: string; disabled?: boolean }[] = [];
    if (isDraft) {
      actions.push({ label: saving ? 'Saving...' : 'Save Draft', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving });
      if (isEdit) {
        actions.push({ label: 'Send', variant: 'default', onClick: () => handleAction('send') });
        actions.push({ label: 'Delete', variant: 'danger', onClick: () => setDeleteConfirm(true) });
      }
    }
    if (status === 'sent') {
      actions.push({ label: 'Accept', variant: 'primary', onClick: () => handleAction('accept') });
      actions.push({ label: 'Reject', variant: 'danger', onClick: () => handleAction('reject') });
    }
    if (status === 'accepted') {
      actions.push({ label: 'Convert to SO', variant: 'primary', onClick: () => setConvertConfirm(true) });
    }
    if (isEdit && status !== 'converted') {
      actions.push({ label: 'Duplicate', variant: 'default', onClick: () => handleAction('duplicate') });
    }
    return actions;
  }

  // ─── Loading State ────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton h-8 w-64 rounded" />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
          </div>
          <div className="skeleton h-40 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? `Quotation ${form.reference_number || ''}` : 'New Quotation'}
        subtitle={isEdit && selectedCustomer ? selectedCustomer.name : undefined}
        actions={getActions() as any}
      />

      {/* Status Bar */}
      {isEdit && (
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={status} statusMap={QUOTATION_STATUSES} />
          {status === 'converted' && (
            <span className="text-xs text-gray-500">Converted to Sales Order</span>
          )}
        </div>
      )}

      {/* ─── Header Fields ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Customer Search */}
          <FormField label="Customer" required className="relative">
            <Input
              value={customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
              onFocus={() => setShowCustomerDropdown(true)}
              placeholder="Search customer..."
              disabled={readonly}
            />
            {showCustomerDropdown && customerResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {customerResults.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{c.customer_code}</span>
                  </button>
                ))}
              </div>
            )}
          </FormField>

          <FormField label="Quotation Date" required>
            <Input type="date" value={form.quotation_date}
              onChange={(e) => setForm((f) => ({ ...f, quotation_date: e.target.value }))}
              disabled={readonly} />
          </FormField>

          <FormField label="Valid Until">
            <Input type="date" value={form.valid_until}
              onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
              disabled={readonly} />
          </FormField>

          <FormField label="Reference Number">
            <Input value={form.reference_number}
              onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))}
              placeholder="e.g. REF-123"
              disabled={readonly} />
          </FormField>

          <FormField label="Currency">
            <Select value={form.currency_code}
              onChange={(e) => setForm((f) => ({ ...f, currency_code: e.target.value }))}
              options={[{ value: 'INR', label: 'INR - Indian Rupee' }, { value: 'USD', label: 'USD - US Dollar' }]}
              disabled={readonly} />
          </FormField>
        </div>
      </div>

      {/* ─── Line Items ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Line Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 w-8 text-gray-500 font-medium">#</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Product</th>
                <th className="text-left py-2 px-2 w-32 text-gray-500 font-medium">Description</th>
                <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Qty</th>
                <th className="text-left py-2 px-2 w-16 text-gray-500 font-medium">UOM</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Price</th>
                <th className="text-right py-2 px-2 w-28 text-gray-500 font-medium">Discount</th>
                <th className="text-left py-2 px-2 w-20 text-gray-500 font-medium">HSN</th>
                <th className="text-right py-2 px-2 w-16 text-gray-500 font-medium">Tax %</th>
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
                        <span>{line.product_code} - {line.product_name}</span>
                      ) : (
                        <>
                          <Input
                            value={productSearchIdx === idx ? productSearch : (line.product_code ? `${line.product_code} - ${line.product_name}` : '')}
                            onChange={(e) => { setProductSearchIdx(idx); setProductSearch(e.target.value); }}
                            onFocus={() => setProductSearchIdx(idx)}
                            placeholder="Search product..."
                            className="!py-1 !text-xs h-8"
                          />
                          {productSearchIdx === idx && productResults.length > 0 && (
                            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
                              {productResults.map((p) => (
                                <button key={p.id} type="button"
                                  onClick={() => selectProduct(idx, p)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">
                                  <span className="font-mono font-medium">{p.product_code}</span>
                                  <span className="ml-2">{p.name}</span>
                                  <span className="ml-2 text-gray-400">₹{p.selling_price}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <Input value={line.description}
                        onChange={(e) => updateLine(idx, 'description', e.target.value)}
                        disabled={readonly} className="!py-1 !text-xs h-8" placeholder="—" />
                    </td>
                    <td className="py-2 px-2">
                      <Input type="number" value={line.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500">{line.uom_code || '—'}</td>
                    <td className="py-2 px-2">
                      <Input type="number" value={line.unit_price}
                        onChange={(e) => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                        disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <select value={line.discount_type}
                          onChange={(e) => updateLine(idx, 'discount_type', e.target.value)}
                          disabled={readonly}
                          className="text-xs border border-gray-300 rounded px-1 py-1 h-8 bg-white">
                          <option value="percentage">%</option>
                          <option value="amount">₹</option>
                        </select>
                        <Input type="number" value={line.discount_value}
                          onChange={(e) => updateLine(idx, 'discount_value', parseFloat(e.target.value) || 0)}
                          disabled={readonly} className="!py-1 !text-xs h-8 text-right w-16" min={0} />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500 font-mono">{line.hsn_code || '—'}</td>
                    <td className="py-2 px-2 text-xs text-gray-500 text-right">
                      {line.igst_rate > 0 ? `${line.igst_rate}%` : `${line.cgst_rate + line.sgst_rate}%`}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <AmountDisplay value={lc.total} compact />
                    </td>
                    {!readonly && (
                      <td className="py-2 px-2">
                        <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-30" title="Remove line">
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!readonly && (
          <button onClick={addLine}
            className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">
            + Add Line
          </button>
        )}

        {/* ─── Totals Panel ──────────────────────────────── */}
        <div className="flex justify-end mt-4">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><AmountDisplay value={totals.subtotal} /></div>
            {totals.totalDiscount > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="text-red-600">-<AmountDisplay value={totals.totalDiscount} /></span></div>
            )}
            {totals.totalCgst > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">CGST</span><AmountDisplay value={totals.totalCgst} /></div>
            )}
            {totals.totalSgst > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">SGST</span><AmountDisplay value={totals.totalSgst} /></div>
            )}
            {totals.totalIgst > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">IGST</span><AmountDisplay value={totals.totalIgst} /></div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
              <span>Grand Total</span><AmountDisplay value={totals.grandTotal} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Notes ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Terms & Conditions">
            <Textarea value={form.terms_and_conditions}
              onChange={(e) => setForm((f) => ({ ...f, terms_and_conditions: e.target.value }))}
              rows={3} disabled={readonly} placeholder="Payment terms, warranty, etc." />
          </FormField>
          <FormField label="Internal Notes">
            <Textarea value={form.internal_notes}
              onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
              rows={3} disabled={readonly} placeholder="Notes for internal use only" />
          </FormField>
        </div>
      </div>

      {/* ─── Dialogs ─────────────────────────────────────── */}
      <ConfirmDialog open={deleteConfirm} title="Delete Quotation"
        message="Are you sure you want to delete this quotation? This cannot be undone."
        variant="danger" confirmLabel="Delete"
        onConfirm={() => { setDeleteConfirm(false); handleDelete(); }}
        onCancel={() => setDeleteConfirm(false)} />

      <ConfirmDialog open={convertConfirm} title="Convert to Sales Order"
        message="This will create a new Sales Order from this quotation. The quotation will be marked as converted."
        confirmLabel="Convert"
        onConfirm={() => { setConvertConfirm(false); handleAction('convert'); }}
        onCancel={() => setConvertConfirm(false)} />
    </div>
  );
}