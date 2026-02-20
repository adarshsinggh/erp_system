// src/pages/settings/BranchForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { settingsApi } from '@/api/modules/settings.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, toast } from '@/components/shared/FormElements';
import { INDIAN_STATES } from '@/lib/constants';
import { useKeyboardShortcuts, useFormDirty } from '@/hooks';

const stateOptions = Object.entries(INDIAN_STATES).map(([code, name]) => ({ value: code, label: `${code} - ${name}` }));

export function BranchForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '', code: '', address_line1: '', address_line2: '',
    city: '', state: '', state_code: '', pin_code: '',
    gstin: '', phone: '', email: '', is_main: false,
  });

  useFormDirty(dirty);

  useEffect(() => {
    if (isEdit && id) loadBranch(id);
  }, [id]);

  async function loadBranch(branchId: string) {
    setLoading(true);
    try {
      const res = await settingsApi.getBranch(branchId);
      const b = res.data;
      setForm({
        name: b.name, code: b.code, address_line1: b.address_line1,
        address_line2: b.address_line2, city: b.city, state: b.state,
        state_code: b.state_code, pin_code: b.pin_code, gstin: b.gstin,
        phone: b.phone, email: b.email, is_main: b.is_main,
      });
    } catch (err: any) {
      toast.error(err.message);
      navigate('/settings/branches');
    } finally {
      setLoading(false);
    }
  }

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/settings/branches'),
  });

  function updateField(key: string, value: string | boolean) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-set state name when state_code changes
      if (key === 'state_code' && typeof value === 'string') {
        next.state = INDIAN_STATES[value] || '';
      }
      return next;
    });
    setDirty(true);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Branch name is required';
    if (!form.code.trim()) errs.code = 'Branch code is required';
    if (form.code.length > 10) errs.code = 'Code must be 10 characters or fewer';
    if (!form.city.trim()) errs.city = 'City is required';
    if (!form.state_code) errs.state_code = 'State is required';
    if (form.gstin && form.gstin.length !== 15) errs.gstin = 'GSTIN must be 15 characters';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    if (form.pin_code && !/^\d{6}$/.test(form.pin_code)) errs.pin_code = 'PIN must be 6 digits';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await settingsApi.updateBranch(id!, form);
        toast.success('Branch updated');
      } else {
        await settingsApi.createBranch(form);
        toast.success('Branch created');
      }
      navigate('/settings/branches');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={isEdit ? 'Edit Branch' : 'New Branch'} onBack={() => navigate('/settings/branches')} />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-3xl">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Branch' : 'New Branch'}
        onBack={() => navigate('/settings/branches')}
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => navigate('/settings/branches') },
          { label: saving ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving },
        ]}
      />
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Branch Name" required error={errors.name}>
            <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} error={!!errors.name} placeholder="e.g. Head Office" />
          </FormField>
          <FormField label="Branch Code" required error={errors.code}>
            <Input value={form.code} onChange={(e) => updateField('code', e.target.value.toUpperCase())} error={!!errors.code} placeholder="e.g. HO" maxLength={10} />
          </FormField>
          <FormField label="Address Line 1" className="md:col-span-2">
            <Input value={form.address_line1} onChange={(e) => updateField('address_line1', e.target.value)} placeholder="Street address" />
          </FormField>
          <FormField label="Address Line 2" className="md:col-span-2">
            <Input value={form.address_line2} onChange={(e) => updateField('address_line2', e.target.value)} placeholder="Area, landmark" />
          </FormField>
          <FormField label="City" required error={errors.city}>
            <Input value={form.city} onChange={(e) => updateField('city', e.target.value)} error={!!errors.city} />
          </FormField>
          <FormField label="State" required error={errors.state_code}>
            <Select value={form.state_code} onChange={(e) => updateField('state_code', e.target.value)} options={stateOptions} placeholder="Select state" error={!!errors.state_code} />
          </FormField>
          <FormField label="PIN Code" error={errors.pin_code}>
            <Input value={form.pin_code} onChange={(e) => updateField('pin_code', e.target.value)} maxLength={6} error={!!errors.pin_code} placeholder="380015" />
          </FormField>
          <FormField label="GSTIN" error={errors.gstin}>
            <Input value={form.gstin} onChange={(e) => updateField('gstin', e.target.value.toUpperCase())} maxLength={15} error={!!errors.gstin} placeholder="22AAAAA0000A1Z5" className="font-mono" />
          </FormField>
          <FormField label="Phone">
            <Input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+91 79 2654 7890" />
          </FormField>
          <FormField label="Email" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} error={!!errors.email} placeholder="branch@company.com" />
          </FormField>
          <FormField label="Main Branch">
            <label className="flex items-center gap-2 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_main}
                onChange={(e) => updateField('is_main', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">This is the main/head office branch</span>
            </label>
          </FormField>
        </div>
      </div>
    </div>
  );
}