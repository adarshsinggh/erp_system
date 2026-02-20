// src/pages/settings/TaxMasterForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mastersApi, TaxMaster } from '@/api/modules/masters.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, Textarea, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useFormDirty } from '@/hooks';

const taxTypeOptions = [
  { value: 'GST', label: 'GST - Goods & Services Tax' },
  { value: 'TDS', label: 'TDS - Tax Deducted at Source' },
  { value: 'TCS', label: 'TCS - Tax Collected at Source' },
];

export function TaxMasterForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '', tax_type: 'GST' as 'GST' | 'TDS' | 'TCS',
    rate: '', description: '', is_compound: false,
  });

  useFormDirty(dirty);

  useEffect(() => {
    if (isEdit && id) loadTax(id);
  }, [id]);

  async function loadTax(taxId: string) {
    setLoading(true);
    try {
      const res = await mastersApi.listTaxes();
      const tax = (res.data || []).find((t) => t.id === taxId);
      if (!tax) throw new Error('Tax not found');
      setForm({
        name: tax.name, tax_type: tax.tax_type, rate: String(tax.rate),
        description: tax.description || '', is_compound: tax.is_compound,
      });
    } catch (err: any) {
      toast.error(err.message);
      navigate('/settings/taxes');
    } finally {
      setLoading(false);
    }
  }

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/settings/taxes'),
  });

  function updateField(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Tax name is required';
    if (!form.tax_type) errs.tax_type = 'Tax type is required';
    const rate = parseFloat(form.rate);
    if (isNaN(rate) || rate < 0 || rate > 100) errs.rate = 'Rate must be between 0 and 100';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    const payload = {
      name: form.name,
      tax_type: form.tax_type,
      rate: parseFloat(form.rate),
      description: form.description,
      is_compound: form.is_compound,
    };
    try {
      if (isEdit) {
        await mastersApi.updateTax(id!, payload);
        toast.success('Tax updated');
      } else {
        await mastersApi.createTax(payload);
        toast.success('Tax created');
      }
      navigate('/settings/taxes');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={isEdit ? 'Edit Tax' : 'New Tax'} onBack={() => navigate('/settings/taxes')} />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-2xl">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Tax' : 'New Tax'}
        onBack={() => navigate('/settings/taxes')}
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => navigate('/settings/taxes') },
          { label: saving ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving },
        ]}
      />
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Tax Name" required error={errors.name}>
            <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} error={!!errors.name} placeholder="e.g. GST 18%" />
          </FormField>
          <FormField label="Tax Type" required error={errors.tax_type}>
            <Select value={form.tax_type} onChange={(e) => updateField('tax_type', e.target.value)} options={taxTypeOptions} error={!!errors.tax_type} />
          </FormField>
          <FormField label="Rate (%)" required error={errors.rate}>
            <Input type="number" value={form.rate} onChange={(e) => updateField('rate', e.target.value)} error={!!errors.rate} placeholder="e.g. 18" min={0} max={100} step={0.01} />
          </FormField>
          <FormField label="Compound Tax">
            <label className="flex items-center gap-2 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_compound}
                onChange={(e) => updateField('is_compound', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700">Tax is calculated on top of other taxes</span>
            </label>
          </FormField>
          <FormField label="Description" className="md:col-span-2">
            <Textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} placeholder="Brief description of this tax" />
          </FormField>
        </div>
      </div>
    </div>
  );
}