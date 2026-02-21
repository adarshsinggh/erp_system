// src/pages/purchase/DebitNoteForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { debitNotesApi, DebitNote, DebitNoteDetail } from '@/api/modules/debit-notes.api';
import { vendorBillsApi } from '@/api/modules/vendor-bills.api';
import { vendorsApi, Vendor } from '@/api/modules/vendors.api';
import { itemsApi, Item } from '@/api/modules/items.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const DN_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  applied: { label: 'Applied', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

const REASON_OPTIONS = [
  { value: 'return', label: 'Return' },
  { value: 'pricing_error', label: 'Pricing Error' },
  { value: 'quality', label: 'Quality Issue' },
  { value: 'shortage', label: 'Shortage' },
];

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
  hsn_code: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
}

function emptyLine(): FormLine {
  return {
    item_id: '', item_code: '', item_name: '', description: '',
    quantity: 1, uom_id: '', uom_code: '', unit_price: 0, hsn_code: '',
    cgst_rate: 9, sgst_rate: 9, igst_rate: 0,
  };
}

function calcLine(line: FormLine) {
  const taxable = line.quantity * line.unit_price;
  const cgst = taxable * line.cgst_rate / 100;
  const sgst = taxable * line.sgst_rate / 100;
  const igst = taxable * line.igst_rate / 100;
  return { taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst };
}

export function DebitNoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    vendor_id: '', debit_note_date: new Date().toISOString().slice(0, 10),
    vendor_bill_id: '', reason: 'return' as DebitNote['reason'], reason_detail: '',
    internal_notes: '',
  });
  const [billNumber, setBillNumber] = useState('');
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

  const [billList, setBillList] = useState<{ id: string; bill_number: string }[]>([]);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;

  // Compute totals from lines
  const lineTotals = lines.reduce((acc, line) => {
    const c = calcLine(line);
    return { subtotal: acc.subtotal + c.taxable, cgst: acc.cgst + c.cgst, sgst: acc.sgst + c.sgst, igst: acc.igst + c.igst, total: acc.total + c.total };
  }, { subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/purchase/debit-notes'),
  });

  // Load vendor bills when vendor changes
  useEffect(() => {
    if (form.vendor_id) {
      vendorBillsApi.list({ vendor_id: form.vendor_id, limit: 50 })
        .then((r) => setBillList((r.data || []).map((b: any) => ({ id: b.id, bill_number: b.bill_number || b.vendor_bill_number || b.id.slice(0, 8) }))))
        .catch(() => {});
    } else {
      setBillList([]);
    }
  }, [form.vendor_id]);

  useEffect(() => { if (isEdit) loadDN(); }, [id]);

  async function loadDN() {
    setLoading(true);
    try {
      const res = await debitNotesApi.getById(id!);
      const dn = res.data;
      setStatus(dn.status);
      setForm({
        vendor_id: dn.vendor_id || '', debit_note_date: dn.debit_note_date || '',
        vendor_bill_id: dn.vendor_bill_id || '', reason: (dn.reason || 'return') as DebitNote['reason'],
        reason_detail: dn.reason_detail || '',
        internal_notes: '',
      });
      if (dn.vendor_bill) setBillNumber(dn.vendor_bill.bill_number);
      if (dn.vendor) { setSelectedVendor(dn.vendor as unknown as Vendor); setVendorSearch(dn.vendor.name); }
      if (dn.lines?.length) {
        setLines(dn.lines.map((l: any) => ({
          id: l.id, item_id: l.item_id || '', item_code: l.item_code || '',
          item_name: l.item_name || '', description: l.description || '',
          quantity: l.quantity || 1, uom_id: l.uom_id || '', uom_code: l.uom_code || '',
          unit_price: l.unit_price || 0, hsn_code: l.hsn_code || '',
          cgst_rate: l.cgst_rate || 0, sgst_rate: l.sgst_rate || 0, igst_rate: l.igst_rate || 0,
        })));
      }
    } catch (err: any) { toast.error(err.message); navigate('/purchase/debit-notes'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (debouncedVendorSearch?.length >= 1)
      vendorsApi.list({ search: debouncedVendorSearch, limit: 10, status: 'active' }).then((r) => setVendorResults(r.data || [])).catch(() => {});
    else setVendorResults([]);
  }, [debouncedVendorSearch]);

  useEffect(() => {
    if (debouncedItemSearch?.length >= 1)
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
    if (!form.debit_note_date) { toast.error('Please enter date'); return; }
    const validLines = lines.filter((l) => l.item_id && l.quantity > 0);
    if (!validLines.length) { toast.error('Add at least one line item'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        subtotal: lineTotals.subtotal,
        cgst_amount: lineTotals.cgst,
        sgst_amount: lineTotals.sgst,
        igst_amount: lineTotals.igst,
        vendor_bill_id: form.vendor_bill_id || null,
        lines: validLines.map((l) => ({
          id: l.id, item_id: l.item_id, description: l.description, quantity: l.quantity,
          uom_id: l.uom_id, unit_price: l.unit_price, hsn_code: l.hsn_code,
          cgst_rate: l.cgst_rate, sgst_rate: l.sgst_rate, igst_rate: l.igst_rate,
        })),
      };
      if (isEdit) { await debitNotesApi.update(id!, payload); toast.success('Debit note updated'); loadDN(); }
      else { const res = await debitNotesApi.create(payload); toast.success('Debit note created'); navigate(`/purchase/debit-notes/${res.data.id}`); }
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: string) {
    try {
      if (action === 'approve') { await debitNotesApi.approve(id!); toast.success('Debit note approved'); }
      else if (action === 'apply') { await debitNotesApi.apply(id!); toast.success('Debit note applied'); }
      else if (action === 'cancel') { await debitNotesApi.cancel(id!); toast.success('Debit note cancelled'); }
      loadDN();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete() {
    try { await debitNotesApi.delete(id!); toast.success('Debit note deleted'); navigate('/purchase/debit-notes'); }
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
      <PageHeader title={isEdit ? 'Debit Note' : 'New Debit Note'}
        subtitle={selectedVendor?.name} actions={getActions()} />

      {isEdit && (
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={status} statusMap={DN_STATUSES} />
          {billNumber && (
            <Link to={`/purchase/bills/${form.vendor_bill_id}`} className="text-xs text-purple-600 hover:text-purple-800 font-medium">
              Bill: {billNumber}
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
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
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
          <FormField label="Date" required>
            <Input type="date" value={form.debit_note_date} onChange={(e) => setForm((f) => ({ ...f, debit_note_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Linked Vendor Bill">
            <Select value={form.vendor_bill_id} onChange={(e) => setForm((f) => ({ ...f, vendor_bill_id: e.target.value }))}
              options={[{ value: '', label: 'Select bill (optional)...' }, ...billList.map((b) => ({ value: b.id, label: b.bill_number }))]}
              disabled={readonly} />
          </FormField>
          <FormField label="Reason" required>
            <Select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as DebitNote['reason'] }))}
              options={REASON_OPTIONS} disabled={readonly} />
          </FormField>
          <FormField label="Reason Detail" className="md:col-span-2">
            <Input value={form.reason_detail} onChange={(e) => setForm((f) => ({ ...f, reason_detail: e.target.value }))}
              placeholder="Additional details..." disabled={readonly} />
          </FormField>
        </div>
      </div>

      {/* Line Items */}
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
                        <span className="text-xs">{line.item_code} - {line.item_name}</span>
                      ) : (
                        <>
                          <Input value={itemSearchIdx === idx ? itemSearch : (line.item_code ? `${line.item_code} - ${line.item_name}` : '')}
                            onChange={(e) => { setItemSearchIdx(idx); setItemSearch(e.target.value); }}
                            onFocus={() => setItemSearchIdx(idx)} placeholder="Search item..." className="!py-1 !text-xs h-8" />
                          {itemSearchIdx === idx && itemResults.length > 0 && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
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
                    <td className="py-2 px-2 text-xs text-gray-500 font-mono">{line.hsn_code || '—'}</td>
                    <td className="py-2 px-2 text-xs text-gray-500 text-right">
                      {line.igst_rate > 0 ? `${line.igst_rate}%` : `${line.cgst_rate + line.sgst_rate}%`}
                    </td>
                    <td className="py-2 px-2 text-right"><AmountDisplay value={lc.total} /></td>
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
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><AmountDisplay value={lineTotals.subtotal} /></div>
            {lineTotals.cgst > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><AmountDisplay value={lineTotals.cgst} /></div>}
            {lineTotals.sgst > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><AmountDisplay value={lineTotals.sgst} /></div>}
            {lineTotals.igst > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><AmountDisplay value={lineTotals.igst} /></div>}
            <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold"><span>Total</span><AmountDisplay value={lineTotals.total} /></div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <FormField label="Internal Notes">
          <Textarea value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} rows={3} disabled={readonly} />
        </FormField>
      </div>

      <ConfirmDialog open={deleteConfirm} title="Delete Debit Note" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
    </div>
  );
}