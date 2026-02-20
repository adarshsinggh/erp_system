// src/pages/settings/DocumentSequences.tsx
import React, { useState, useEffect } from 'react';
import { settingsApi, DocumentSequence } from '@/api/modules/settings.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { FormField, Input, toast } from '@/components/shared/FormElements';
import { useDebounce } from '@/hooks';

const docTypeLabels: Record<string, string> = {
  sales_quotation: 'Sales Quotation',
  sales_order: 'Sales Order',
  sales_invoice: 'Sales Invoice',
  credit_note: 'Credit Note',
  payment_receipt: 'Payment Receipt',
  purchase_requisition: 'Purchase Requisition',
  purchase_order: 'Purchase Order',
  goods_receipt_note: 'Goods Receipt Note',
  vendor_bill: 'Vendor Bill',
  debit_note: 'Debit Note',
  vendor_payment: 'Vendor Payment',
  delivery_challan: 'Delivery Challan',
  stock_transfer: 'Stock Transfer',
  stock_adjustment: 'Stock Adjustment',
  work_order: 'Work Order',
  production_entry: 'Production Entry',
  scrap_entry: 'Scrap Entry',
  journal_voucher: 'Journal Voucher',
};

export function DocumentSequences() {
  const [data, setData] = useState<DocumentSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ prefix: '', suffix: '', next_number: '', padding: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await settingsApi.listSequences();
      setData(res.data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(seq: DocumentSequence) {
    setEditingId(seq.id);
    setEditForm({
      prefix: seq.prefix,
      suffix: seq.suffix,
      next_number: String(seq.next_number),
      padding: String(seq.padding),
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function getPreview(): string {
    const num = parseInt(editForm.next_number) || 0;
    const pad = parseInt(editForm.padding) || 1;
    return `${editForm.prefix}${String(num).padStart(pad, '0')}${editForm.suffix}`;
  }

  async function saveEdit() {
    if (!editingId) return;
    const nextNum = parseInt(editForm.next_number);
    const padding = parseInt(editForm.padding);
    if (isNaN(nextNum) || nextNum < 0) {
      toast.error('Next number must be a positive integer');
      return;
    }
    if (isNaN(padding) || padding < 1 || padding > 10) {
      toast.error('Padding must be between 1 and 10');
      return;
    }
    setSaving(true);
    try {
      await settingsApi.updateSequence(editingId, {
        prefix: editForm.prefix,
        suffix: editForm.suffix,
        next_number: nextNum,
        padding: padding,
      });
      toast.success('Sequence updated');
      cancelEdit();
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = debouncedSearch
    ? data.filter((s) => {
        const q = debouncedSearch.toLowerCase();
        const label = (docTypeLabels[s.document_type] || s.document_type).toLowerCase();
        return (
          label.includes(q) ||
          s.prefix.toLowerCase().includes(q) ||
          (s.branch_name || '').toLowerCase().includes(q)
        );
      })
    : data;

  const columns: ColumnDef<DocumentSequence>[] = [
    {
      key: 'document_type', header: 'Document Type', sortable: true,
      render: (row) => (
        <span className="font-medium text-gray-900">
          {docTypeLabels[row.document_type] || row.document_type.replace(/_/g, ' ')}
        </span>
      ),
    },
    { key: 'branch_name', header: 'Branch' },
    {
      key: 'prefix', header: 'Prefix',
      render: (row) => (
        editingId === row.id ? (
          <Input value={editForm.prefix} onChange={(e) => setEditForm((p) => ({ ...p, prefix: e.target.value }))} className="h-7 text-sm w-28" />
        ) : (
          <span className="font-mono text-xs">{row.prefix || '—'}</span>
        )
      ),
    },
    {
      key: 'next_number', header: 'Next Number', align: 'right',
      render: (row) => (
        editingId === row.id ? (
          <Input type="number" value={editForm.next_number} onChange={(e) => setEditForm((p) => ({ ...p, next_number: e.target.value }))} className="h-7 text-sm w-24 text-right" min={0} />
        ) : (
          <span className="font-mono">{row.next_number}</span>
        )
      ),
    },
    {
      key: 'padding', header: 'Padding', align: 'right',
      render: (row) => (
        editingId === row.id ? (
          <Input type="number" value={editForm.padding} onChange={(e) => setEditForm((p) => ({ ...p, padding: e.target.value }))} className="h-7 text-sm w-16 text-right" min={1} max={10} />
        ) : (
          <span>{row.padding}</span>
        )
      ),
    },
    {
      key: 'suffix', header: 'Suffix',
      render: (row) => (
        editingId === row.id ? (
          <Input value={editForm.suffix} onChange={(e) => setEditForm((p) => ({ ...p, suffix: e.target.value }))} className="h-7 text-sm w-28" />
        ) : (
          <span className="font-mono text-xs">{row.suffix || '—'}</span>
        )
      ),
    },
    {
      key: 'preview', header: 'Preview',
      render: (row) => (
        <span className="font-mono text-xs font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
          {editingId === row.id ? getPreview() : row.preview}
        </span>
      ),
    },
    {
      key: 'actions', header: '',
      width: '100px',
      render: (row) => (
        editingId === row.id ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={saveEdit} disabled={saving} className="px-2 py-1 text-xs font-medium text-white bg-brand-600 rounded hover:bg-brand-700 disabled:opacity-50">
              {saving ? '...' : 'Save'}
            </button>
            <button onClick={cancelEdit} className="px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); startEdit(row); }}
            className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
            title="Edit sequence"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Document Sequences"
        subtitle="Configure auto-numbering for all document types"
      />
      <div className="flex gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search sequences..." className="w-72" />
      </div>
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        total={filtered.length}
        emptyMessage="No document sequences configured"
      />
    </div>
  );
}