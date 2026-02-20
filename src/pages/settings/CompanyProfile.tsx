// src/pages/settings/CompanyProfile.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { settingsApi, CompanyProfile as CompanyData } from '@/api/modules/settings.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Textarea, toast } from '@/components/shared/FormElements';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ENTITY_STATUSES } from '@/lib/constants';
import { formatGSTIN, formatDate } from '@/lib/formatters';
import { useKeyboardShortcuts, useFormDirty } from '@/hooks';

export function CompanyProfile() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.roleName === 'Admin';
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [form, setForm] = useState<Partial<CompanyData>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useFormDirty(dirty);

  const loadCompany = useCallback(async () => {
    if (!user?.companyId) return;
    setLoading(true);
    try {
      const res = await settingsApi.getCompany(user.companyId);
      setCompany(res.data);
      setForm(res.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.companyId]);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  useKeyboardShortcuts({
    'ctrl+enter': () => {
      if (editing) handleSave();
    },
    'escape': () => {
      if (editing) handleCancel();
    },
  });

  function handleEdit() {
    setEditing(true);
    setForm({ ...company });
    setDirty(false);
  }

  function handleCancel() {
    setEditing(false);
    setForm({ ...company });
    setErrors({});
    setDirty(false);
  }

  function updateField(key: keyof CompanyData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name?.trim()) errs.name = 'Company name is required';
    if (!form.display_name?.trim()) errs.display_name = 'Display name is required';
    if (form.gstin && form.gstin.length !== 15) errs.gstin = 'GSTIN must be 15 characters';
    if (form.pan && form.pan.length !== 10) errs.pan = 'PAN must be 10 characters';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate() || !company) return;
    setSaving(true);
    try {
      await settingsApi.updateCompany(company.id, form);
      toast.success('Company profile updated');
      setEditing(false);
      setDirty(false);
      loadCompany();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Company Profile" />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-4 flex-1 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div>
        <PageHeader title="Company Profile" />
        <div className="text-center py-16 text-gray-500">Company data not found</div>
      </div>
    );
  }

  const actions = editing
    ? [
        { label: 'Cancel', variant: 'secondary' as const, onClick: handleCancel },
        { label: saving ? 'Saving...' : 'Save', variant: 'primary' as const, onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving },
      ]
    : isAdmin
    ? [{ label: 'Edit', variant: 'primary' as const, onClick: handleEdit }]
    : [];

  return (
    <div>
      <PageHeader title="Company Profile" subtitle="View and manage your company information" actions={actions} />

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {/* Basic Info */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Company Name" required error={errors.name}>
              {editing ? (
                <Input value={form.name || ''} onChange={(e) => updateField('name', e.target.value)} error={!!errors.name} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.name}</p>
              )}
            </FormField>
            <FormField label="Display Name" required error={errors.display_name}>
              {editing ? (
                <Input value={form.display_name || ''} onChange={(e) => updateField('display_name', e.target.value)} error={!!errors.display_name} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.display_name || '—'}</p>
              )}
            </FormField>
            <FormField label="Legal Name">
              {editing ? (
                <Input value={form.legal_name || ''} onChange={(e) => updateField('legal_name', e.target.value)} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.legal_name || '—'}</p>
              )}
            </FormField>
            <FormField label="Status">
              <div className="py-2">
                <StatusBadge status={company.status || 'active'} statusMap={ENTITY_STATUSES} />
              </div>
            </FormField>
          </div>
        </div>

        {/* Tax & Registration */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Tax & Registration</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="GSTIN" error={errors.gstin}>
              {editing ? (
                <Input value={form.gstin || ''} onChange={(e) => updateField('gstin', e.target.value.toUpperCase())} maxLength={15} error={!!errors.gstin} placeholder="22AAAAA0000A1Z5" />
              ) : (
                <p className="text-sm text-gray-900 py-2 font-mono">{formatGSTIN(company.gstin)}</p>
              )}
            </FormField>
            <FormField label="PAN" error={errors.pan}>
              {editing ? (
                <Input value={form.pan || ''} onChange={(e) => updateField('pan', e.target.value.toUpperCase())} maxLength={10} error={!!errors.pan} placeholder="AAAAA0000A" />
              ) : (
                <p className="text-sm text-gray-900 py-2 font-mono">{company.pan || '—'}</p>
              )}
            </FormField>
            <FormField label="TAN">
              {editing ? (
                <Input value={form.tan || ''} onChange={(e) => updateField('tan', e.target.value.toUpperCase())} maxLength={10} />
              ) : (
                <p className="text-sm text-gray-900 py-2 font-mono">{company.tan || '—'}</p>
              )}
            </FormField>
          </div>
        </div>

        {/* Address */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Address</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Address Line 1" className="md:col-span-2">
              {editing ? (
                <Input value={form.address_line1 || ''} onChange={(e) => updateField('address_line1', e.target.value)} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.address_line1 || '—'}</p>
              )}
            </FormField>
            <FormField label="Address Line 2" className="md:col-span-2">
              {editing ? (
                <Input value={form.address_line2 || ''} onChange={(e) => updateField('address_line2', e.target.value)} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.address_line2 || '—'}</p>
              )}
            </FormField>
            <FormField label="City">
              {editing ? (
                <Input value={form.city || ''} onChange={(e) => updateField('city', e.target.value)} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.city || '—'}</p>
              )}
            </FormField>
            <FormField label="State">
              {editing ? (
                <Input value={form.state || ''} onChange={(e) => updateField('state', e.target.value)} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.state || '—'}{company.state_code ? ` (${company.state_code})` : ''}</p>
              )}
            </FormField>
            <FormField label="PIN Code">
              {editing ? (
                <Input value={form.pin_code || ''} onChange={(e) => updateField('pin_code', e.target.value)} maxLength={6} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.pin_code || '—'}</p>
              )}
            </FormField>
          </div>
        </div>

        {/* Contact */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Phone">
              {editing ? (
                <Input value={form.phone || ''} onChange={(e) => updateField('phone', e.target.value)} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.phone || '—'}</p>
              )}
            </FormField>
            <FormField label="Email" error={errors.email}>
              {editing ? (
                <Input type="email" value={form.email || ''} onChange={(e) => updateField('email', e.target.value)} error={!!errors.email} />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.email || '—'}</p>
              )}
            </FormField>
            <FormField label="Website">
              {editing ? (
                <Input value={form.website || ''} onChange={(e) => updateField('website', e.target.value)} placeholder="https://..." />
              ) : (
                <p className="text-sm text-gray-900 py-2">{company.website || '—'}</p>
              )}
            </FormField>
          </div>
        </div>

        {/* Financial Year */}
        <div className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Financial Year & License</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Financial Year Start">
              <p className="text-sm text-gray-900 py-2">{formatDate(company.financial_year_start)}</p>
            </FormField>
            <FormField label="Financial Year End">
              <p className="text-sm text-gray-900 py-2">{formatDate(company.financial_year_end)}</p>
            </FormField>
            <FormField label="License Tier">
              <p className="text-sm text-gray-900 py-2 capitalize">{company.license_tier || '—'}</p>
            </FormField>
            <FormField label="Base Currency">
              <p className="text-sm text-gray-900 py-2">{company.base_currency || 'INR'}</p>
            </FormField>
            <FormField label="Created">
              <p className="text-sm text-gray-900 py-2">{formatDate(company.created_at)}</p>
            </FormField>
          </div>
        </div>
      </div>
    </div>
  );
}