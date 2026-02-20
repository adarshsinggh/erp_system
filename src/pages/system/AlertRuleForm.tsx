// src/pages/system/AlertRuleForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { systemApi, AlertType } from '@/api/modules/system.api';
import { settingsApi, Role, User } from '@/api/modules/settings.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useFormDirty } from '@/hooks';

const alertTypeOptions: { value: AlertType; label: string }[] = [
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'overstock', label: 'Overstock' },
  { value: 'payment_due', label: 'Payment Due' },
  { value: 'approval_pending', label: 'Approval Pending' },
  { value: 'consumption_anomaly', label: 'Consumption Anomaly' },
];

const entityTypeOptions = [
  { value: 'items', label: 'Items' },
  { value: 'products', label: 'Products' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'vendor_bills', label: 'Vendor Bills' },
];

// Alert types that support entity scoping
const ENTITY_SCOPABLE: AlertType[] = ['low_stock', 'overstock', 'consumption_anomaly'];

interface FormState {
  name: string;
  alert_type: AlertType | '';
  is_active: boolean;
  entity_type: string;
  entity_id: string;
  // Condition fields (one per alert type)
  threshold_percentage: string;
  days_overdue: string;
  max_pending_hours: string;
  variance_threshold: string;
  // Recipients
  notify_role_ids: string[];
  notify_user_ids: string[];
}

const INITIAL_FORM: FormState = {
  name: '',
  alert_type: '',
  is_active: true,
  entity_type: '',
  entity_id: '',
  threshold_percentage: '100',
  days_overdue: '7',
  max_pending_hours: '24',
  variance_threshold: '1.5',
  notify_role_ids: [],
  notify_user_ids: [],
};

export function AlertRuleForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM });
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useFormDirty(dirty);

  useEffect(() => {
    settingsApi.listRoles().then((res) => setRoles(res.data || []));
    settingsApi.listUsers().then((res) => setUsers((res.data || []).filter((u) => u.status === 'active')));
    if (isEdit && id) loadRule(id);
  }, [id]);

  async function loadRule(ruleId: string) {
    setLoading(true);
    try {
      const res = await systemApi.alertRules.getById(ruleId);
      const r = res.data;
      const cond = r.condition_json || {};
      setForm({
        name: r.name,
        alert_type: r.alert_type,
        is_active: r.is_active,
        entity_type: r.entity_type || '',
        entity_id: r.entity_id || '',
        threshold_percentage: String(cond.threshold_percentage ?? '100'),
        days_overdue: String(cond.days_overdue ?? '7'),
        max_pending_hours: String(cond.max_pending_hours ?? '24'),
        variance_threshold: String(cond.variance_threshold ?? '1.5'),
        notify_role_ids: r.notify_role_ids || [],
        notify_user_ids: r.notify_user_ids || [],
      });
    } catch (err: any) {
      toast.error(err.message);
      navigate('/system/alert-rules');
    } finally {
      setLoading(false);
    }
  }

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/system/alert-rules'),
  });

  function updateField(key: keyof FormState, value: any) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function toggleArrayItem(key: 'notify_role_ids' | 'notify_user_ids', itemId: string) {
    setForm((prev) => {
      const arr = prev[key];
      const next = arr.includes(itemId) ? arr.filter((x) => x !== itemId) : [...arr, itemId];
      return { ...prev, [key]: next };
    });
    setDirty(true);
  }

  function buildConditionJson(): Record<string, any> {
    const t = form.alert_type;
    if (t === 'low_stock' || t === 'overstock') return { threshold_percentage: parseFloat(form.threshold_percentage) || 100 };
    if (t === 'payment_due') return { days_overdue: parseInt(form.days_overdue) || 7 };
    if (t === 'approval_pending') return { max_pending_hours: parseInt(form.max_pending_hours) || 24 };
    if (t === 'consumption_anomaly') return { variance_threshold: parseFloat(form.variance_threshold) || 1.5 };
    return {};
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.alert_type) errs.alert_type = 'Alert type is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        alert_type: form.alert_type as AlertType,
        entity_type: ENTITY_SCOPABLE.includes(form.alert_type as AlertType) && form.entity_type ? form.entity_type : null,
        entity_id: ENTITY_SCOPABLE.includes(form.alert_type as AlertType) && form.entity_type && form.entity_id ? form.entity_id : null,
        condition_json: buildConditionJson(),
        notify_role_ids: form.notify_role_ids,
        notify_user_ids: form.notify_user_ids,
        is_active: form.is_active,
      };
      if (isEdit) {
        await systemApi.alertRules.update(id!, payload);
        toast.success('Alert rule updated');
      } else {
        await systemApi.alertRules.create(payload);
        toast.success('Alert rule created');
      }
      navigate('/system/alert-rules');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={isEdit ? 'Edit Alert Rule' : 'New Alert Rule'} onBack={() => navigate('/system/alert-rules')} />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-2xl">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const showEntityScope = ENTITY_SCOPABLE.includes(form.alert_type as AlertType);

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit Alert Rule' : 'New Alert Rule'}
        onBack={() => navigate('/system/alert-rules')}
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => navigate('/system/alert-rules') },
          { label: saving ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving },
        ]}
      />

      <div className="space-y-6 max-w-2xl">
        {/* Section 1: Basic Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Rule Name" required error={errors.name} className="md:col-span-2">
              <Input
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                error={!!errors.name}
                placeholder="e.g. Low Stock Alert - All Items"
              />
            </FormField>
            <FormField label="Alert Type" required error={errors.alert_type}>
              <Select
                value={form.alert_type}
                onChange={(e) => {
                  updateField('alert_type', e.target.value);
                  // Reset entity scope when switching types
                  if (!ENTITY_SCOPABLE.includes(e.target.value as AlertType)) {
                    updateField('entity_type', '');
                    updateField('entity_id', '');
                  }
                }}
                options={alertTypeOptions}
                placeholder="Select alert type"
                error={!!errors.alert_type}
              />
            </FormField>
            <FormField label="Active">
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('is_active', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">Enable this alert rule</span>
                </label>
              </div>
            </FormField>
          </div>
        </div>

        {/* Section 2: Entity Scope (conditional) */}
        {showEntityScope && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Scope</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Entity Type" hint="Leave empty to apply to all">
                <Select
                  value={form.entity_type}
                  onChange={(e) => { updateField('entity_type', e.target.value); updateField('entity_id', ''); }}
                  options={entityTypeOptions}
                  placeholder="All (no filter)"
                />
              </FormField>
              {form.entity_type && (
                <FormField label="Entity ID" hint="Leave empty to apply to all of this type">
                  <Input
                    value={form.entity_id}
                    onChange={(e) => updateField('entity_id', e.target.value)}
                    placeholder="Specific entity ID (optional)"
                  />
                </FormField>
              )}
            </div>
          </div>
        )}

        {/* Section 3: Condition (dynamic) */}
        {form.alert_type && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Condition</h3>
            {(form.alert_type === 'low_stock' || form.alert_type === 'overstock') && (
              <FormField
                label="Threshold Percentage"
                hint={form.alert_type === 'low_stock'
                  ? 'Alert when stock falls below this % of minimum threshold'
                  : 'Alert when stock exceeds this % above maximum level'
                }
              >
                <Input
                  type="number"
                  value={form.threshold_percentage}
                  onChange={(e) => updateField('threshold_percentage', e.target.value)}
                  min="0"
                  step="10"
                />
              </FormField>
            )}
            {form.alert_type === 'payment_due' && (
              <FormField label="Days Overdue" hint="Alert when invoices/bills are overdue by this many days">
                <Input
                  type="number"
                  value={form.days_overdue}
                  onChange={(e) => updateField('days_overdue', e.target.value)}
                  min="1"
                  step="1"
                />
              </FormField>
            )}
            {form.alert_type === 'approval_pending' && (
              <FormField label="Max Pending Hours" hint="Alert when approvals are pending for more than this many hours">
                <Input
                  type="number"
                  value={form.max_pending_hours}
                  onChange={(e) => updateField('max_pending_hours', e.target.value)}
                  min="1"
                  step="1"
                />
              </FormField>
            )}
            {form.alert_type === 'consumption_anomaly' && (
              <FormField label="Variance Threshold" hint="Alert when 7-day avg consumption deviates by this factor from 30-day avg">
                <Input
                  type="number"
                  value={form.variance_threshold}
                  onChange={(e) => updateField('variance_threshold', e.target.value)}
                  min="0.1"
                  step="0.1"
                />
              </FormField>
            )}
          </div>
        )}

        {/* Section 4: Notification Recipients */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Notification Recipients</h3>
          <p className="text-xs text-gray-400 mb-4">If no recipients selected, notifications go to Admin users by default</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-2 block">Notify Roles</label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {roles.length === 0 && <span className="text-xs text-gray-400">No roles available</span>}
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={form.notify_role_ids.includes(role.id)}
                      onChange={() => toggleArrayItem('notify_role_ids', role.id)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-gray-700">{role.name}</span>
                    {role.is_system_role && <span className="text-2xs text-gray-400">(system)</span>}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-2 block">Notify Users</label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {users.length === 0 && <span className="text-xs text-gray-400">No active users available</span>}
                {users.map((user) => (
                  <label key={user.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={form.notify_user_ids.includes(user.id)}
                      onChange={() => toggleArrayItem('notify_user_ids', user.id)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-gray-700">{user.full_name}</span>
                    {user.role_name && <span className="text-2xs text-gray-400">({user.role_name})</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}