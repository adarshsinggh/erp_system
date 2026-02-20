// src/pages/settings/RolesPermissions.tsx
import React, { useState, useEffect } from 'react';
import { settingsApi, Role, RolePermission } from '@/api/modules/settings.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Textarea, toast } from '@/components/shared/FormElements';

export function RolesPermissions() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRole, setNewRole] = useState({ name: '', description: '' });
  const [newRoleErrors, setNewRoleErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadRoles();
  }, []);

  async function loadRoles() {
    setLoading(true);
    try {
      const res = await settingsApi.listRoles();
      setRoles(res.data || []);
      if (!selectedRoleId && res.data.length > 0) {
        setSelectedRoleId(res.data[0].id);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  // Group permissions by module
  const permissionsByModule: Record<string, RolePermission[]> = {};
  if (selectedRole) {
    selectedRole.permissions.forEach((p) => {
      if (!permissionsByModule[p.module]) permissionsByModule[p.module] = [];
      permissionsByModule[p.module].push(p);
    });
  }

  async function handleTogglePermission(permissionId: string, granted: boolean) {
    if (!selectedRole || selectedRole.is_system_role) return;
    setSaving(true);
    try {
      await settingsApi.updateRolePermissions(selectedRole.id, [{ permission_id: permissionId, granted }]);
      // Update local state
      setRoles((prev) =>
        prev.map((r) =>
          r.id === selectedRole.id
            ? {
                ...r,
                permissions: r.permissions.map((p) =>
                  p.id === permissionId ? { ...p, granted } : p
                ),
              }
            : r
        )
      );
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRole() {
    const errs: Record<string, string> = {};
    if (!newRole.name.trim()) errs.name = 'Role name is required';
    setNewRoleErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      await settingsApi.createRole(newRole);
      toast.success('Role created');
      setShowCreateForm(false);
      setNewRole({ name: '', description: '' });
      loadRoles();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Roles & Permissions" />
        <div className="grid grid-cols-4 gap-6">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
          <div className="col-span-3 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-10 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Manage user roles and access controls"
        actions={[
          { label: 'New Role', variant: 'primary', onClick: () => setShowCreateForm(true) },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Role List Sidebar */}
        <div className="space-y-2">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                selectedRoleId === role.id
                  ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-900">{role.name}</span>
                {role.is_system_role && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500 rounded">SYSTEM</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{role.description}</p>
              <p className="text-xs text-gray-400 mt-1">{role.user_count} user{role.user_count !== 1 ? 's' : ''}</p>
            </button>
          ))}
        </div>

        {/* Permissions Grid */}
        <div className="lg:col-span-3">
          {selectedRole ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{selectedRole.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{selectedRole.description}</p>
                  </div>
                  {selectedRole.is_system_role && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">Read-only (system role)</span>
                  )}
                </div>
              </div>

              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase w-36">Module</th>
                        {['view', 'create', 'edit', 'delete', 'approve', 'manage', 'export'].map((action) => {
                          // Only show actions that exist in the current permissions
                          const hasAction = selectedRole.permissions.some((p) => p.action === action);
                          if (!hasAction) return null;
                          return (
                            <th key={action} className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase">
                              {action}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(permissionsByModule).map(([module, perms]) => (
                        <tr key={module} className="border-b border-gray-100">
                          <td className="py-3 pr-4">
                            <span className="font-medium text-gray-900 capitalize">{module}</span>
                          </td>
                          {['view', 'create', 'edit', 'delete', 'approve', 'manage', 'export'].map((action) => {
                            const hasAction = selectedRole.permissions.some((p) => p.action === action);
                            if (!hasAction) return null;
                            const perm = perms.find((p) => p.action === action);
                            if (!perm) return <td key={action} className="text-center py-3 px-3"><span className="text-gray-300">—</span></td>;
                            return (
                              <td key={action} className="text-center py-3 px-3">
                                <input
                                  type="checkbox"
                                  checked={perm.granted}
                                  onChange={(e) => handleTogglePermission(perm.id, e.target.checked)}
                                  disabled={selectedRole.is_system_role || saving}
                                  className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
              <p className="text-sm text-gray-500">Select a role to view permissions</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateForm(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Role</h3>
            <div className="space-y-4">
              <FormField label="Role Name" required error={newRoleErrors.name}>
                <Input
                  value={newRole.name}
                  onChange={(e) => setNewRole((prev) => ({ ...prev, name: e.target.value }))}
                  error={!!newRoleErrors.name}
                  placeholder="e.g. Sales Manager"
                  autoFocus
                />
              </FormField>
              <FormField label="Description">
                <Textarea
                  value={newRole.description}
                  onChange={(e) => setNewRole((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Brief description of this role"
                />
              </FormField>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}