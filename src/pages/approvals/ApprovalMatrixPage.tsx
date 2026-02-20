// src/pages/approvals/ApprovalMatrixPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  approvalsApi,
  ApprovalMatrixRule,
  ApprovalDocumentType,
} from '@/api/modules/approvals.api';
import { settingsApi, Role } from '@/api/modules/settings.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, toast, ConfirmDialog } from '@/components/shared/FormElements';
import { APPROVAL_DOC_TYPES, ENTITY_STATUSES } from '@/lib/constants';
import { formatCurrency } from '@/lib/formatters';
import { useDebounce, useKeyboardShortcuts } from '@/hooks';

const DOC_TYPE_OPTIONS = Object.entries(APPROVAL_DOC_TYPES).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));

const EMPTY_FORM = {
  document_type: '' as string,
  min_amount: '',
  max_amount: '',
  approver_role_id: '',
  approval_level: '1',
  is_mandatory: false,
  is_active: true,
};

export function ApprovalMatrixPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ApprovalMatrixRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Roles for dropdown
  const [roles, setRoles] = useState<Role[]>([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useKeyboardShortcuts({
    'ctrl+n': () => openCreateModal(),
  });

  useEffect(() => {
    settingsApi.listRoles().then((r) => setRoles(r.data || [])).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await approvalsApi.matrix.list({
        page,
        limit,
        document_type: docTypeFilter || undefined,
        sort_by: 'document_type',
        sort_order: 'asc',
      });
      let items = res.data || [];
      if (activeOnly) {
        items = items.filter((r) => r.is_active);
      }
      // Sort by document_type then by approval_level
      items.sort((a, b) => {
        if (a.document_type !== b.document_type) return a.document_type.localeCompare(b.document_type);
        return a.approval_level - b.approval_level;
      });
      setData(items);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, docTypeFilter, activeOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [docTypeFilter, activeOnly]);

  // Modal helpers
  function openCreateModal() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setShowModal(true);
  }

  function openEditModal(rule: ApprovalMatrixRule) {
    setEditingId(rule.id);
    setForm({
      document_type: rule.document_type,
      min_amount: String(rule.min_amount),
      max_amount: rule.max_amount != null ? String(rule.max_amount) : '',
      approver_role_id: rule.approver_role_id,
      approval_level: String(rule.approval_level),
      is_mandatory: rule.is_mandatory,
      is_active: rule.is_active,
    });
    setErrors({});
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
  }

  function updateField(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.document_type) errs.document_type = 'Document type is required';
    if (!form.min_amount && form.min_amount !== '0') errs.min_amount = 'Minimum amount is required';
    if (Number(form.min_amount) < 0) errs.min_amount = 'Must be ≥ 0';
    if (form.max_amount && Number(form.max_amount) <= Number(form.min_amount)) {
      errs.max_amount = 'Must be greater than minimum amount';
    }
    if (!form.approver_role_id) errs.approver_role_id = 'Approver role is required';
    if (!form.approval_level || Number(form.approval_level) < 1 || Number(form.approval_level) > 10) {
      errs.approval_level = 'Level must be 1-10';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        document_type: form.document_type as ApprovalDocumentType,
        min_amount: Number(form.min_amount),
        max_amount: form.max_amount ? Number(form.max_amount) : null,
        approver_role_id: form.approver_role_id,
        approval_level: Number(form.approval_level),
        is_mandatory: form.is_mandatory,
        is_active: form.is_active,
      };

      if (editingId) {
        const { document_type, ...updateData } = payload;
        await approvalsApi.matrix.update(editingId, updateData);
        toast.success('Rule updated successfully');
      } else {
        await approvalsApi.matrix.create(payload);
        toast.success('Rule created successfully');
      }
      closeModal();
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await approvalsApi.matrix.delete(id);
      toast.success('Rule deleted');
      setDeleteConfirm(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const roleOptions = roles.map((r) => ({ value: r.id, label: r.name }));

  const columns: ColumnDef<ApprovalMatrixRule>[] = [
    {
      key: 'document_type',
      header: 'Document Type',
      width: '170px',
      sortable: true,
      render: (row) => <StatusBadge status={row.document_type} statusMap={APPROVAL_DOC_TYPES} />,
    },
    {
      key: 'amount_range',
      header: 'Amount Range',
      width: '180px',
      render: (row) => (
        <span className="text-sm text-gray-700">
          {formatCurrency(row.min_amount)}
          {row.max_amount != null ? ` — ${formatCurrency(row.max_amount)}` : '+'}
        </span>
      ),
    },
    {
      key: 'approver_role_name',
      header: 'Approver Role',
      width: '160px',
      render: (row) => {
        const roleName = row.approver_role_name || roles.find((r) => r.id === row.approver_role_id)?.name || row.approver_role_id;
        return <span className="text-sm font-medium text-gray-900">{roleName}</span>;
      },
    },
    {
      key: 'approval_level',
      header: 'Level',
      width: '90px',
      align: 'center' as const,
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
          Level {row.approval_level}
        </span>
      ),
    },
    {
      key: 'is_mandatory',
      header: 'Mandatory',
      width: '90px',
      align: 'center' as const,
      render: (row) =>
        row.is_mandatory ? (
          <svg className="w-4 h-4 text-emerald-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: 'is_active',
      header: 'Status',
      width: '100px',
      render: (row) => (
        <StatusBadge
          status={row.is_active ? 'active' : 'inactive'}
          statusMap={ENTITY_STATUSES}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      align: 'right' as const,
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEditModal(row);
            }}
            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirm(row.id);
            }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  // Loading skeleton
  if (loading && !data.length) {
    return (
      <div>
        <PageHeader title="Approval Matrix" />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-4 w-28 rounded" />
              <div className="skeleton h-4 w-32 rounded" />
              <div className="skeleton h-4 flex-1 rounded" />
              <div className="skeleton h-4 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Approval Matrix"
        subtitle="Configure approval rules by document type, amount, and role"
        onBack={() => navigate('/approvals')}
        actions={[
          {
            label: '+ New Rule',
            variant: 'primary',
            onClick: openCreateModal,
            shortcut: 'Ctrl+N',
          },
        ]}
      />

      {/* Hint */}
      <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
        <p className="text-xs text-blue-700">
          💡 Level 1 is evaluated first, then Level 2, etc. Each level must be approved before the next.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select
          value={docTypeFilter}
          onChange={(e) => setDocTypeFilter(e.target.value)}
          options={DOC_TYPE_OPTIONS}
          placeholder="All Document Types"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Active Only
        </label>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onRowClick={(row) => openEditModal(row)}
        emptyMessage="No approval rules configured yet"
      />

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Edit Approval Rule' : 'New Approval Rule'}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Document Type" required error={errors.document_type} className="col-span-2">
                <Select
                  value={form.document_type}
                  onChange={(e) => updateField('document_type', e.target.value)}
                  options={DOC_TYPE_OPTIONS}
                  placeholder="Select document type"
                  error={!!errors.document_type}
                  disabled={!!editingId}
                />
              </FormField>

              <FormField label="Min Amount (₹)" required error={errors.min_amount}>
                <Input
                  type="number"
                  value={form.min_amount}
                  onChange={(e) => updateField('min_amount', e.target.value)}
                  error={!!errors.min_amount}
                  placeholder="0"
                  min="0"
                />
              </FormField>

              <FormField label="Max Amount (₹)" error={errors.max_amount} hint="Leave empty for unlimited">
                <Input
                  type="number"
                  value={form.max_amount}
                  onChange={(e) => updateField('max_amount', e.target.value)}
                  error={!!errors.max_amount}
                  placeholder="Unlimited"
                  min="0"
                />
              </FormField>

              <FormField label="Approver Role" required error={errors.approver_role_id}>
                <Select
                  value={form.approver_role_id}
                  onChange={(e) => updateField('approver_role_id', e.target.value)}
                  options={roleOptions}
                  placeholder="Select role"
                  error={!!errors.approver_role_id}
                />
              </FormField>

              <FormField label="Approval Level" required error={errors.approval_level}>
                <Input
                  type="number"
                  value={form.approval_level}
                  onChange={(e) => updateField('approval_level', e.target.value)}
                  error={!!errors.approval_level}
                  min="1"
                  max="10"
                />
              </FormField>

              <div className="col-span-2 flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_mandatory}
                    onChange={(e) => updateField('is_mandatory', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-gray-700">Mandatory approval</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => updateField('is_active', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-gray-700">Active</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Approval Rule"
        message="Are you sure you want to delete this approval rule? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}