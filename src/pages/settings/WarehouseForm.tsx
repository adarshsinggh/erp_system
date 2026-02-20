// src/pages/settings/WarehouseForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { settingsApi, Branch } from '@/api/modules/settings.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, Textarea, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useFormDirty } from '@/hooks';

const warehouseTypeOptions = [
  { value: 'main', label: 'Main Warehouse' },
  { value: 'raw_material', label: 'Raw Material Store' },
  { value: 'finished_goods', label: 'Finished Goods Store' },
  { value: 'scrap', label: 'Scrap / Rejection Store' },
];

export function WarehouseForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState<{
    name: string; code: string; branch_id: string;
    warehouse_type: 'main' | 'raw_material' | 'finished_goods' | 'scrap';
    address: string;
  }>({
    name: '', code: '', branch_id: '', warehouse_type: 'main', address: '',
  });

  useFormDirty(dirty);

  useEffect(() => {
    settingsApi.listBranches().then((res) => setBranches(res.data || []));
    if (isEdit && id) loadWarehouse(id);
  }, [id]);

  async function loadWarehouse(whId: string) {
    setLoading(true);
    try {
      const res = await settingsApi.getWarehouse(whId);
      const w = res.data;
      setForm({ name: w.name, code: w.code, branch_id: w.branch_id, warehouse_type: w.warehouse_type, address: w.address });
    } catch (err: any) {
      toast.error(err.message);
      navigate('/settings/warehouses');
    } finally {
      setLoading(false);
    }
  }

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/settings/warehouses'),
  });

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Warehouse name is required';
    if (!form.code.trim()) errs.code = 'Code is required';
    if (!form.branch_id) errs.branch_id = 'Branch is required';
    if (!form.warehouse_type) errs.warehouse_type = 'Type is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await settingsApi.updateWarehouse(id!, form);
        toast.success('Warehouse updated');
      } else {
        await settingsApi.createWarehouse(form);
        toast.success('Warehouse created');
      }
      navigate('/settings/warehouses');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={isEdit ? 'Edit Warehouse' : 'New Warehouse'} onBack={() => navigate('/settings/warehouses')} />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-2xl">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Warehouse' : 'New Warehouse'}
        onBack={() => navigate('/settings/warehouses')}
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => navigate('/settings/warehouses') },
          { label: saving ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving },
        ]}
      />
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Warehouse Name" required error={errors.name}>
            <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} error={!!errors.name} placeholder="e.g. Main Store" />
          </FormField>
          <FormField label="Code" required error={errors.code}>
            <Input value={form.code} onChange={(e) => updateField('code', e.target.value.toUpperCase())} error={!!errors.code} placeholder="e.g. WH-MAIN" />
          </FormField>
          <FormField label="Branch" required error={errors.branch_id}>
            <Select value={form.branch_id} onChange={(e) => updateField('branch_id', e.target.value)} options={branchOptions} placeholder="Select branch" error={!!errors.branch_id} />
          </FormField>
          <FormField label="Warehouse Type" required error={errors.warehouse_type}>
            <Select value={form.warehouse_type} onChange={(e) => updateField('warehouse_type', e.target.value)} options={warehouseTypeOptions} error={!!errors.warehouse_type} />
          </FormField>
          <FormField label="Address" className="md:col-span-2">
            <Textarea value={form.address} onChange={(e) => updateField('address', e.target.value)} rows={3} placeholder="Warehouse address" />
          </FormField>
        </div>
      </div>
    </div>
  );
}