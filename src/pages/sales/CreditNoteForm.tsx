// src/pages/sales/CreditNoteForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { creditNotesApi, CreditNoteDetail, ReturnItem } from '@/api/modules/credit-notes.api';
import { customersApi, Customer } from '@/api/modules/customers.api';
import { productsApi, Product } from '@/api/modules/products.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const CN_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  applied: { label: 'Applied', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

const REASON_OPTIONS = [
  { value: 'return', label: 'Return' },
  { value: 'pricing_error', label: 'Pricing Error' },
  { value: 'quality', label: 'Quality Issue' },
  { value: 'goodwill', label: 'Goodwill' },
];

interface FormReturnItem {
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  uom_id: string;
  uom_code: string;
  warehouse_id: string;
}

function emptyReturnItem(): FormReturnItem {
  return { product_id: '', product_code: '', product_name: '', quantity: 1, uom_id: '', uom_code: '', warehouse_id: '' };
}

export function CreditNoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    customer_id: '', credit_note_date: new Date().toISOString().slice(0, 10),
    invoice_id: '', reason: 'return', reason_detail: '',
    subtotal: '0', cgst_amount: '0', sgst_amount: '0', igst_amount: '0',
    internal_notes: '',
  });
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [returnItems, setReturnItems] = useState<FormReturnItem[]>([]);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const debouncedCustSearch = useDebounce(customerSearch, 300);

  const [prodSearchIdx, setProdSearchIdx] = useState<number | null>(null);
  const [prodSearch, setProdSearch] = useState('');
  const [prodResults, setProdResults] = useState<Product[]>([]);
  const debouncedProdSearch = useDebounce(prodSearch, 300);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/sales/credit-notes'),
  });

  // Auto-calculate total
  useEffect(() => {
    const sub = parseFloat(form.subtotal) || 0;
    const cgst = parseFloat(form.cgst_amount) || 0;
    const sgst = parseFloat(form.sgst_amount) || 0;
    const igst = parseFloat(form.igst_amount) || 0;
    setTotalAmount(sub + cgst + sgst + igst);
  }, [form.subtotal, form.cgst_amount, form.sgst_amount, form.igst_amount]);

  useEffect(() => { if (isEdit) loadCN(); }, [id]);

  async function loadCN() {
    setLoading(true);
    try {
      const res = await creditNotesApi.getById(id!);
      const cn = res.data;
      setStatus(cn.status);
      setForm({
        customer_id: cn.customer_id || '',
        credit_note_date: cn.credit_note_date ? String(cn.credit_note_date).substring(0, 10) : '',
        invoice_id: cn.invoice_id || '', reason: cn.reason || 'return',
        reason_detail: cn.reason_detail || '',
        subtotal: cn.subtotal ? String(cn.subtotal) : '0',
        cgst_amount: cn.cgst_amount ? String(cn.cgst_amount) : '0',
        sgst_amount: cn.sgst_amount ? String(cn.sgst_amount) : '0',
        igst_amount: cn.igst_amount ? String(cn.igst_amount) : '0',
        internal_notes: cn.internal_notes || '',
      });
      if (cn.invoice) setInvoiceNumber(cn.invoice.invoice_number);
      if (cn.customer) { setSelectedCustomer(cn.customer as unknown as Customer); setCustomerSearch(cn.customer.name); }
      if (cn.return_items?.length) {
        setReturnItems(cn.return_items.map((r) => ({
          product_id: r.product_id, product_code: r.product_code || '',
          product_name: r.product_name || '', quantity: r.quantity,
          uom_id: r.uom_id || '', uom_code: r.uom_code || '',
          warehouse_id: r.warehouse_id || '',
        })));
      }
    } catch (err: any) { toast.error(err.message); navigate('/sales/credit-notes'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (debouncedCustSearch?.length >= 2)
      customersApi.list({ search: debouncedCustSearch, limit: 10, status: 'active' }).then((r) => setCustomerResults(r.data || [])).catch(() => {});
    else setCustomerResults([]);
  }, [debouncedCustSearch]);

  useEffect(() => {
    if (debouncedProdSearch?.length >= 2)
      productsApi.list({ search: debouncedProdSearch, limit: 10, status: 'active' }).then((r) => setProdResults(r.data || [])).catch(() => {});
    else setProdResults([]);
  }, [debouncedProdSearch]);

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c); setCustomerSearch(c.name);
    setForm((f) => ({ ...f, customer_id: c.id })); setShowCustomerDropdown(false);
  }
  function selectReturnProduct(idx: number, p: Product) {
    setReturnItems((prev) => prev.map((item, i) => i === idx ? {
      ...item, product_id: p.id, product_code: p.product_code, product_name: p.name,
      uom_id: p.primary_uom_id || '', uom_code: p.uom_code || '',
    } : item));
    setProdSearchIdx(null); setProdSearch('');
  }

  async function handleSave() {
    if (!form.customer_id) { toast.error('Please select a customer'); return; }
    if (!form.credit_note_date) { toast.error('Please enter date'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form, subtotal: parseFloat(form.subtotal) || 0,
        cgst_amount: parseFloat(form.cgst_amount) || 0,
        sgst_amount: parseFloat(form.sgst_amount) || 0,
        igst_amount: parseFloat(form.igst_amount) || 0,
        return_items: form.reason === 'return' ? returnItems.filter((r) => r.product_id && r.quantity > 0).map((r) => ({
          product_id: r.product_id, quantity: r.quantity, uom_id: r.uom_id, warehouse_id: r.warehouse_id,
        })) : undefined,
      };
      if (isEdit) { await creditNotesApi.update(id!, payload); toast.success('Credit note updated'); loadCN(); }
      else { const res = await creditNotesApi.create(payload); toast.success('Credit note created'); navigate(`/sales/credit-notes/${res.data.id}`); }
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: string) {
    try {
      if (action === 'approve') { await creditNotesApi.approve(id!); toast.success('Credit note approved'); }
      else if (action === 'apply') { await creditNotesApi.apply(id!); toast.success('Credit note applied'); }
      else if (action === 'cancel') { await creditNotesApi.cancel(id!); toast.success('Credit note cancelled'); }
      loadCN();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete() {
    try { await creditNotesApi.delete(id!); toast.success('Credit note deleted'); navigate('/sales/credit-notes'); }
    catch (err: any) { toast.error(err.message); }
  }

  function getActions() {
    const a: any[] = [];
    if (isDraft) {
      a.push({ label: saving ? 'Saving...' : 'Save Draft', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving });
      if (isEdit) {
        a.push({ label: 'Approve', variant: 'default', onClick: () => handleAction('approve') });
        a.push({ label: 'Delete', variant: 'danger', onClick: () => setDeleteConfirm(true) });
      }
    }
    if (status === 'approved')
      a.push({ label: 'Apply', variant: 'primary', onClick: () => handleAction('apply') });
    if (status !== 'applied' && status !== 'cancelled' && isEdit)
      a.push({ label: 'Cancel', variant: 'danger', onClick: () => handleAction('cancel') });
    return a;
  }

  if (loading) return (
    <div className="space-y-4 animate-fade-in">
      <div className="skeleton h-8 w-64 rounded" />
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title={isEdit ? 'Credit Note' : 'New Credit Note'}
        subtitle={selectedCustomer?.name} actions={getActions()} />

      {isEdit && (
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={status} statusMap={CN_STATUSES} />
          {invoiceNumber && (
            <Link to={`/sales/invoices/${form.invoice_id}`} className="text-xs text-purple-600 hover:text-purple-800 font-medium">
              Invoice: {invoiceNumber}
            </Link>
          )}
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
          <FormField label="Date" required>
            <Input type="date" value={form.credit_note_date} onChange={(e) => setForm((f) => ({ ...f, credit_note_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Linked Invoice">
            <Input value={form.invoice_id} onChange={(e) => setForm((f) => ({ ...f, invoice_id: e.target.value }))} placeholder="Invoice UUID (optional)" disabled={readonly} />
          </FormField>
          <FormField label="Reason" required>
            <Select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              options={REASON_OPTIONS} disabled={readonly} />
          </FormField>
          <FormField label="Reason Detail" className="md:col-span-2">
            <Input value={form.reason_detail} onChange={(e) => setForm((f) => ({ ...f, reason_detail: e.target.value }))}
              placeholder="Additional details..." disabled={readonly} />
          </FormField>
        </div>
      </div>

      {/* Amounts */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Amounts</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <FormField label="Subtotal">
            <Input type="number" value={form.subtotal} onChange={(e) => setForm((f) => ({ ...f, subtotal: e.target.value }))} disabled={readonly} min={0} />
          </FormField>
          <FormField label="CGST">
            <Input type="number" value={form.cgst_amount} onChange={(e) => setForm((f) => ({ ...f, cgst_amount: e.target.value }))} disabled={readonly} min={0} />
          </FormField>
          <FormField label="SGST">
            <Input type="number" value={form.sgst_amount} onChange={(e) => setForm((f) => ({ ...f, sgst_amount: e.target.value }))} disabled={readonly} min={0} />
          </FormField>
          <FormField label="IGST">
            <Input type="number" value={form.igst_amount} onChange={(e) => setForm((f) => ({ ...f, igst_amount: e.target.value }))} disabled={readonly} min={0} />
          </FormField>
          <FormField label="Total Amount">
            <div className="px-3 py-2 text-sm font-semibold bg-gray-50 border border-gray-200 rounded-lg">
              <AmountDisplay value={totalAmount} />
            </div>
          </FormField>
        </div>
      </div>

      {/* Return Items (only for reason=return) */}
      {form.reason === 'return' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Return Items</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 w-8 text-gray-500 font-medium">#</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Product</th>
                  <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Qty</th>
                  <th className="text-left py-2 px-2 w-16 text-gray-500 font-medium">UOM</th>
                  {!readonly && <th className="w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {returnItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-2 px-2 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="py-2 px-2 relative">
                      {readonly ? (
                        <span className="text-xs">{item.product_code} - {item.product_name}</span>
                      ) : (
                        <>
                          <Input value={prodSearchIdx === idx ? prodSearch : (item.product_code ? `${item.product_code} - ${item.product_name}` : '')}
                            onChange={(e) => { setProdSearchIdx(idx); setProdSearch(e.target.value); }}
                            onFocus={() => setProdSearchIdx(idx)} placeholder="Search product..." className="!py-1 !text-xs h-8" />
                          {prodSearchIdx === idx && prodResults.length > 0 && (
                            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
                              {prodResults.map((p) => (
                                <button key={p.id} type="button" onClick={() => selectReturnProduct(idx, p)}
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
                      <Input type="number" value={item.quantity}
                        onChange={(e) => setReturnItems((prev) => prev.map((r, i) => i === idx ? { ...r, quantity: parseFloat(e.target.value) || 0 } : r))}
                        disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500">{item.uom_code || '—'}</td>
                    {!readonly && (
                      <td className="py-2 px-2">
                        <button onClick={() => setReturnItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-gray-400 hover:text-red-500">×</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readonly && (
            <button onClick={() => setReturnItems((prev) => [...prev, emptyReturnItem()])}
              className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">+ Add Return Item</button>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <FormField label="Internal Notes">
          <Textarea value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} rows={3} disabled={readonly} />
        </FormField>
      </div>

      <ConfirmDialog open={deleteConfirm} title="Delete Credit Note" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
    </div>
  );
}