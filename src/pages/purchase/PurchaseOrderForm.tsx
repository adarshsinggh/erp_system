// src/pages/purchase/PurchaseOrderForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { purchaseOrdersApi, PurchaseOrderDetail } from '@/api/modules/purchase-orders.api';
import { vendorsApi, Vendor } from '@/api/modules/vendors.api';
import { itemsApi, Item } from '@/api/modules/items.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { PURCHASE_ORDER_STATUSES } from '@/lib/constants';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';

interface FormLine {
  id?: string;
  item_id: string;
  item_code: string;
  item_name: string;
  description: string;
  quantity: number;
  uom_id: string;
  uom_code: string;
  unit_price: number;
  discount_amount: number;
  hsn_code: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  warehouse_id?: string;
  received_quantity?: number;
  billed_quantity?: number;
}

function emptyLine(): FormLine {
  return {
    item_id: '', item_code: '', item_name: '', description: '',
    quantity: 1, uom_id: '', uom_code: '', unit_price: 0, discount_amount: 0,
    hsn_code: '', cgst_rate: 9, sgst_rate: 9, igst_rate: 0,
  };
}

function calcLine(line: FormLine) {
  const subtotal = line.quantity * line.unit_price;
  const taxable = subtotal - line.discount_amount;
  const cgst = taxable * line.cgst_rate / 100;
  const sgst = taxable * line.sgst_rate / 100;
  const igst = taxable * line.igst_rate / 100;
  return { subtotal, taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst };
}

function calcTotals(lines: FormLine[]) {
  let subtotal = 0, totalDiscount = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
  for (const line of lines) {
    const c = calcLine(line);
    subtotal += c.subtotal; totalDiscount += line.discount_amount;
    totalCgst += c.cgst; totalSgst += c.sgst; totalIgst += c.igst;
  }
  const totalTax = totalCgst + totalSgst + totalIgst;
  return { subtotal, totalDiscount, totalCgst, totalSgst, totalIgst, totalTax, grandTotal: subtotal - totalDiscount + totalTax };
}

export function PurchaseOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const [form, setForm] = useState({
    vendor_id: '', po_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: '', warehouse_id: '', payment_terms_days: '30',
    requisition_id: '', terms_and_conditions: '', internal_notes: '',
    currency_code: 'INR',
  });
  const [requisitionNumber, setRequisitionNumber] = useState('');
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorResults, setVendorResults] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const debouncedVendorSearch = useDebounce(vendorSearch, 300);

  const [itemSearchIdx, setItemSearchIdx] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<Item[]>([]);
  const debouncedItemSearch = useDebounce(itemSearch, 300);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;
  const totals = calcTotals(lines);

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/purchase/orders'),
  });

  useEffect(() => { if (isEdit) loadPO(); }, [id]);

  async function loadPO() {
    setLoading(true);
    try {
      const res = await purchaseOrdersApi.getById(id!);
      const po = res.data;
      setStatus(po.status);
      setForm({
        vendor_id: po.vendor_id || '', po_date: po.po_date || '',
        expected_delivery_date: po.expected_delivery_date || '',
        warehouse_id: po.warehouse_id || '', payment_terms_days: po.payment_terms_days ? String(po.payment_terms_days) : '30',
        requisition_id: po.requisition_id || '', terms_and_conditions: po.terms_and_conditions || '',
        internal_notes: po.internal_notes || '', currency_code: po.currency_code || 'INR',
      });
      if (po.requisition) setRequisitionNumber(po.requisition.requisition_number);
      if (po.vendor) { setSelectedVendor(po.vendor as unknown as Vendor); setVendorSearch(po.vendor.name); }
      if (po.lines?.length) {
        setLines(po.lines.map((l: any) => ({
          id: l.id, item_id: l.item_id || '', item_code: l.item_code || '',
          item_name: l.item_name || '', description: l.description || '',
          quantity: l.quantity || 1, uom_id: l.uom_id || '', uom_code: l.uom_code || '',
          unit_price: l.unit_price || 0, discount_amount: l.discount_amount || 0,
          hsn_code: l.hsn_code || '',
          cgst_rate: l.cgst_rate || 0, sgst_rate: l.sgst_rate || 0, igst_rate: l.igst_rate || 0,
          warehouse_id: l.warehouse_id, received_quantity: l.received_quantity || 0,
          billed_quantity: l.billed_quantity || 0,
        })));
      }
    } catch (err: any) { toast.error(err.message); navigate('/purchase/orders'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (debouncedVendorSearch?.length >= 2)
      vendorsApi.list({ search: debouncedVendorSearch, limit: 10, status: 'active' }).then((r) => setVendorResults(r.data || [])).catch(() => {});
    else setVendorResults([]);
  }, [debouncedVendorSearch]);

  useEffect(() => {
    if (debouncedItemSearch?.length >= 2)
      itemsApi.list({ search: debouncedItemSearch, limit: 10, status: 'active' }).then((r) => setItemResults(r.data || [])).catch(() => {});
    else setItemResults([]);
  }, [debouncedItemSearch]);

  function selectVendor(v: Vendor) {
    setSelectedVendor(v); setVendorSearch(v.name);
    setForm((f) => ({ ...f, vendor_id: v.id })); setShowVendorDropdown(false);
  }
  function selectItem(idx: number, item: Item) {
    setLines((prev) => prev.map((line, i) => i === idx ? {
      ...line, item_id: item.id, item_code: item.item_code, item_name: item.name,
      uom_id: item.primary_uom_id || '', uom_code: item.uom_code || '',
      unit_price: item.purchase_price || 0, hsn_code: item.hsn_code || '',
      cgst_rate: item.gst_rate ? item.gst_rate / 2 : 9,
      sgst_rate: item.gst_rate ? item.gst_rate / 2 : 9,
    } : line));
    setItemSearchIdx(null); setItemSearch('');
  }
  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(idx: number) { if (lines.length > 1) setLines((prev) => prev.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: keyof FormLine, value: any) {
    setLines((prev) => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line));
  }

  async function handleSave() {
    if (!form.vendor_id) { toast.error('Please select a vendor'); return; }
    if (!form.po_date) { toast.error('Please enter PO date'); return; }
    const validLines = lines.filter((l) => l.item_id && l.quantity > 0);
    if (!validLines.length) { toast.error('Add at least one line item'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form, payment_terms_days: parseInt(form.payment_terms_days) || 30,
        lines: validLines.map((l) => ({
          id: l.id, item_id: l.item_id, description: l.description, quantity: l.quantity,
          uom_id: l.uom_id, unit_price: l.unit_price, discount_amount: l.discount_amount,
          hsn_code: l.hsn_code, cgst_rate: l.cgst_rate, sgst_rate: l.sgst_rate, igst_rate: l.igst_rate,
          warehouse_id: l.warehouse_id,
        })),
      };
      if (isEdit) { await purchaseOrdersApi.update(id!, payload); toast.success('PO updated'); loadPO(); }
      else { const res = await purchaseOrdersApi.create(payload); toast.success('PO created'); navigate(`/purchase/orders/${res.data.id}`); }
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: string) {
    try {
      if (action === 'approve') { await purchaseOrdersApi.approve(id!); toast.success('PO approved'); }
      else if (action === 'send') { await purchaseOrdersApi.send(id!); toast.success('PO sent to vendor'); }
      else if (action === 'cancel') { await purchaseOrdersApi.cancel(id!); toast.success('PO cancelled'); }
      else if (action === 'close') { await purchaseOrdersApi.close(id!); toast.success('PO closed'); }
      loadPO();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete() {
    try { await purchaseOrdersApi.delete(id!); toast.success('PO deleted'); navigate('/purchase/orders'); }
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
      a.push({ label: 'Send to Vendor', variant: 'primary', onClick: () => handleAction('send') });
    if (['approved', 'sent', 'partially_received'].includes(status))
      a.push({ label: 'Cancel', variant: 'danger', onClick: () => setCancelConfirm(true) });
    if (['partially_received', 'received'].includes(status))
      a.push({ label: 'Close', variant: 'default', onClick: () => handleAction('close') });
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
      <PageHeader title={isEdit ? 'Purchase Order' : 'New Purchase Order'}
        subtitle={selectedVendor?.name} actions={getActions()} />

      {isEdit && (
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={status} statusMap={PURCHASE_ORDER_STATUSES} />
          {requisitionNumber && (
            <Link to={`/purchase/requisitions/${form.requisition_id}`} className="text-xs text-purple-600 hover:text-purple-800 font-medium">
              PR: {requisitionNumber}
            </Link>
          )}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Vendor" required className="relative">
            <Input value={vendorSearch} onChange={(e) => { setVendorSearch(e.target.value); setShowVendorDropdown(true); }}
              onFocus={() => setShowVendorDropdown(true)} placeholder="Search vendor..." disabled={readonly} />
            {showVendorDropdown && vendorResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {vendorResults.map((v) => (
                  <button key={v.id} type="button" onClick={() => selectVendor(v)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                    <span className="font-medium">{v.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{v.vendor_code}</span>
                  </button>
                ))}
              </div>
            )}
          </FormField>
          <FormField label="PO Date" required>
            <Input type="date" value={form.po_date} onChange={(e) => setForm((f) => ({ ...f, po_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Expected Delivery Date">
            <Input type="date" value={form.expected_delivery_date} onChange={(e) => setForm((f) => ({ ...f, expected_delivery_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Payment Terms (Days)">
            <Input type="number" value={form.payment_terms_days} onChange={(e) => setForm((f) => ({ ...f, payment_terms_days: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Currency">
            <Select value={form.currency_code} onChange={(e) => setForm((f) => ({ ...f, currency_code: e.target.value }))}
              options={[{ value: 'INR', label: 'INR - Indian Rupee' }, { value: 'USD', label: 'USD - US Dollar' }]} disabled={readonly} />
          </FormField>
          <FormField label="Warehouse">
            <Input value={form.warehouse_id} onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
              placeholder="Warehouse UUID" disabled={readonly} />
          </FormField>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Line Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 w-8 text-gray-500 font-medium">#</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Item</th>
                <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Qty</th>
                <th className="text-left py-2 px-2 w-16 text-gray-500 font-medium">UOM</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Price</th>
                <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Disc</th>
                <th className="text-left py-2 px-2 w-20 text-gray-500 font-medium">HSN</th>
                <th className="text-right py-2 px-2 w-16 text-gray-500 font-medium">Tax</th>
                <th className="text-right py-2 px-2 w-28 text-gray-500 font-medium">Total</th>
                {readonly && <th className="text-right py-2 px-2 w-16 text-gray-500 font-medium">Rcvd</th>}
                {readonly && <th className="text-right py-2 px-2 w-16 text-gray-500 font-medium">Billed</th>}
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
                        <span className="text-xs">{line.item_code} - {line.item_name}</span>
                      ) : (
                        <>
                          <Input value={itemSearchIdx === idx ? itemSearch : (line.item_code ? `${line.item_code} - ${line.item_name}` : '')}
                            onChange={(e) => { setItemSearchIdx(idx); setItemSearch(e.target.value); }}
                            onFocus={() => setItemSearchIdx(idx)} placeholder="Search item..." className="!py-1 !text-xs h-8" />
                          {itemSearchIdx === idx && itemResults.length > 0 && (
                            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
                              {itemResults.map((it) => (
                                <button key={it.id} type="button" onClick={() => selectItem(idx, it)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">
                                  <span className="font-mono font-medium">{it.item_code}</span>
                                  <span className="ml-2">{it.name}</span>
                                  <span className="ml-2 text-gray-400">₹{it.purchase_price}</span>
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
                      <Input type="number" value={line.discount_amount} onChange={(e) => updateLine(idx, 'discount_amount', parseFloat(e.target.value) || 0)}
                        disabled={readonly} className="!py-1 !text-xs h-8 text-right w-16" min={0} />
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500 font-mono">{line.hsn_code || '—'}</td>
                    <td className="py-2 px-2 text-xs text-gray-500 text-right">
                      {line.igst_rate > 0 ? `${line.igst_rate}%` : `${line.cgst_rate + line.sgst_rate}%`}
                    </td>
                    <td className="py-2 px-2 text-right"><AmountDisplay value={lc.total} compact /></td>
                    {readonly && <td className="py-2 px-2 text-right text-xs text-gray-500">{line.received_quantity || 0}</td>}
                    {readonly && <td className="py-2 px-2 text-right text-xs text-gray-500">{line.billed_quantity || 0}</td>}
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

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><AmountDisplay value={totals.subtotal} /></div>
            {totals.totalDiscount > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="text-red-600">-<AmountDisplay value={totals.totalDiscount} /></span></div>}
            {totals.totalCgst > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><AmountDisplay value={totals.totalCgst} /></div>}
            {totals.totalSgst > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><AmountDisplay value={totals.totalSgst} /></div>}
            {totals.totalIgst > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><AmountDisplay value={totals.totalIgst} /></div>}
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold"><span>Grand Total</span><AmountDisplay value={totals.grandTotal} /></div>
          </div>
        </div>
      </div>

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

      <ConfirmDialog open={deleteConfirm} title="Delete PO" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
      <ConfirmDialog open={cancelConfirm} title="Cancel PO" message="This will cancel the purchase order."
        variant="danger" confirmLabel="Cancel PO" onConfirm={() => { setCancelConfirm(false); handleAction('cancel'); }} onCancel={() => setCancelConfirm(false)} />
    </div>
  );
}