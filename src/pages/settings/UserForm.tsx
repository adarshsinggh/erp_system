// src/pages/settings/UserForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { settingsApi, Branch, Role } from '@/api/modules/settings.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useFormDirty } from '@/hooks';

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export function UserForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState({
    username: '', full_name: '', email: '', phone: '',
    role_id: '', branch_id: '', status: 'active', password: '',
  });

  useFormDirty(dirty);

  useEffect(() => {
    Promise.all([
      settingsApi.listBranches(),
      settingsApi.listRoles(),
    ]).then(([brRes, roleRes]) => {
      setBranches(brRes.data || []);
      setRoles(roleRes.data || []);
    });
    if (isEdit && id) loadUser(id);
  }, [id]);

  async function loadUser(userId: string) {
    setLoading(true);
    try {
      const res = await settingsApi.getUser(userId);
      const u = res.data;
      setForm({
        username: u.username, full_name: u.full_name, email: u.email,
        phone: u.phone, role_id: u.role_id, branch_id: u.branch_id,
        status: u.status, password: '',
      });
    } catch (err: any) {
      toast.error(err.message);
      navigate('/settings/users');
    } finally {
      setLoading(false);
    }
  }

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/settings/users'),
  });

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.username.trim()) errs.username = 'Username is required';
    if (form.username.includes(' ')) errs.username = 'Username cannot have spaces';
    if (!form.full_name.trim()) errs.full_name = 'Full name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    if (!form.role_id) errs.role_id = 'Role is required';
    if (!form.branch_id) errs.branch_id = 'Branch is required';
    if (!isEdit && !form.password) errs.password = 'Password is required for new users';
    if (!isEdit && form.password && form.password.length < 6) errs.password = 'Password must be at least 6 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isEdit) {
        const { password, ...updateData } = form;
        await settingsApi.updateUser(id!, updateData);
        toast.success('User updated');
      } else {
        await settingsApi.createUser(form);
        toast.success('User created');
      }
      navigate('/settings/users');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={isEdit ? 'Edit User' : 'New User'} onBack={() => navigate('/settings/users')} />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-2xl">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));
  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Edit User' : 'New User'}
        onBack={() => navigate('/settings/users')}
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => navigate('/settings/users') },
          { label: saving ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving },
        ]}
      />
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Username" required error={errors.username}>
            <Input value={form.username} onChange={(e) => updateField('username', e.target.value.toLowerCase())} error={!!errors.username} placeholder="e.g. john_doe" disabled={isEdit} />
          </FormField>
          <FormField label="Full Name" required error={errors.full_name}>
            <Input value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} error={!!errors.full_name} placeholder="e.g. John Doe" />
          </FormField>
          <FormField label="Email" required error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} error={!!errors.email} placeholder="user@company.com" />
          </FormField>
          <FormField label="Phone">
            <Input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="+91 98765 43210" />
          </FormField>
          <FormField label="Role" required error={errors.role_id}>
            <Select value={form.role_id} onChange={(e) => updateField('role_id', e.target.value)} options={roleOptions} placeholder="Select role" error={!!errors.role_id} />
          </FormField>
          <FormField label="Branch" required error={errors.branch_id}>
            <Select value={form.branch_id} onChange={(e) => updateField('branch_id', e.target.value)} options={branchOptions} placeholder="Select branch" error={!!errors.branch_id} />
          </FormField>
          {!isEdit && (
            <FormField label="Password" required error={errors.password}>
              <Input type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} error={!!errors.password} placeholder="Min. 6 characters" />
            </FormField>
          )}
          <FormField label="Status">
            <Select value={form.status} onChange={(e) => updateField('status', e.target.value)} options={statusOptions} />
          </FormField>
        </div>
      </div>
    </div>
  );
}