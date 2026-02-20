// src/pages/purchase/DebitNoteForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { debitNotesApi, DebitNote, DebitNoteDetail } from '@/api/modules/debit-notes.api';
import { vendorsApi, Vendor } from '@/api/modules/vendors.api';
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
    subtotal: '0', cgst_amount: '0', sgst_amount: '0', igst_amount: '0',
    internal_notes: '',
  });
  const [billNumber, setBillNumber] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);

  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorResults, setVendorResults] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const debouncedVendorSearch = useDebounce(vendorSearch, 300);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/purchase/debit-notes'),
  });

  // Auto-calculate total
  useEffect(() => {
    const sub = parseFloat(form.subtotal) || 0;
    const cgst = parseFloat(form.cgst_amount) || 0;
    const sgst = parseFloat(form.sgst_amount) || 0;
    const igst = parseFloat(form.igst_amount) || 0;
    setTotalAmount(sub + cgst + sgst + igst);
  }, [form.subtotal, form.cgst_amount, form.sgst_amount, form.igst_amount]);

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
        subtotal: dn.subtotal ? String(dn.subtotal) : '0',
        cgst_amount: dn.cgst_amount ? String(dn.cgst_amount) : '0',
        sgst_amount: dn.sgst_amount ? String(dn.sgst_amount) : '0',
        igst_amount: dn.igst_amount ? String(dn.igst_amount) : '0',
        internal_notes: '',
      });
      if (dn.vendor_bill) setBillNumber(dn.vendor_bill.bill_number);
      if (dn.vendor) { setSelectedVendor(dn.vendor as unknown as Vendor); setVendorSearch(dn.vendor.name); }
    } catch (err: any) { toast.error(err.message); navigate('/purchase/debit-notes'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (debouncedVendorSearch?.length >= 2)
      vendorsApi.list({ search: debouncedVendorSearch, limit: 10, status: 'active' }).then((r) => setVendorResults(r.data || [])).catch(() => {});
    else setVendorResults([]);
  }, [debouncedVendorSearch]);

  function selectVendor(v: Vendor) {
    setSelectedVendor(v); setVendorSearch(v.name);
    setForm((f) => ({ ...f, vendor_id: v.id })); setShowVendorDropdown(false);
  }

  async function handleSave() {
    if (!form.vendor_id) { toast.error('Please select a vendor'); return; }
    if (!form.debit_note_date) { toast.error('Please enter date'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        subtotal: parseFloat(form.subtotal) || 0,
        cgst_amount: parseFloat(form.cgst_amount) || 0,
        sgst_amount: parseFloat(form.sgst_amount) || 0,
        igst_amount: parseFloat(form.igst_amount) || 0,
        vendor_bill_id: form.vendor_bill_id || null,
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
          <FormField label="Date" required>
            <Input type="date" value={form.debit_note_date} onChange={(e) => setForm((f) => ({ ...f, debit_note_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Linked Vendor Bill">
            <Input value={form.vendor_bill_id} onChange={(e) => setForm((f) => ({ ...f, vendor_bill_id: e.target.value }))}
              placeholder="Bill UUID (optional)" disabled={readonly} />
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