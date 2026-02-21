// src/pages/masters/CustomerForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { customersApi, CustomerDetail, ContactPerson, Address } from '@/api/modules/customers.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { INDIAN_STATES, ENTITY_STATUSES } from '@/lib/constants';
import { useKeyboardShortcuts } from '@/hooks';

const CUSTOMER_TYPES = [
  { value: 'company', label: 'Company' },
  { value: 'individual', label: 'Individual' },
];

const TDS_SECTIONS = [
  { value: '194C', label: '194C - Contractors' },
  { value: '194H', label: '194H - Commission' },
  { value: '194I', label: '194I - Rent' },
  { value: '194J', label: '194J - Professional Fees' },
  { value: '194Q', label: '194Q - Purchase of Goods' },
];

export function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  // ─── Form state ─────────────────────────────────────────
  const [form, setForm] = useState({
    customer_code: '', customer_type: 'company' as 'company' | 'individual',
    name: '', display_name: '', gstin: '', pan: '', tan: '',
    credit_limit: '', payment_terms_days: '30', currency_code: 'INR',
    tds_applicable: false, tds_section: '', tds_rate: '',
    opening_balance: '', opening_balance_type: 'debit' as 'debit' | 'credit',
    status: 'active', tags: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ─── Contacts state ─────────────────────────────────────
  const [contacts, setContacts] = useState<ContactPerson[]>([]);
  const [editingContact, setEditingContact] = useState<Partial<ContactPerson> | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);

  // ─── Addresses state ────────────────────────────────────
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editingAddress, setEditingAddress] = useState<Partial<Address> | null>(null);
  const [addressSaving, setAddressSaving] = useState(false);
  const [deleteAddressId, setDeleteAddressId] = useState<string | null>(null);

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/masters/customers'),
  });

  useEffect(() => {
    if (isEdit) loadCustomer();
    else loadNextCode();
  }, [id]);

  async function loadNextCode() {
    try {
      const res = await customersApi.nextCode();
      setForm((p) => ({ ...p, customer_code: res.data.code }));
    } catch {}
  }

  async function loadCustomer() {
    setLoading(true);
    
    try {
      const res = await customersApi.getById(id!);
      const c = res.data;
      setForm({
        customer_code: c.customer_code || '',
        customer_type: c.customer_type || 'company',
        name: c.name || '', display_name: c.display_name || '',
        gstin: c.gstin || '', pan: c.pan || '', tan: c.tan || '',
        credit_limit: c.credit_limit ? String(c.credit_limit) : '',
        payment_terms_days: c.payment_terms_days ? String(c.payment_terms_days) : '30',
        currency_code: c.currency_code || 'INR',
        tds_applicable: !!c.tds_applicable, tds_section: c.tds_section || '',
        tds_rate: c.tds_rate ? String(c.tds_rate) : '',
        opening_balance: c.opening_balance ? String(c.opening_balance) : '',
        opening_balance_type: c.opening_balance_type || 'debit',
        status: c.status || 'active',
        tags: (c.tags || []).join(', '),
      });
      setContacts(c.contact_persons || []);
      setAddresses(c.addresses || []);
    } catch (err: any) {
      toast.error(err.message);
      navigate('/masters/customers');
    } finally {
      setLoading(false);
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.customer_code.trim()) errs.customer_code = 'Code is required';
    if (!form.name.trim()) errs.name = 'Name is required';
    if (form.gstin && form.gstin.length !== 15) errs.gstin = 'GSTIN must be 15 characters';
    if (form.pan && form.pan.length !== 10) errs.pan = 'PAN must be 10 characters';
    if (form.credit_limit && isNaN(Number(form.credit_limit))) errs.credit_limit = 'Invalid amount';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : 0,
        payment_terms_days: form.payment_terms_days ? parseInt(form.payment_terms_days) : 30,
        tds_rate: form.tds_rate ? parseFloat(form.tds_rate) : 0,
        opening_balance: form.opening_balance ? parseFloat(form.opening_balance) : 0,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        gstin: form.gstin.toUpperCase() || null,
        pan: form.pan.toUpperCase() || null,
        tan: form.tan.toUpperCase() || null,
      };
      if (isEdit) {
        await customersApi.update(id!, payload);
        toast.success('Customer updated');
        navigate('/masters/customers');
      } else {
        const res = await customersApi.create(payload);
        toast.success('Customer created');
        navigate(`/masters/customers/${res.data.id}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Contact handlers ───────────────────────────────────
  async function saveContact() {
    if (!editingContact?.name?.trim()) { toast.error('Contact name is required'); return; }
    setContactSaving(true);
    try {
      if (editingContact.id) {
        const res = await customersApi.updateContact(id!, editingContact.id, editingContact);
        setContacts((prev) => prev.map((c) => c.id === editingContact.id ? { ...c, ...res.data } : c));
        toast.success('Contact updated');
      } else {
        const res = await customersApi.addContact(id!, editingContact);
        setContacts((prev) => [...prev, res.data]);
        toast.success('Contact added');
      }
      setEditingContact(null);
    } catch (err: any) { toast.error(err.message); }
    finally { setContactSaving(false); }
  }

  async function deleteContact() {
    if (!deleteContactId) return;
    try {
      await customersApi.deleteContact(id!, deleteContactId);
      setContacts((prev) => prev.filter((c) => c.id !== deleteContactId));
      toast.success('Contact deleted');
    } catch (err: any) { toast.error(err.message); }
    finally { setDeleteContactId(null); }
  }

  // ─── Address handlers ──────────────────────────────────
  async function saveAddress() {
    if (!editingAddress?.address_line1?.trim()) { toast.error('Address line 1 is required'); return; }
    if (!editingAddress?.city?.trim()) { toast.error('City is required'); return; }
    if (!editingAddress?.state?.trim()) { toast.error('State is required'); return; }
    setAddressSaving(true);
    try {
      if (editingAddress.id) {
        const res = await customersApi.updateAddress(id!, editingAddress.id, editingAddress);
        setAddresses((prev) => prev.map((a) => a.id === editingAddress.id ? { ...a, ...res.data } : a));
        toast.success('Address updated');
      } else {
        const res = await customersApi.addAddress(id!, editingAddress);
        setAddresses((prev) => [...prev, res.data]);
        toast.success('Address added');
      }
      setEditingAddress(null);
    } catch (err: any) { toast.error(err.message); }
    finally { setAddressSaving(false); }
  }

  async function deleteAddress() {
    if (!deleteAddressId) return;
    try {
      await customersApi.deleteAddress(id!, deleteAddressId);
      setAddresses((prev) => prev.filter((a) => a.id !== deleteAddressId));
      toast.success('Address deleted');
    } catch (err: any) { toast.error(err.message); }
    finally { setDeleteAddressId(null); }
  }

  const set = (field: string, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const tabs = [
    { key: 'details', label: 'Details' },
    ...(isEdit ? [
      { key: 'contacts', label: `Contacts (${contacts.length})` },
      { key: 'addresses', label: `Addresses (${addresses.length})` },
      { key: 'ledger', label: 'Ledger' },
    ] : []),
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Loading..." />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? `Edit Customer — ${form.name}` : 'New Customer'}
        subtitle={isEdit ? form.customer_code : undefined}
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => navigate('/masters/customers') },
          { label: saving ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, disabled: saving },
        ]}
      />

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >{tab.label}</button>
          ))}
        </div>
      </div>

      {/* ─── Details Tab ─── */}
      {activeTab === 'details' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Customer Code" required error={errors.customer_code}>
              <Input value={form.customer_code} onChange={(e) => set('customer_code', e.target.value.toUpperCase())} error={!!errors.customer_code} placeholder="Auto-generated" readOnly={!isEdit && !!form.customer_code} className={!isEdit && form.customer_code ? 'bg-gray-50' : ''} />
            </FormField>
            <FormField label="Type">
              <Select value={form.customer_type} onChange={(e) => set('customer_type', e.target.value)} options={CUSTOMER_TYPES} />
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={(e) => set('status', e.target.value)} options={[
                { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'blocked', label: 'Blocked' },
              ]} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Name" required error={errors.name}>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} error={!!errors.name} placeholder="Legal name" />
            </FormField>
            <FormField label="Display Name">
              <Input value={form.display_name} onChange={(e) => set('display_name', e.target.value)} placeholder="Short / trade name" />
            </FormField>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">Tax & Registration</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="GSTIN" error={errors.gstin}>
              <Input value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} error={!!errors.gstin} placeholder="22AAAAA0000A1Z5" maxLength={15} />
            </FormField>
            <FormField label="PAN" error={errors.pan}>
              <Input value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} error={!!errors.pan} placeholder="AAAAA0000A" maxLength={10} />
            </FormField>
            <FormField label="TAN">
              <Input value={form.tan} onChange={(e) => set('tan', e.target.value.toUpperCase())} placeholder="AAAA00000A" maxLength={10} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="TDS Applicable">
              <label className="flex items-center gap-2 py-2">
                <input type="checkbox" checked={form.tds_applicable} onChange={(e) => set('tds_applicable', e.target.checked)} className="rounded border-gray-300" />
                <span className="text-sm text-gray-700">Yes, TDS is applicable</span>
              </label>
            </FormField>
            {form.tds_applicable && (
              <>
                <FormField label="TDS Section">
                  <Select value={form.tds_section} onChange={(e) => set('tds_section', e.target.value)} options={TDS_SECTIONS} placeholder="Select section" />
                </FormField>
                <FormField label="TDS Rate (%)">
                  <Input type="number" value={form.tds_rate} onChange={(e) => set('tds_rate', e.target.value)} min={0} max={100} step={0.1} />
                </FormField>
              </>
            )}
          </div>

          <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">Commercial</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField label="Credit Limit (₹)" error={errors.credit_limit}>
              <Input type="number" value={form.credit_limit} onChange={(e) => set('credit_limit', e.target.value)} error={!!errors.credit_limit} min={0} step={1000} />
            </FormField>
            <FormField label="Payment Terms (days)">
              <Input type="number" value={form.payment_terms_days} onChange={(e) => set('payment_terms_days', e.target.value)} min={0} />
            </FormField>
            <FormField label="Currency">
              <Select value={form.currency_code} onChange={(e) => set('currency_code', e.target.value)} options={[
                { value: 'INR', label: 'INR - Indian Rupee' }, { value: 'USD', label: 'USD - US Dollar' },
              ]} />
            </FormField>
            <FormField label="Opening Balance">
              <div className="flex gap-2">
                <Input type="number" value={form.opening_balance} onChange={(e) => set('opening_balance', e.target.value)} min={0} className="flex-1" />
                <Select value={form.opening_balance_type} onChange={(e) => set('opening_balance_type', e.target.value)} options={[
                  { value: 'debit', label: 'Dr' }, { value: 'credit', label: 'Cr' },
                ]} className="w-20" />
              </div>
            </FormField>
          </div>

          <FormField label="Tags">
            <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="Comma-separated, e.g. hydraulics, premium" />
          </FormField>
        </div>
      )}

      {/* ─── Contacts Tab ─── */}
      {activeTab === 'contacts' && isEdit && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Contact Persons</h3>
            <button onClick={() => setEditingContact({ name: '', designation: '', phone: '', mobile: '', email: '', is_primary: false })}
              className="px-3 py-1.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700">
              Add Contact
            </button>
          </div>

          {contacts.length === 0 && !editingContact ? (
            <div className="py-12 text-center text-sm text-gray-500">
              No contact persons added yet.
              <button onClick={() => setEditingContact({ name: '', designation: '', phone: '', mobile: '', email: '', is_primary: false })}
                className="block mx-auto mt-2 text-brand-600 hover:text-brand-700 font-medium">Add first contact →</button>
            </div>
          ) : (
            <div className="space-y-3">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 group">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{c.name}</span>
                      {c.is_primary && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded">Primary</span>}
                      {c.designation && <span className="text-xs text-gray-500">— {c.designation}</span>}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      {c.phone && <span>☎ {c.phone}</span>}
                      {c.mobile && <span>📱 {c.mobile}</span>}
                      {c.email && <span>✉ {c.email}</span>}
                    </div>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={() => setEditingContact(c)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setDeleteContactId(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Contact Edit Modal */}
          {editingContact && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingContact(null)}>
              <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-4">{editingContact.id ? 'Edit Contact' : 'Add Contact'}</h3>
                <div className="space-y-3">
                  <FormField label="Name" required>
                    <Input value={editingContact.name || ''} onChange={(e) => setEditingContact((p) => ({ ...p!, name: e.target.value }))} autoFocus />
                  </FormField>
                  <FormField label="Designation">
                    <Input value={editingContact.designation || ''} onChange={(e) => setEditingContact((p) => ({ ...p!, designation: e.target.value }))} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Phone">
                      <Input value={editingContact.phone || ''} onChange={(e) => setEditingContact((p) => ({ ...p!, phone: e.target.value }))} />
                    </FormField>
                    <FormField label="Mobile">
                      <Input value={editingContact.mobile || ''} onChange={(e) => setEditingContact((p) => ({ ...p!, mobile: e.target.value }))} />
                    </FormField>
                  </div>
                  <FormField label="Email">
                    <Input type="email" value={editingContact.email || ''} onChange={(e) => setEditingContact((p) => ({ ...p!, email: e.target.value }))} />
                  </FormField>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={editingContact.is_primary || false} onChange={(e) => setEditingContact((p) => ({ ...p!, is_primary: e.target.checked }))} className="rounded border-gray-300" />
                    <span className="text-sm text-gray-700">Primary contact</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button onClick={() => setEditingContact(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                  <button onClick={saveContact} disabled={contactSaving} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    {contactSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <ConfirmDialog open={!!deleteContactId} title="Delete Contact" message="Are you sure?" variant="danger" confirmLabel="Delete"
            onConfirm={deleteContact} onCancel={() => setDeleteContactId(null)} />
        </div>
      )}

      {/* ─── Addresses Tab ─── */}
      {activeTab === 'addresses' && isEdit && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Addresses</h3>
            <button onClick={() => setEditingAddress({ address_type: 'billing', label: '', address_line1: '', address_line2: '', city: '', state: '', pincode: '', phone: '', is_default: false })}
              className="px-3 py-1.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700">
              Add Address
            </button>
          </div>

          {addresses.length === 0 && !editingAddress ? (
            <div className="py-12 text-center text-sm text-gray-500">
              No addresses added yet.
              <button onClick={() => setEditingAddress({ address_type: 'billing', label: '', address_line1: '', city: '', state: '', pincode: '' })}
                className="block mx-auto mt-2 text-brand-600 hover:text-brand-700 font-medium">Add first address →</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {addresses.map((a) => (
                <div key={a.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 group relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      a.address_type === 'billing' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>{a.address_type}</span>
                    {a.label && <span className="text-xs font-medium text-gray-600">{a.label}</span>}
                    {a.is_default && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Default</span>}
                  </div>
                  <p className="text-sm text-gray-900">{a.address_line1}</p>
                  {a.address_line2 && <p className="text-sm text-gray-600">{a.address_line2}</p>}
                  <p className="text-sm text-gray-600">{a.city}, {a.state} — {a.pincode}</p>
                  {a.phone && <p className="text-xs text-gray-500 mt-1">☎ {a.phone}</p>}
                  <div className="absolute top-3 right-3 hidden group-hover:flex items-center gap-1">
                    <button onClick={() => setEditingAddress(a)} className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setDeleteAddressId(a.id)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Address Edit Modal */}
          {editingAddress && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEditingAddress(null)}>
              <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold mb-4">{editingAddress.id ? 'Edit Address' : 'Add Address'}</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Type">
                      <Select value={editingAddress.address_type || 'billing'} onChange={(e) => setEditingAddress((p) => ({ ...p!, address_type: e.target.value as any }))}
                        options={[{ value: 'billing', label: 'Billing' }, { value: 'shipping', label: 'Shipping' }]} />
                    </FormField>
                    <FormField label="Label">
                      <Input value={editingAddress.label || ''} onChange={(e) => setEditingAddress((p) => ({ ...p!, label: e.target.value }))} placeholder="e.g. Head Office" />
                    </FormField>
                  </div>
                  <FormField label="Address Line 1" required>
                    <Input value={editingAddress.address_line1 || ''} onChange={(e) => setEditingAddress((p) => ({ ...p!, address_line1: e.target.value }))} autoFocus />
                  </FormField>
                  <FormField label="Address Line 2">
                    <Input value={editingAddress.address_line2 || ''} onChange={(e) => setEditingAddress((p) => ({ ...p!, address_line2: e.target.value }))} />
                  </FormField>
                  <div className="grid grid-cols-3 gap-3">
                    <FormField label="City" required>
                      <Input value={editingAddress.city || ''} onChange={(e) => setEditingAddress((p) => ({ ...p!, city: e.target.value }))} />
                    </FormField>
                    <FormField label="State" required>
                      <Select value={editingAddress.state || ''} onChange={(e) => setEditingAddress((p) => ({ ...p!, state: e.target.value }))}
                        options={Object.entries(INDIAN_STATES).map(([code, name]) => ({ value: name, label: name }))} placeholder="Select state" />
                    </FormField>
                    <FormField label="Pincode">
                      <Input value={editingAddress.pincode || ''} onChange={(e) => setEditingAddress((p) => ({ ...p!, pincode: e.target.value }))} maxLength={6} />
                    </FormField>
                  </div>
                  <FormField label="Phone">
                    <Input value={editingAddress.phone || ''} onChange={(e) => setEditingAddress((p) => ({ ...p!, phone: e.target.value }))} />
                  </FormField>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={editingAddress.is_default || false} onChange={(e) => setEditingAddress((p) => ({ ...p!, is_default: e.target.checked }))} className="rounded border-gray-300" />
                    <span className="text-sm text-gray-700">Default address</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button onClick={() => setEditingAddress(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                  <button onClick={saveAddress} disabled={addressSaving} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
                    {addressSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <ConfirmDialog open={!!deleteAddressId} title="Delete Address" message="Are you sure?" variant="danger" confirmLabel="Delete"
            onConfirm={deleteAddress} onCancel={() => setDeleteAddressId(null)} />
        </div>
      )}

      {/* ─── Ledger Tab (Placeholder) ─── */}
      {activeTab === 'ledger' && (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <p className="text-sm text-gray-400">Customer ledger will be available once transactions are recorded.</p>
        </div>
      )}
    </div>
  );
}