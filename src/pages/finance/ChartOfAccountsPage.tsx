// src/pages/finance/ChartOfAccountsPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { financeApi, ChartAccount, AccountType } from '@/api/modules/finance.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { SearchInput } from '@/components/shared/SearchInput';
import { FormField, Input, Select, toast, ConfirmDialog } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import { ACCOUNT_TYPES } from '@/lib/constants';

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];

const ACCOUNT_GROUP_OPTIONS: Record<string, { value: string; label: string }[]> = {
  asset: [
    { value: 'current_asset', label: 'Current Asset' },
    { value: 'fixed_asset', label: 'Fixed Asset' },
    { value: 'bank', label: 'Bank' },
    { value: 'cash', label: 'Cash' },
    { value: 'receivable', label: 'Receivable' },
    { value: 'inventory', label: 'Inventory' },
    { value: 'duty_tax', label: 'Duty & Tax' },
    { value: 'other', label: 'Other' },
  ],
  liability: [
    { value: 'payable', label: 'Payable' },
    { value: 'loan', label: 'Loan' },
    { value: 'duty_tax', label: 'Duty & Tax' },
    { value: 'other', label: 'Other' },
  ],
  equity: [
    { value: 'capital', label: 'Capital' },
    { value: 'reserve', label: 'Reserve' },
    { value: 'other', label: 'Other' },
  ],
  revenue: [
    { value: 'income', label: 'Income' },
    { value: 'other', label: 'Other' },
  ],
  expense: [
    { value: 'cogs', label: 'Cost of Goods Sold' },
    { value: 'direct_expense', label: 'Direct Expense' },
    { value: 'indirect_expense', label: 'Indirect Expense' },
    { value: 'other', label: 'Other' },
  ],
};

interface TreeNode extends ChartAccount {
  children: TreeNode[];
}

const EMPTY_FORM = {
  account_code: '',
  account_name: '',
  account_type: '' as string,
  account_group: '',
  parent_id: '',
  is_group: false,
  opening_balance: '',
  opening_balance_type: 'debit' as 'debit' | 'credit',
};

export function ChartOfAccountsPage() {
  const navigate = useNavigate();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [flatAccounts, setFlatAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const debouncedSearch = useDebounce(search, 300);

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

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.accounts.tree();
      const nodes = res.data || [];
      // The tree endpoint may return pre-built hierarchy
      // If it's flat, build tree; if it's already hierarchical, use directly
      if (nodes.length > 0 && nodes[0].children !== undefined) {
        setTree(nodes as TreeNode[]);
        setFlatAccounts(flattenTree(nodes as TreeNode[]));
      } else {
        // Flat list - build tree
        const built = buildTree(nodes);
        setTree(built);
        setFlatAccounts(nodes);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  function flattenTree(nodes: TreeNode[]): ChartAccount[] {
    const result: ChartAccount[] = [];
    function walk(list: TreeNode[]) {
      for (const n of list) {
        result.push(n);
        if (n.children?.length) walk(n.children);
      }
    }
    walk(nodes);
    return result;
  }

  function buildTree(flat: ChartAccount[]): TreeNode[] {
    const map = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];
    flat.forEach((a) => map.set(a.id, { ...a, children: [] }));
    flat.forEach((a) => {
      const node = map.get(a.id)!;
      if (a.parent_id && map.has(a.parent_id)) {
        map.get(a.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  // Filter tree client-side
  const filteredTree = useMemo(() => {
    if (!debouncedSearch && !typeFilter) return tree;

    const searchLower = debouncedSearch.toLowerCase();

    function matchesFilter(node: TreeNode): boolean {
      const matchesSearch = !searchLower ||
        node.account_code.toLowerCase().includes(searchLower) ||
        node.account_name.toLowerCase().includes(searchLower);
      const matchesType = !typeFilter || node.account_type === typeFilter;
      return matchesSearch && matchesType;
    }

    function filterTree(nodes: TreeNode[]): TreeNode[] {
      return nodes.reduce<TreeNode[]>((acc, node) => {
        const filteredChildren = filterTree(node.children || []);
        if (matchesFilter(node) || filteredChildren.length > 0) {
          acc.push({ ...node, children: filteredChildren });
        }
        return acc;
      }, []);
    }

    return filterTree(tree);
  }, [tree, debouncedSearch, typeFilter]);

  // Expand all when filtering
  useEffect(() => {
    if (debouncedSearch || typeFilter) {
      const allIds = new Set<string>();
      function collectIds(nodes: TreeNode[]) {
        for (const n of nodes) {
          allIds.add(n.id);
          if (n.children?.length) collectIds(n.children);
        }
      }
      collectIds(filteredTree);
      setExpandedIds(allIds);
    }
  }, [filteredTree, debouncedSearch, typeFilter]);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    const allIds = new Set<string>();
    function collect(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.children?.length) {
          allIds.add(n.id);
          collect(n.children);
        }
      }
    }
    collect(tree);
    setExpandedIds(allIds);
  }

  function collapseAll() {
    setExpandedIds(new Set());
  }

  // Modal helpers
  function openCreateModal(parentId?: string, parentType?: string) {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      parent_id: parentId || '',
      account_type: parentType || '',
    });
    setErrors({});
    setShowModal(true);
  }

  function openEditModal(account: ChartAccount) {
    setEditingId(account.id);
    setForm({
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type,
      account_group: account.account_group,
      parent_id: account.parent_id || '',
      is_group: account.is_group,
      opening_balance: account.opening_balance ? String(account.opening_balance) : '',
      opening_balance_type: account.opening_balance_type || 'debit',
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
    if (!form.account_code.trim()) errs.account_code = 'Account code is required';
    if (!form.account_name.trim()) errs.account_name = 'Account name is required';
    if (!form.account_type) errs.account_type = 'Account type is required';
    if (!form.account_group.trim()) errs.account_group = 'Account group is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setErrors((prev) => ({ ...prev, _form: '' }));
    try {
      const payload = {
        account_code: form.account_code.trim(),
        account_name: form.account_name.trim(),
        account_type: form.account_type as AccountType,
        account_group: form.account_group.trim(),
        parent_id: form.parent_id || undefined,
        is_group: form.is_group,
        opening_balance: form.opening_balance ? parseFloat(form.opening_balance) : undefined,
        opening_balance_type: form.opening_balance_type,
      };

      if (editingId) {
        await financeApi.accounts.update(editingId, payload);
        toast.success('Account updated');
      } else {
        await financeApi.accounts.create(payload);
        toast.success('Account created');
      }
      closeModal();
      loadTree();
    } catch (err: any) {
      const msg = err.message || 'Failed to save account';
      setErrors((prev) => ({ ...prev, _form: msg }));
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      await financeApi.accounts.delete(id);
      toast.success('Account deleted');
      setDeleteConfirm(null);
      loadTree();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSeed() {
    setSaving(true);
    try {
      await financeApi.accounts.seed();
      toast.success('System accounts created successfully');
      loadTree();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Group accounts for parent dropdown
  const groupAccounts = flatAccounts.filter((a) => a.is_group);
  const parentOptions = groupAccounts
    .filter((a) => !form.account_type || a.account_type === form.account_type)
    .map((a) => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` }));

  // Render tree node
  function renderNode(node: TreeNode, depth: number = 0): React.ReactNode {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 group transition-colors"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          {/* Expand/Collapse */}
          <button
            onClick={() => toggleExpanded(node.id)}
            className={`w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 ${
              !hasChildren ? 'invisible' : ''
            }`}
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 5l5 5-5 5V5z" />
            </svg>
          </button>

          {/* Icon */}
          {node.is_group ? (
            <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
          )}

          {/* Account Code */}
          <span className="font-mono text-xs text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded flex-shrink-0">
            {node.account_code}
          </span>

          {/* Account Name */}
          <span className={`text-sm flex-1 truncate ${node.is_group ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
            {node.account_name}
          </span>

          {/* Account Type Badge */}
          <StatusBadge status={node.account_type} statusMap={ACCOUNT_TYPES} />

          {/* System lock icon */}
          {node.is_system && (
            <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          )}

          {/* Opening Balance (leaf only) */}
          {!node.is_group && node.opening_balance !== undefined && node.opening_balance !== 0 && (
            <span className="text-xs text-gray-500 flex-shrink-0">
              <AmountDisplay value={node.opening_balance} className="text-xs" />
              <span className="ml-1 text-gray-400">{node.opening_balance_type === 'debit' ? 'Dr' : 'Cr'}</span>
            </span>
          )}

          {/* Hover Actions */}
          <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
            {node.is_group && (
              <button
                onClick={(e) => { e.stopPropagation(); openCreateModal(node.id, node.account_type); }}
                className="p-1 text-gray-400 hover:text-brand-600 rounded"
                title="Add child account"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); openEditModal(node); }}
              className="p-1 text-gray-400 hover:text-blue-600 rounded"
              title="Edit account"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {!node.is_group && (
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/finance/ledger?account=${node.id}`); }}
                className="p-1 text-gray-400 hover:text-green-600 rounded"
                title="View ledger"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </button>
            )}
            {!node.is_system && !hasChildren && (
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(node.id); }}
                className="p-1 text-gray-400 hover:text-red-600 rounded"
                title="Delete account"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div>
        <PageHeader title="Chart of Accounts" />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3" style={{ paddingLeft: `${(i % 3) * 24}px` }}>
              <div className="skeleton h-5 w-5 rounded" />
              <div className="skeleton h-5 w-16 rounded" />
              <div className="skeleton h-5 flex-1 rounded" />
              <div className="skeleton h-5 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isEmpty = tree.length === 0;

  const actions: { label: string; variant: 'primary' | 'secondary'; onClick: () => void; shortcut?: string; disabled?: boolean }[] = [];
  if (isEmpty) {
    actions.push({ label: 'Seed System Accounts', variant: 'primary', onClick: handleSeed, disabled: saving });
  }
  actions.push({ label: '+ New Account', variant: isEmpty ? 'secondary' : 'primary', onClick: () => openCreateModal(), shortcut: 'Ctrl+N' });

  return (
    <div>
      <PageHeader
        title="Chart of Accounts"
        subtitle="Manage your hierarchical account structure"
        actions={actions}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by code or name..." className="w-72" />
        <div className="flex gap-1">
          <button
            onClick={() => setTypeFilter('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              !typeFilter ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {ACCOUNT_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(typeFilter === opt.value ? '' : opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                typeFilter === opt.value ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button onClick={expandAll} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Expand All</button>
          <button onClick={collapseAll} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Collapse All</button>
        </div>
      </div>

      {/* Tree */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {isEmpty ? (
          <div className="py-16 text-center">
            <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-sm text-gray-500 mb-2">No accounts found</p>
            <p className="text-xs text-gray-400">Click "Seed System Accounts" to create a standard Indian Chart of Accounts</p>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No accounts match your search</p>
          </div>
        ) : (
          filteredTree.map((node) => renderNode(node, 0))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Edit Account' : 'New Account'}
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Account Code" required error={errors.account_code}>
                <Input
                  value={form.account_code}
                  onChange={(e) => updateField('account_code', e.target.value.toUpperCase())}
                  error={!!errors.account_code}
                  placeholder="e.g. 1001"
                  autoFocus
                />
              </FormField>
              <FormField label="Account Type" required error={errors.account_type}>
                <Select
                  value={form.account_type}
                  onChange={(e) => { updateField('account_type', e.target.value); updateField('parent_id', ''); updateField('account_group', ''); }}
                  options={ACCOUNT_TYPE_OPTIONS}
                  placeholder="Select type"
                  error={!!errors.account_type}
                />
              </FormField>
              <FormField label="Account Name" required error={errors.account_name} className="col-span-2">
                <Input
                  value={form.account_name}
                  onChange={(e) => updateField('account_name', e.target.value)}
                  error={!!errors.account_name}
                  placeholder="e.g. Cash in Hand"
                />
              </FormField>
              <FormField label="Account Group" required error={errors.account_group}>
                <Select
                  value={form.account_group}
                  onChange={(e) => updateField('account_group', e.target.value)}
                  options={form.account_type ? (ACCOUNT_GROUP_OPTIONS[form.account_type] || []) : []}
                  placeholder={form.account_type ? 'Select group' : 'Select type first'}
                  error={!!errors.account_group}
                  disabled={!form.account_type}
                />
              </FormField>
              <FormField label="Parent Account">
                <Select
                  value={form.parent_id}
                  onChange={(e) => updateField('parent_id', e.target.value)}
                  options={parentOptions}
                  placeholder="None (root level)"
                />
              </FormField>
              <FormField label="Opening Balance">
                <Input
                  type="number"
                  value={form.opening_balance}
                  onChange={(e) => updateField('opening_balance', e.target.value)}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="Balance Type">
                <div className="flex gap-4 pt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="balance_type"
                      checked={form.opening_balance_type === 'debit'}
                      onChange={() => updateField('opening_balance_type', 'debit')}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    Debit
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="balance_type"
                      checked={form.opening_balance_type === 'credit'}
                      onChange={() => updateField('opening_balance_type', 'credit')}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                    Credit
                  </label>
                </div>
              </FormField>
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_group}
                    onChange={(e) => updateField('is_group', e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-gray-700">This is a group account (can have sub-accounts)</span>
                </label>
              </div>
            </div>

            {errors._form && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {errors._form}
              </div>
            )}

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
        title="Delete Account"
        message="Are you sure you want to delete this account? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}