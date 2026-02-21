// src/pages/purchase/PurchaseRequisitionForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { purchaseRequisitionsApi, PurchaseRequisition, PurchaseRequisitionDetail } from '@/api/modules/purchase-requisitions.api';
import { itemsApi, Item } from '@/api/modules/items.api';
import { vendorsApi, Vendor } from '@/api/modules/vendors.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { PRIORITY_CONFIG } from '@/lib/constants';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const PR_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  submitted: { label: 'Submitted', color: 'blue' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  converted: { label: 'Converted', color: 'purple' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual', auto_reorder: 'Auto Reorder', work_order: 'Work Order',
};

interface FormLine {
  id?: string;
  item_id: string;
  item_code: string;
  item_name: string;
  description: string;
  quantity: number;
  uom_id: string;
  uom_code: string;
  preferred_vendor_id: string;
  preferred_vendor_name: string;
  estimated_price: number;
  notes: string;
}

function emptyLine(): FormLine {
  return {
    item_id: '', item_code: '', item_name: '', description: '',
    quantity: 1, uom_id: '', uom_code: '',
    preferred_vendor_id: '', preferred_vendor_name: '',
    estimated_price: 0, notes: '',
  };
}

export function PurchaseRequisitionForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [rejectPrompt, setRejectPrompt] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [form, setForm] = useState({
    requisition_date: new Date().toISOString().slice(0, 10),
    required_by_date: '', priority: 'normal' as PurchaseRequisition['priority'], source: 'manual' as PurchaseRequisition['source'],
    purpose: '',
  });
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  // Item search
  const [itemSearchIdx, setItemSearchIdx] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<Item[]>([]);
  const debouncedItemSearch = useDebounce(itemSearch, 300);

  // Vendor search per line
  const [vendorSearchIdx, setVendorSearchIdx] = useState<number | null>(null);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorResults, setVendorResults] = useState<Vendor[]>([]);
  const debouncedVendorSearch = useDebounce(vendorSearch, 300);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/purchase/requisitions'),
  });

  useEffect(() => { if (isEdit) loadPR(); }, [id]);

  async function loadPR() {
    setLoading(true);
    try {
      const res = await purchaseRequisitionsApi.getById(id!);
      const pr = res.data;
      setStatus(pr.status);
      setRejectionReason(pr.rejection_reason || null);
      setForm({
        requisition_date: pr.requisition_date || '', required_by_date: pr.required_by_date || '',
        priority: (pr.priority || 'normal') as PurchaseRequisition['priority'], source: (pr.source || 'manual') as PurchaseRequisition['source'],
        purpose: pr.purpose || '',
      });
      if (pr.lines?.length) {
        setLines(pr.lines.map((l) => ({
          id: l.id, item_id: l.item_id || '', item_code: l.item_code || '',
          item_name: l.item_name || '', description: l.description || '',
          quantity: l.quantity || 1, uom_id: l.uom_id || '', uom_code: l.uom_code || '',
          preferred_vendor_id: l.preferred_vendor_id || '',
          preferred_vendor_name: l.preferred_vendor_name || '',
          estimated_price: l.estimated_price || 0, notes: l.notes || '',
        })));
      }
    } catch (err: any) { toast.error(err.message); navigate('/purchase/requisitions'); }
    finally { setLoading(false); }
  }

  // Item search effect
  useEffect(() => {
    if (debouncedItemSearch?.length >= 1)
      itemsApi.list({ search: debouncedItemSearch, limit: 10, status: 'active' }).then((r) => setItemResults(r.data || [])).catch(() => {});
    else setItemResults([]);
  }, [debouncedItemSearch]);

  // Vendor search effect
  useEffect(() => {
    if (debouncedVendorSearch?.length >= 1)
      vendorsApi.list({ search: debouncedVendorSearch, limit: 10, status: 'active' }).then((r) => setVendorResults(r.data || [])).catch(() => {});
    else setVendorResults([]);
  }, [debouncedVendorSearch]);

  function selectItem(idx: number, item: Item) {
    setLines((prev) => prev.map((line, i) => i === idx ? {
      ...line, item_id: item.id, item_code: item.item_code, item_name: item.name,
      uom_id: item.primary_uom_id || '', uom_code: item.uom_code || '',
      estimated_price: item.purchase_price || 0,
    } : line));
    setItemSearchIdx(null); setItemSearch('');
  }

  function selectVendor(idx: number, v: Vendor) {
    setLines((prev) => prev.map((line, i) => i === idx ? {
      ...line, preferred_vendor_id: v.id, preferred_vendor_name: v.name,
    } : line));
    setVendorSearchIdx(null); setVendorSearch('');
  }

  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(idx: number) { if (lines.length > 1) setLines((prev) => prev.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: keyof FormLine, value: any) {
    setLines((prev) => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line));
  }

  const estimatedTotal = lines.reduce((sum, l) => sum + l.quantity * l.estimated_price, 0);

  async function handleSave() {
    if (!form.requisition_date) { toast.error('Please enter requisition date'); return; }
    const validLines = lines.filter((l) => l.item_id && l.quantity > 0);
    if (!validLines.length) { toast.error('Add at least one line item'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        lines: validLines.map((l) => ({
          id: l.id, item_id: l.item_id, description: l.description, quantity: l.quantity,
          uom_id: l.uom_id, preferred_vendor_id: l.preferred_vendor_id || null,
          estimated_price: l.estimated_price, notes: l.notes,
        })),
      };
      if (isEdit) { await purchaseRequisitionsApi.update(id!, payload); toast.success('Requisition updated'); loadPR(); }
      else { const res = await purchaseRequisitionsApi.create(payload); toast.success('Requisition created'); navigate(`/purchase/requisitions/${res.data.id}`); }
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: string) {
    try {
      if (action === 'submit') { await purchaseRequisitionsApi.submit(id!); toast.success('Requisition submitted'); }
      else if (action === 'approve') { await purchaseRequisitionsApi.approve(id!); toast.success('Requisition approved'); }
      else if (action === 'convert') { await purchaseRequisitionsApi.convertToPO(id!); toast.success('Converted to PO'); }
      loadPR();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { toast.error('Please enter a rejection reason'); return; }
    try {
      await purchaseRequisitionsApi.reject(id!, rejectReason);
      toast.success('Requisition rejected');
      setRejectPrompt(false); setRejectReason('');
      loadPR();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete() {
    try { await purchaseRequisitionsApi.delete(id!); toast.success('Requisition deleted'); navigate('/purchase/requisitions'); }
    catch (err: any) { toast.error(err.message); }
  }

  function getActions() {
    const a: any[] = [];
    if (isDraft) {
      a.push({ label: saving ? 'Saving...' : 'Save Draft', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving });
      if (isEdit) {
        a.push({ label: 'Submit', variant: 'default', onClick: () => handleAction('submit') });
        a.push({ label: 'Delete', variant: 'danger', onClick: () => setDeleteConfirm(true) });
      }
    }
    if (status === 'submitted') {
      a.push({ label: 'Approve', variant: 'primary', onClick: () => handleAction('approve') });
      a.push({ label: 'Reject', variant: 'danger', onClick: () => setRejectPrompt(true) });
    }
    if (status === 'approved')
      a.push({ label: 'Convert to PO', variant: 'primary', onClick: () => handleAction('convert') });
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
      <PageHeader title={isEdit ? 'Purchase Requisition' : 'New Purchase Requisition'}
        actions={getActions()} />

      {isEdit && (
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={status} statusMap={PR_STATUSES} />
          {form.source !== 'manual' && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">
              {SOURCE_LABELS[form.source]}
            </span>
          )}
        </div>
      )}

      {rejectionReason && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <span className="text-xs font-semibold text-red-700">Rejection Reason:</span>
          <span className="text-sm text-red-600 ml-2">{rejectionReason}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Requisition Date" required>
            <Input type="date" value={form.requisition_date} onChange={(e) => setForm((f) => ({ ...f, requisition_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Required By Date">
            <Input type="date" value={form.required_by_date} onChange={(e) => setForm((f) => ({ ...f, required_by_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Priority">
            <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as PurchaseRequisition['priority'] }))}
              options={Object.entries(PRIORITY_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))} disabled={readonly} />
          </FormField>
          <FormField label="Purpose" className="md:col-span-3">
            <Textarea value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              rows={2} disabled={readonly} placeholder="Reason for this requisition..." />
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
                <th className="text-left py-2 px-2 w-44 text-gray-500 font-medium">Preferred Vendor</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Est. Price</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Est. Total</th>
                {!readonly && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
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
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-40 overflow-y-auto min-w-[320px]">
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
                  <td className="py-2 px-2 relative">
                    {readonly ? (
                      <span className="text-xs">{line.preferred_vendor_name || '—'}</span>
                    ) : (
                      <>
                        <Input value={vendorSearchIdx === idx ? vendorSearch : line.preferred_vendor_name}
                          onChange={(e) => { setVendorSearchIdx(idx); setVendorSearch(e.target.value); }}
                          onFocus={() => setVendorSearchIdx(idx)} placeholder="Vendor (optional)" className="!py-1 !text-xs h-8" />
                        {vendorSearchIdx === idx && vendorResults.length > 0 && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-40 overflow-y-auto min-w-[320px]">
                            {vendorResults.map((v) => (
                              <button key={v.id} type="button" onClick={() => selectVendor(idx, v)}
                                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">
                                <span className="font-mono font-medium">{v.vendor_code}</span>
                                <span className="ml-2">{v.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.estimated_price} onChange={(e) => updateLine(idx, 'estimated_price', parseFloat(e.target.value) || 0)}
                      disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                  </td>
                  <td className="py-2 px-2 text-right text-xs text-gray-600">
                    <AmountDisplay value={line.quantity * line.estimated_price} />
                  </td>
                  {!readonly && (
                    <td className="py-2 px-2">
                      <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-30">×</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readonly && <button onClick={addLine} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">+ Add Line</button>}

        {/* Estimated Total */}
        <div className="flex justify-end mt-4">
          <div className="w-56 text-sm">
            <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
              <span>Estimated Total</span>
              <AmountDisplay value={estimatedTotal} />
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog open={deleteConfirm} title="Delete Requisition" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />

      {/* Reject Reason Dialog */}
      {rejectPrompt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Reject Requisition</h3>
            <FormField label="Reason" required>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                rows={3} placeholder="Please provide a reason for rejection..." />
            </FormField>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setRejectPrompt(false); setRejectReason(''); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={handleReject}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}