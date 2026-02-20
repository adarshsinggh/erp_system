// src/pages/settings/CategoryTree.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { mastersApi, ItemCategory } from '@/api/modules/masters.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';

interface TreeNode extends ItemCategory {
  children: TreeNode[];
  expanded?: boolean;
}

export function CategoryTree() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', code: '', description: '' });
  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', code: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mastersApi.listCategories();
      const flat = res.data || [];
      const built = buildTree(flat);
      setTree(built);
      // Expand all by default
      setExpandedIds(new Set(flat.map((c) => c.id)));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function buildTree(flat: ItemCategory[]): TreeNode[] {
    const map = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    flat.forEach((cat) => {
      map.set(cat.id, { ...cat, children: [] });
    });

    flat.forEach((cat) => {
      const node = map.get(cat.id)!;
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(node: TreeNode) {
    setEditingId(node.id);
    setEditForm({ name: node.name, code: node.code, description: node.description || '' });
    setAddingParentId(null);
    setAddingRoot(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ name: '', code: '', description: '' });
  }

  async function saveEdit() {
    if (!editingId || !editForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    setSaving(true);
    try {
      await mastersApi.updateCategory(editingId, editForm);
      toast.success('Category updated');
      cancelEdit();
      loadCategories();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startAddChild(parentId: string) {
    setAddingParentId(parentId);
    setAddingRoot(false);
    setNewForm({ name: '', code: '', description: '' });
    setEditingId(null);
    // Make sure parent is expanded
    setExpandedIds((prev) => new Set([...prev, parentId]));
  }

  function startAddRoot() {
    setAddingRoot(true);
    setAddingParentId(null);
    setNewForm({ name: '', code: '', description: '' });
    setEditingId(null);
  }

  function cancelAdd() {
    setAddingParentId(null);
    setAddingRoot(false);
    setNewForm({ name: '', code: '', description: '' });
  }

  async function saveNew() {
    if (!newForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    setSaving(true);
    try {
      await mastersApi.createCategory({
        name: newForm.name,
        code: newForm.code,
        description: newForm.description,
        parent_id: addingParentId,
      });
      toast.success('Category created');
      cancelAdd();
      loadCategories();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      await mastersApi.deleteCategory(id);
      toast.success('Category deleted');
      setDeleteConfirm(null);
      loadCategories();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  function renderNode(node: TreeNode, depth: number = 0): React.ReactNode {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children.length > 0;
    const isEditing = editingId === node.id;
    const isAddingChild = addingParentId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 group transition-colors ${
            isEditing ? 'bg-blue-50 hover:bg-blue-50' : ''
          }`}
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

          {/* Folder / Leaf Icon */}
          <svg className={`w-4 h-4 flex-shrink-0 ${hasChildren ? 'text-amber-500' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
            {hasChildren ? (
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            ) : (
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            )}
          </svg>

          {isEditing ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') cancelEdit();
                }}
              />
              <Input
                value={editForm.code}
                onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))}
                className="h-7 text-sm w-24"
                placeholder="Code"
              />
              <button onClick={saveEdit} disabled={saving} className="px-2 py-1 text-xs font-medium text-white bg-brand-600 rounded hover:bg-brand-700 disabled:opacity-50">
                {saving ? '...' : 'Save'}
              </button>
              <button onClick={cancelEdit} className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                Cancel
              </button>
            </div>
          ) : (
            <>
              <span className="font-medium text-sm text-gray-900 flex-1">{node.name}</span>
              {node.code && (
                <span className="font-mono text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">{node.code}</span>
              )}
              <div className="hidden group-hover:flex items-center gap-1">
                <button
                  onClick={() => startAddChild(node.id)}
                  className="p-1 text-gray-400 hover:text-brand-600 rounded"
                  title="Add child category"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={() => startEdit(node)}
                  className="p-1 text-gray-400 hover:text-blue-600 rounded"
                  title="Edit"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeleteConfirm(node.id)}
                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}

        {/* Inline add child form */}
        {isAddingChild && isExpanded && (
          <div
            className="flex items-center gap-2 py-2 px-3 bg-green-50 rounded-lg mx-2 my-1"
            style={{ paddingLeft: `${(depth + 1) * 24 + 12}px` }}
          >
            <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
            <Input
              value={newForm.name}
              onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))}
              className="h-7 text-sm flex-1"
              placeholder="Category name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveNew();
                if (e.key === 'Escape') cancelAdd();
              }}
            />
            <Input
              value={newForm.code}
              onChange={(e) => setNewForm((p) => ({ ...p, code: e.target.value }))}
              className="h-7 text-sm w-24"
              placeholder="Code"
            />
            <button onClick={saveNew} disabled={saving} className="px-2 py-1 text-xs font-medium text-white bg-brand-600 rounded hover:bg-brand-700 disabled:opacity-50">
              {saving ? '...' : 'Add'}
            </button>
            <button onClick={cancelAdd} className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Item Categories" />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3" style={{ paddingLeft: `${(i % 3) * 24}px` }}>
              <div className="skeleton h-5 w-5 rounded" />
              <div className="skeleton h-5 flex-1 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Item Categories"
        subtitle="Organize items in a hierarchical category tree"
        actions={[
          { label: 'Add Root Category', variant: 'primary', onClick: startAddRoot },
        ]}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {tree.length === 0 && !addingRoot ? (
          <div className="py-16 text-center">
            <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-sm text-gray-500 mb-2">No categories yet</p>
            <button onClick={startAddRoot} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Create your first category →
            </button>
          </div>
        ) : (
          <>
            {tree.map((node) => renderNode(node, 0))}

            {/* Root-level add form */}
            {addingRoot && (
              <div className="flex items-center gap-2 py-2 px-3 bg-green-50 rounded-lg mt-2">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                <Input
                  value={newForm.name}
                  onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-7 text-sm flex-1"
                  placeholder="Category name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNew();
                    if (e.key === 'Escape') cancelAdd();
                  }}
                />
                <Input
                  value={newForm.code}
                  onChange={(e) => setNewForm((p) => ({ ...p, code: e.target.value }))}
                  className="h-7 text-sm w-24"
                  placeholder="Code"
                />
                <button onClick={saveNew} disabled={saving} className="px-2 py-1 text-xs font-medium text-white bg-brand-600 rounded hover:bg-brand-700 disabled:opacity-50">
                  {saving ? '...' : 'Add'}
                </button>
                <button onClick={cancelAdd} className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete Category"
        message="Are you sure you want to delete this category? This will also remove any child categories."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}