// src/pages/inventory/StockAdjustmentForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { stockAdjustmentsApi, StockAdjustmentDetail, StockAdjustment } from '@/api/modules/stock-adjustments.api';
import { inventoryApi } from '@/api/modules/inventory.api';
import { settingsApi, Warehouse } from '@/api/modules/settings.api';
import { itemsApi, Item } from '@/api/modules/items.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { formatIndianNumber } from '@/lib/formatters';
import type { StatusConfig } from '@/lib/constants';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';

const ADJUSTMENT_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  posted: { label: 'Posted', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

const REASON_OPTIONS = [
  { value: 'physical_count', label: 'Physical Count' },
  { value: 'damage', label: 'Damage' },
  { value: 'theft', label: 'Theft' },
  { value: 'correction', label: 'Correction' },
  { value: 'opening_stock', label: 'Opening Stock' },
];

interface FormLine {
  id?: string;
  line_number: number;
  item_id: string;
  item_code: string;
  item_name: string;
  product_id: string;
  system_quantity: number;
  actual_quantity: number;
  adjustment_quantity: number;
  uom_id: string;
  uom_code: string;
  unit_cost: number;
  total_value: number;
  batch_id: string;
  batch_number: string;
  remarks: string;
}

function emptyLine(): FormLine {
  return {
    line_number: 1, item_id: '', item_code: '', item_name: '', product_id: '',
    system_quantity: 0, actual_quantity: 0, adjustment_quantity: 0,
    uom_id: '', uom_code: '', unit_cost: 0, total_value: 0,
    batch_id: '', batch_number: '', remarks: '',
  };
}

export function StockAdjustmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StockAdjustment['status']>('draft' as StockAdjustment['status']);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [postConfirm, setPostConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const [form, setForm] = useState({
    adjustment_date: new Date().toISOString().slice(0, 10),
    branch_id: '',
    warehouse_id: '',
    reason: 'physical_count' as StockAdjustment['reason'],
    reason_detail: '',
  });
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [itemSearchIdx, setItemSearchIdx] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<Item[]>([]);
  const debouncedItemSearch = useDebounce(itemSearch, 300);

  const isDraft = status === 'draft';
  const isApproved = status === 'approved';
  const readonly = !isDraft && isEdit;

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/inventory/adjustments'),
  });

  useEffect(() => {
    settingsApi.listWarehouses().then((r) => setWarehouses(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { if (isEdit) loadAdjustment(); }, [id]);

  async function loadAdjustment() {
    setLoading(true);
    try {
      const res = await stockAdjustmentsApi.getById(id!);
      const a = res.data;
      setStatus((a.status || 'draft') as StockAdjustment['status']);
      setForm({
        adjustment_date: a.adjustment_date || '',
        branch_id: a.branch_id || '',
        warehouse_id: a.warehouse_id || '',
        reason: (a.reason || 'physical_count') as StockAdjustment['reason'],
        reason_detail: a.reason_detail || '',
      });
      if (a.lines?.length) {
        setLines(a.lines.map((l: any, idx: number) => ({
          id: l.id, line_number: l.line_number || idx + 1,
          item_id: l.item_id || '', item_code: l.item_code || '', item_name: l.item_name || '',
          product_id: l.product_id || '',
          system_quantity: l.system_quantity || 0,
          actual_quantity: l.actual_quantity || 0,
          adjustment_quantity: l.adjustment_quantity || 0,
          uom_id: l.uom_id || '', uom_code: l.uom_code || '',
          unit_cost: l.unit_cost || 0,
          total_value: l.total_value || 0,
          batch_id: l.batch_id || '', batch_number: l.batch_number || '',
          remarks: l.remarks || '',
        })));
      }
    } catch (err: any) { toast.error(err.message); navigate('/inventory/adjustments'); }
    finally { setLoading(false); }
  }

  // Item search
  useEffect(() => {
    if (debouncedItemSearch?.length >= 2)
      itemsApi.list({ search: debouncedItemSearch, limit: 10, status: 'active' }).then((r) => setItemResults(r.data || [])).catch(() => {});
    else setItemResults([]);
  }, [debouncedItemSearch]);

  async function selectItem(idx: number, item: Item) {
    // Auto-populate system_quantity from inventory
    let sysQty = 0;
    let avgCost = 0;
    if (form.warehouse_id) {
      try {
        const bal = await inventoryApi.getStockBalance({ item_id: item.id, warehouse_id: form.warehouse_id });
        sysQty = bal.data?.available_quantity || 0;
        avgCost = bal.data?.weighted_avg_cost || 0;
      } catch { /* no stock record — qty = 0 */ }
    }

    setLines((prev) => prev.map((l, i) => i === idx ? {
      ...l, item_id: item.id, item_code: item.item_code, item_name: item.name,
      uom_id: item.primary_uom_id || '', uom_code: item.uom_code || '',
      system_quantity: sysQty,
      actual_quantity: sysQty, // Default actual = system (no change)
      adjustment_quantity: 0,
      unit_cost: avgCost || item.standard_cost || item.purchase_price || 0,
      total_value: 0,
    } : l));
    setItemSearchIdx(null);
    setItemSearch('');
    setItemResults([]);
  }

  function updateActualQty(idx: number, actual: number) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const adjQty = actual - l.system_quantity;
      return {
        ...l,
        actual_quantity: actual,
        adjustment_quantity: adjQty,
        total_value: Math.abs(adjQty) * l.unit_cost,
      };
    }));
  }

  function updateLine(idx: number, field: keyof FormLine, value: any) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      // Recalculate if cost changes
      if (field === 'unit_cost') {
        updated.total_value = Math.abs(updated.adjustment_quantity) * (value as number);
      }
      return updated;
    }));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine(), line_number: prev.length + 1 }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, line_number: i + 1 })));
  }

  async function handleSave() {
    if (!form.warehouse_id) { toast.error('Select a warehouse'); return; }
    const validLines = lines.filter((l) => l.item_id);
    if (!validLines.length) { toast.error('Add at least one line item'); return; }

    setSaving(true);
    try {
      const payload = {
        ...form,
        lines: validLines.map((l) => ({
          id: l.id, line_number: l.line_number, item_id: l.item_id, product_id: l.product_id || undefined,
          system_quantity: l.system_quantity, actual_quantity: l.actual_quantity,
          adjustment_quantity: l.adjustment_quantity,
          uom_id: l.uom_id, unit_cost: l.unit_cost,
          batch_id: l.batch_id || undefined, remarks: l.remarks || undefined,
        })),
      };
      if (isEdit) {
        await stockAdjustmentsApi.update(id!, payload);
        toast.success('Adjustment updated');
      } else {
        const res = await stockAdjustmentsApi.create(payload);
        toast.success('Adjustment created');
        navigate(`/inventory/adjustments/${res.data.id}`);
        return;
      }
      loadAdjustment();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: 'approve' | 'post' | 'cancel') {
    setSaving(true);
    try {
      if (action === 'approve') { await stockAdjustmentsApi.approve(id!); toast.success('Adjustment approved'); }
      if (action === 'post') { await stockAdjustmentsApi.post(id!); toast.success('Adjustment posted — inventory updated'); }
      if (action === 'cancel') { await stockAdjustmentsApi.cancel(id!); toast.success('Adjustment cancelled'); }
      loadAdjustment();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await stockAdjustmentsApi.delete(id!);
      toast.success('Adjustment deleted');
      navigate('/inventory/adjustments');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  function getActions() {
    const actions: any[] = [];
    if (!isEdit) {
      actions.push({ label: 'Save Draft', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', loading: saving });
      return actions;
    }
    if (isDraft) {
      actions.push({ label: 'Save Draft', variant: 'secondary', onClick: handleSave, shortcut: 'Ctrl+Enter', loading: saving });
      actions.push({ label: 'Approve', variant: 'primary', onClick: () => handleAction('approve'), loading: saving });
      actions.push({ label: 'Delete', variant: 'danger', onClick: () => setDeleteConfirm(true) });
    }
    if (isApproved) {
      actions.push({ label: 'Post', variant: 'primary', onClick: () => setPostConfirm(true), loading: saving });
      actions.push({ label: 'Cancel', variant: 'danger', onClick: () => setCancelConfirm(true) });
    }
    if (status === 'posted') {
      actions.push({ label: 'Reverse (Cancel)', variant: 'danger', onClick: () => setCancelConfirm(true) });
    }
    return actions;
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-4 w-72 rounded" />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 mt-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4"><div className="skeleton h-4 w-24 rounded" /><div className="skeleton h-4 flex-1 rounded" /></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? `Adjustment ${form.reason ? '' : ''}` : 'New Stock Adjustment'}
        subtitle={isEdit ? 'Stock adjustment details' : 'Record physical count or stock corrections'}
        actions={getActions()}
      >
        {isEdit && <StatusBadge status={status} statusMap={ADJUSTMENT_STATUSES} />}
      </PageHeader>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Adjustment Date" required>
            <Input type="date" value={form.adjustment_date} onChange={(e) => setForm((f) => ({ ...f, adjustment_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Warehouse" required>
            <Select value={form.warehouse_id}
              onChange={(e) => {
                const wh = warehouses.find((w) => w.id === e.target.value);
                setForm((f) => ({ ...f, warehouse_id: e.target.value, branch_id: wh?.branch_id || '' }));
              }}
              options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
              placeholder="Select warehouse" disabled={readonly} />
          </FormField>
          <FormField label="Reason" required>
            <Select value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as StockAdjustment['reason'] }))}
              options={REASON_OPTIONS} disabled={readonly} />
          </FormField>
          <FormField label="Reason Detail" className="md:col-span-3">
            <Input value={form.reason_detail} onChange={(e) => setForm((f) => ({ ...f, reason_detail: e.target.value }))}
              disabled={readonly} placeholder="Additional details about this adjustment..." />
          </FormField>
        </div>
      </div>

      {/* Hint */}
      {!readonly && form.warehouse_id && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-blue-700">
          Select items and enter physical count. System quantities are fetched automatically from the selected warehouse.
        </div>
      )}

      {/* Line Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Adjustment Lines</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 w-8 text-gray-500 font-medium">#</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Item</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">System Qty</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Actual Qty</th>
                <th className="text-right py-2 px-2 w-28 text-gray-500 font-medium">Adjustment</th>
                <th className="text-left py-2 px-2 w-14 text-gray-500 font-medium">UOM</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Unit Cost</th>
                <th className="text-right py-2 px-2 w-28 text-gray-500 font-medium">Value</th>
                <th className="text-left py-2 px-2 w-32 text-gray-500 font-medium">Remarks</th>
                {!readonly && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-2 px-2 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="py-2 px-2 relative">
                    {readonly ? (
                      <span className="text-xs">{line.item_code} - {line.item_name}</span>
                    ) : (
                      <>
                        <Input value={itemSearchIdx === idx ? itemSearch : (line.item_code ? `${line.item_code} - ${line.item_name}` : '')}
                          onChange={(e) => { setItemSearchIdx(idx); setItemSearch(e.target.value); }}
                          onFocus={() => setItemSearchIdx(idx)} placeholder="Search item..."
                          className="!py-1 !text-xs h-8" disabled={!form.warehouse_id} />
                        {itemSearchIdx === idx && itemResults.length > 0 && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
                            {itemResults.map((it) => (
                              <button key={it.id} type="button" onClick={() => selectItem(idx, it)}
                                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">
                                <span className="font-mono font-medium">{it.item_code}</span>
                                <span className="ml-2">{it.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  {/* System Qty — read-only, gray background */}
                  <td className="py-2 px-2">
                    <div className="bg-gray-100 rounded px-2 py-1 text-right text-xs text-gray-600 h-8 flex items-center justify-end">
                      {line.item_id ? formatIndianNumber(line.system_quantity, 2) : '—'}
                    </div>
                  </td>
                  {/* Actual Qty — user input */}
                  <td className="py-2 px-2">
                    <Input type="number" value={line.actual_quantity}
                      onChange={(e) => updateActualQty(idx, parseFloat(e.target.value) || 0)}
                      disabled={readonly || !line.item_id} className="!py-1 !text-xs h-8 text-right" min={0} />
                  </td>
                  {/* Adjustment Qty — auto-calculated */}
                  <td className="py-2 px-2">
                    <div className={`rounded px-2 py-1 text-right text-xs font-semibold h-8 flex items-center justify-end ${
                      line.adjustment_quantity > 0 ? 'bg-green-50 text-green-700' :
                      line.adjustment_quantity < 0 ? 'bg-red-50 text-red-700' :
                      'bg-gray-50 text-gray-400'
                    }`}>
                      {!line.item_id ? '—' :
                       line.adjustment_quantity > 0 ? `↑ +${formatIndianNumber(line.adjustment_quantity, 2)}` :
                       line.adjustment_quantity < 0 ? `↓ ${formatIndianNumber(line.adjustment_quantity, 2)}` :
                       '0'}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-500">{line.uom_code || '—'}</td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.unit_cost}
                      onChange={(e) => updateLine(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                      disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                  </td>
                  <td className="py-2 px-2 text-right">
                    {line.total_value > 0 ? <AmountDisplay value={line.total_value} compact /> : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="py-2 px-2">
                    <Input value={line.remarks} onChange={(e) => updateLine(idx, 'remarks', e.target.value)}
                      disabled={readonly} className="!py-1 !text-xs h-8" placeholder="..." />
                  </td>
                  {!readonly && (
                    <td className="py-2 px-2">
                      <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-30">×</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readonly && <button onClick={addLine} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">+ Add Line</button>}

        {/* Summary */}
        {lines.some((l) => l.adjustment_quantity !== 0) && (
          <div className="flex justify-end mt-4 border-t border-gray-100 pt-3">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-green-600">Total Gains</span>
                <AmountDisplay value={lines.filter((l) => l.adjustment_quantity > 0).reduce((s, l) => s + l.total_value, 0)} />
              </div>
              <div className="flex justify-between">
                <span className="text-red-600">Total Losses</span>
                <AmountDisplay value={lines.filter((l) => l.adjustment_quantity < 0).reduce((s, l) => s + l.total_value, 0)} />
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
                <span>Net Impact</span>
                <AmountDisplay value={lines.reduce((s, l) => s + (l.adjustment_quantity * l.unit_cost), 0)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog open={deleteConfirm} title="Delete Adjustment" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
      <ConfirmDialog open={postConfirm} title="Post Adjustment"
        message="This will update inventory. Gains will increase stock, losses will decrease stock. Proceed?"
        variant="danger" confirmLabel="Post" onConfirm={() => { setPostConfirm(false); handleAction('post'); }} onCancel={() => setPostConfirm(false)} />
      <ConfirmDialog open={cancelConfirm} title="Cancel Adjustment"
        message={status === 'posted' ? 'This will reverse all stock adjustments. Proceed?' : 'This will cancel the adjustment.'}
        variant="danger" confirmLabel="Cancel Adjustment" onConfirm={() => { setCancelConfirm(false); handleAction('cancel'); }} onCancel={() => setCancelConfirm(false)} />
    </div>
  );
}