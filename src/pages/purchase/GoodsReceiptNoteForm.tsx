// src/pages/purchase/GoodsReceiptNoteForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { goodsReceiptNotesApi, GoodsReceiptNote, GRNDetail } from '@/api/modules/goods-receipt-notes.api';
import { purchaseOrdersApi, PurchaseOrder } from '@/api/modules/purchase-orders.api';
import { vendorsApi, Vendor } from '@/api/modules/vendors.api';
import { itemsApi, Item } from '@/api/modules/items.api';
import { settingsApi, Warehouse } from '@/api/modules/settings.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const GRN_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  confirmed: { label: 'Confirmed', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

const INSPECTION_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'partial', label: 'Partial' },
];

interface FormLine {
  id?: string;
  po_line_id?: string;
  item_id: string;
  item_code: string;
  item_name: string;
  ordered_quantity: number;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  uom_id: string;
  uom_code: string;
  batch_number: string;
  expiry_date: string;
  rejection_reason: string;
  remarks: string;
}

function emptyLine(): FormLine {
  return {
    item_id: '', item_code: '', item_name: '',
    ordered_quantity: 0, received_quantity: 0, accepted_quantity: 0, rejected_quantity: 0,
    uom_id: '', uom_code: '', batch_number: '', expiry_date: '',
    rejection_reason: '', remarks: '',
  };
}

export function GoodsReceiptNoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);

  const [form, setForm] = useState({
    vendor_id: '', grn_date: new Date().toISOString().slice(0, 10),
    purchase_order_id: '', warehouse_id: '', vendor_challan_no: '',
    vendor_challan_date: '', vehicle_number: '', inspection_status: 'pending' as GoodsReceiptNote['inspection_status'],
    remarks: '',
  });
  const [poNumber, setPoNumber] = useState('');
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

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [poList, setPoList] = useState<PurchaseOrder[]>([]);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;

  useEffect(() => {
    settingsApi.listWarehouses().then((r) => setWarehouses(r.data || [])).catch(() => {});
  }, []);

  // Load PO list when vendor is selected
  useEffect(() => {
    if (form.vendor_id) {
      purchaseOrdersApi.list({ vendor_id: form.vendor_id, status: 'sent', limit: 50 })
        .then((r) => setPoList(r.data || []))
        .catch(() => {});
    } else {
      setPoList([]);
    }
  }, [form.vendor_id]);

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/purchase/grn'),
  });

  useEffect(() => { if (isEdit) loadGRN(); }, [id]);

  async function loadGRN() {
    setLoading(true);
    try {
      const res = await goodsReceiptNotesApi.getById(id!);
      const grn = res.data;
      setStatus(grn.status);
      setForm({
        vendor_id: grn.vendor_id || '', grn_date: grn.grn_date || '',
        purchase_order_id: grn.purchase_order_id || '', warehouse_id: grn.warehouse_id || '',
        vendor_challan_no: grn.vendor_challan_no || '',
        vendor_challan_date: grn.vendor_challan_date || '',
        vehicle_number: grn.vehicle_number || '',
        inspection_status: (grn.inspection_status || 'pending') as GoodsReceiptNote['inspection_status'],
        remarks: grn.remarks || '',
      });
      if (grn.purchase_order) setPoNumber(grn.purchase_order.po_number);
      if (grn.vendor) { setSelectedVendor(grn.vendor as unknown as Vendor); setVendorSearch(grn.vendor.name); }
      if (grn.lines?.length) {
        setLines(grn.lines.map((l) => ({
          id: l.id, po_line_id: l.po_line_id, item_id: l.item_id || '',
          item_code: l.item_code || '', item_name: l.item_name || '',
          ordered_quantity: l.ordered_quantity || 0, received_quantity: l.received_quantity || 0,
          accepted_quantity: l.accepted_quantity || 0, rejected_quantity: l.rejected_quantity || 0,
          uom_id: l.uom_id || '', uom_code: l.uom_code || '',
          batch_number: l.batch_number || '', expiry_date: l.expiry_date || '',
          rejection_reason: l.rejection_reason || '', remarks: l.remarks || '',
        })));
      }
    } catch (err: any) { toast.error(err.message); navigate('/purchase/grn'); }
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
    } : line));
    setItemSearchIdx(null); setItemSearch('');
  }
  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(idx: number) { if (lines.length > 1) setLines((prev) => prev.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: keyof FormLine, value: any) {
    setLines((prev) => prev.map((line, i) => {
      if (i !== idx) return line;
      const updated = { ...line, [field]: value };
      // Auto-calculate: accepted = received - rejected
      if (field === 'received_quantity' || field === 'rejected_quantity') {
        const received = field === 'received_quantity' ? (value as number) : updated.received_quantity;
        const rejected = field === 'rejected_quantity' ? (value as number) : updated.rejected_quantity;
        updated.accepted_quantity = Math.max(0, received - rejected);
      }
      return updated;
    }));
  }

  async function handleSave() {
    if (!form.vendor_id) { toast.error('Please select a vendor'); return; }
    if (!form.grn_date) { toast.error('Please enter GRN date'); return; }
    const validLines = lines.filter((l) => l.item_id && l.received_quantity > 0);
    if (!validLines.length) { toast.error('Add at least one line with received quantity'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        lines: validLines.map((l) => ({
          id: l.id, po_line_id: l.po_line_id, item_id: l.item_id,
          ordered_quantity: l.ordered_quantity, received_quantity: l.received_quantity,
          accepted_quantity: l.accepted_quantity, rejected_quantity: l.rejected_quantity,
          uom_id: l.uom_id, batch_number: l.batch_number,
          expiry_date: l.expiry_date || null, rejection_reason: l.rejection_reason,
          remarks: l.remarks,
        })),
      };
      if (isEdit) { await goodsReceiptNotesApi.update(id!, payload); toast.success('GRN updated'); loadGRN(); }
      else { const res = await goodsReceiptNotesApi.create(payload); toast.success('GRN created'); navigate(`/purchase/grn/${res.data.id}`); }
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: string) {
    try {
      if (action === 'confirm') { await goodsReceiptNotesApi.confirm(id!); toast.success('GRN confirmed — stock updated'); }
      else if (action === 'cancel') { await goodsReceiptNotesApi.cancel(id!); toast.success('GRN cancelled'); }
      loadGRN();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete() {
    try { await goodsReceiptNotesApi.delete(id!); toast.success('GRN deleted'); navigate('/purchase/grn'); }
    catch (err: any) { toast.error(err.message); }
  }

  function getActions() {
    const a: any[] = [];
    if (isDraft) {
      a.push({ label: saving ? 'Saving...' : 'Save Draft', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving });
      if (isEdit) {
        a.push({ label: 'Confirm', variant: 'default', onClick: () => setConfirmDialog(true) });
        a.push({ label: 'Delete', variant: 'danger', onClick: () => setDeleteConfirm(true) });
      }
    }
    if (status !== 'confirmed' && status !== 'cancelled' && isEdit)
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
      <PageHeader title={isEdit ? 'Goods Receipt Note' : 'New GRN'}
        subtitle={selectedVendor?.name} actions={getActions()} />

      {isEdit && (
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={status} statusMap={GRN_STATUSES} />
          {poNumber && (
            <Link to={`/purchase/orders/${form.purchase_order_id}`} className="text-xs text-purple-600 hover:text-purple-800 font-medium">
              PO: {poNumber}
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
          <FormField label="GRN Date" required>
            <Input type="date" value={form.grn_date} onChange={(e) => setForm((f) => ({ ...f, grn_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Purchase Order">
            <Select value={form.purchase_order_id} onChange={(e) => setForm((f) => ({ ...f, purchase_order_id: e.target.value }))}
              options={[{ value: '', label: 'Select PO (optional)...' }, ...poList.map((po) => ({ value: po.id, label: `${po.po_number || po.id.slice(0, 8)}` }))]}
              disabled={readonly} />
          </FormField>
          <FormField label="Warehouse">
            <Select value={form.warehouse_id} onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
              options={[{ value: '', label: 'Select warehouse...' }, ...warehouses.map((w) => ({ value: w.id, label: `${w.code} - ${w.name}` }))]}
              disabled={readonly} />
          </FormField>
          <FormField label="Inspection Status">
            <Select value={form.inspection_status} onChange={(e) => setForm((f) => ({ ...f, inspection_status: e.target.value as GoodsReceiptNote['inspection_status'] }))}
              options={INSPECTION_OPTIONS} disabled={readonly} />
          </FormField>
        </div>

        {/* Transport Details */}
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-3">Vendor Challan & Transport</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Vendor Challan No.">
            <Input value={form.vendor_challan_no} onChange={(e) => setForm((f) => ({ ...f, vendor_challan_no: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Vendor Challan Date">
            <Input type="date" value={form.vendor_challan_date} onChange={(e) => setForm((f) => ({ ...f, vendor_challan_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Vehicle Number">
            <Input value={form.vehicle_number} onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value }))} disabled={readonly} placeholder="e.g. UP32XX1234" />
          </FormField>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Receipt Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 w-8 text-gray-500 font-medium">#</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Item</th>
                <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Ordered</th>
                <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Received</th>
                <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Accepted</th>
                <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Rejected</th>
                <th className="text-left py-2 px-2 w-16 text-gray-500 font-medium">UOM</th>
                <th className="text-left py-2 px-2 w-28 text-gray-500 font-medium">Batch</th>
                <th className="text-left py-2 px-2 w-28 text-gray-500 font-medium">Reject Reason</th>
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
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
                            {itemResults.map((it) => (
                              <button key={it.id} type="button" onClick={() => selectItem(idx, it)}
                                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">
                                <span className="font-mono font-medium">{it.item_code}</span>
                                <span className="ml-2">{it.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.ordered_quantity}
                      onChange={(e) => updateLine(idx, 'ordered_quantity', parseFloat(e.target.value) || 0)}
                      disabled={readonly || !!line.po_line_id} className="!py-1 !text-xs h-8 text-right bg-gray-50" min={0} />
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.received_quantity}
                      onChange={(e) => updateLine(idx, 'received_quantity', parseFloat(e.target.value) || 0)}
                      disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                  </td>
                  <td className="py-2 px-2">
                    <div className="px-2 py-1 text-xs text-right bg-green-50 border border-green-200 rounded h-8 flex items-center justify-end font-medium text-green-700">
                      {line.accepted_quantity}
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.rejected_quantity}
                      onChange={(e) => updateLine(idx, 'rejected_quantity', parseFloat(e.target.value) || 0)}
                      disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-500">{line.uom_code || '—'}</td>
                  <td className="py-2 px-2">
                    <Input value={line.batch_number} onChange={(e) => updateLine(idx, 'batch_number', e.target.value)}
                      disabled={readonly} className="!py-1 !text-xs h-8" placeholder="Batch #" />
                  </td>
                  <td className="py-2 px-2">
                    {line.rejected_quantity > 0 ? (
                      <Input value={line.rejection_reason} onChange={(e) => updateLine(idx, 'rejection_reason', e.target.value)}
                        disabled={readonly} className="!py-1 !text-xs h-8" placeholder="Reason..." />
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
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

        {/* Summary */}
        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Total Received</span><span className="font-medium">{lines.reduce((s, l) => s + l.received_quantity, 0)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total Accepted</span><span className="font-medium text-green-600">{lines.reduce((s, l) => s + l.accepted_quantity, 0)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total Rejected</span><span className="font-medium text-red-600">{lines.reduce((s, l) => s + l.rejected_quantity, 0)}</span></div>
          </div>
        </div>
      </div>

      {/* Remarks */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <FormField label="Remarks">
          <Textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} rows={3} disabled={readonly} />
        </FormField>
      </div>

      <ConfirmDialog open={deleteConfirm} title="Delete GRN" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
      <ConfirmDialog open={confirmDialog} title="Confirm GRN"
        message="This will add accepted quantities to warehouse stock and update PO received quantities. This action cannot be undone."
        confirmLabel="Confirm GRN" onConfirm={() => { setConfirmDialog(false); handleAction('confirm'); }} onCancel={() => setConfirmDialog(false)} />
    </div>
  );
}