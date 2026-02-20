// src/pages/inventory/StockTransferForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { stockTransfersApi, StockTransferDetail, StockTransfer, ReceiveLineInput } from '@/api/modules/stock-transfers.api';
import { settingsApi, Branch, Warehouse } from '@/api/modules/settings.api';
import { itemsApi, Item } from '@/api/modules/items.api';
import { batchSerialApi, StockBatch } from '@/api/modules/batch-serial.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { TRANSFER_STATUSES } from '@/lib/constants';
import type { StatusConfig } from '@/lib/constants';
import { formatIndianNumber } from '@/lib/formatters';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';

const EXTENDED_TRANSFER_STATUSES: Record<string, StatusConfig> = {
  ...TRANSFER_STATUSES,
  partially_received: { label: 'Partially Received', color: 'orange' },
};

interface FormLine {
  id?: string;
  line_number: number;
  item_id: string;
  item_code: string;
  item_name: string;
  product_id: string;
  quantity: number;
  received_quantity: number;
  uom_id: string;
  uom_code: string;
  batch_id: string;
  batch_number: string;
  unit_cost: number;
  remarks: string;
  // For receive UI
  receive_qty: number;
  receive_remarks: string;
}

function emptyLine(): FormLine {
  return {
    line_number: 1, item_id: '', item_code: '', item_name: '', product_id: '',
    quantity: 1, received_quantity: 0, uom_id: '', uom_code: '',
    batch_id: '', batch_number: '', unit_cost: 0, remarks: '',
    receive_qty: 0, receive_remarks: '',
  };
}

export function StockTransferForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<StockTransfer['status']>('draft' as StockTransfer['status']);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [dispatchConfirm, setDispatchConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const [form, setForm] = useState({
    transfer_date: new Date().toISOString().slice(0, 10),
    transfer_type: 'inter_warehouse' as StockTransfer['transfer_type'],
    from_branch_id: '', from_warehouse_id: '',
    to_branch_id: '', to_warehouse_id: '',
    reason: '',
  });
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [itemSearchIdx, setItemSearchIdx] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<Item[]>([]);
  const debouncedItemSearch = useDebounce(itemSearch, 300);

  const [batchOptions, setBatchOptions] = useState<Record<string, StockBatch[]>>({});

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;
  const showReceiveUI = status === 'in_transit' || status === 'partially_received';

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/inventory/transfers'),
  });

  useEffect(() => {
    settingsApi.listBranches().then((r) => setBranches(r.data || [])).catch(() => {});
    settingsApi.listWarehouses().then((r) => setWarehouses(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { if (isEdit) loadTransfer(); }, [id]);

  async function loadTransfer() {
    setLoading(true);
    try {
      const res = await stockTransfersApi.getById(id!);
      const t = res.data;
      setStatus(t.status as StockTransfer['status']);
      setForm({
        transfer_date: t.transfer_date || '',
        transfer_type: (t.transfer_type || 'inter_warehouse') as StockTransfer['transfer_type'],
        from_branch_id: t.from_branch_id || '',
        from_warehouse_id: t.from_warehouse_id || '',
        to_branch_id: t.to_branch_id || '',
        to_warehouse_id: t.to_warehouse_id || '',
        reason: t.reason || '',
      });
      if (t.lines?.length) {
        setLines(t.lines.map((l: any, idx: number) => ({
          id: l.id, line_number: l.line_number || idx + 1,
          item_id: l.item_id || '', item_code: l.item_code || '', item_name: l.item_name || '',
          product_id: l.product_id || '', quantity: l.quantity || 0,
          received_quantity: l.received_quantity || 0,
          uom_id: l.uom_id || '', uom_code: l.uom_code || '',
          batch_id: l.batch_id || '', batch_number: l.batch_number || '',
          unit_cost: l.unit_cost || 0, remarks: l.remarks || '',
          receive_qty: 0, receive_remarks: '',
        })));
      }
    } catch (err: any) { toast.error(err.message); navigate('/inventory/transfers'); }
    finally { setLoading(false); }
  }

  // Item search
  useEffect(() => {
    if (debouncedItemSearch?.length >= 2)
      itemsApi.list({ search: debouncedItemSearch, limit: 10, status: 'active' }).then((r) => setItemResults(r.data || [])).catch(() => {});
    else setItemResults([]);
  }, [debouncedItemSearch]);

  function selectItem(idx: number, item: Item) {
    setLines((prev) => prev.map((l, i) => i === idx ? {
      ...l, item_id: item.id, item_code: item.item_code, item_name: item.name,
      uom_id: item.primary_uom_id || '', uom_code: item.uom_code || '',
      unit_cost: item.purchase_price || 0,
    } : l));
    setItemSearchIdx(null);
    setItemSearch('');
    setItemResults([]);

    // Load batches if batch tracking enabled
    if (item.batch_tracking) {
      batchSerialApi.getItemBatches(item.id).then((r) => {
        setBatchOptions((prev) => ({ ...prev, [item.id]: r.data || [] }));
      }).catch(() => {});
    }
  }

  function updateLine(idx: number, field: keyof FormLine, value: any) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine(), line_number: prev.length + 1 }]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, line_number: i + 1 })));
  }

  const fromWarehouses = form.from_branch_id ? warehouses.filter((w) => w.branch_id === form.from_branch_id) : warehouses;
  const toWarehouses = form.to_branch_id ? warehouses.filter((w) => w.branch_id === form.to_branch_id) : warehouses;

  async function handleSave() {
    if (!form.from_warehouse_id || !form.to_warehouse_id) { toast.error('Select source and destination warehouse'); return; }
    if (form.from_warehouse_id === form.to_warehouse_id) { toast.error('Source and destination warehouse cannot be the same'); return; }
    const validLines = lines.filter((l) => l.item_id && l.quantity > 0);
    if (!validLines.length) { toast.error('Add at least one line item'); return; }

    setSaving(true);
    try {
      const payload = {
        ...form,
        lines: validLines.map((l) => ({
          id: l.id, line_number: l.line_number, item_id: l.item_id, product_id: l.product_id || undefined,
          quantity: l.quantity, uom_id: l.uom_id, batch_id: l.batch_id || undefined,
          unit_cost: l.unit_cost || undefined, remarks: l.remarks || undefined,
        })),
      };
      if (isEdit) {
        await stockTransfersApi.update(id!, payload);
        toast.success('Transfer updated');
      } else {
        const res = await stockTransfersApi.create(payload);
        toast.success('Transfer created');
        navigate(`/inventory/transfers/${res.data.id}`);
        return;
      }
      loadTransfer();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: 'approve' | 'dispatch' | 'cancel') {
    setSaving(true);
    try {
      if (action === 'approve') { await stockTransfersApi.approve(id!); toast.success('Transfer approved'); }
      if (action === 'dispatch') { await stockTransfersApi.dispatch(id!); toast.success('Transfer dispatched — stock deducted from source'); }
      if (action === 'cancel') { await stockTransfersApi.cancel(id!); toast.success('Transfer cancelled'); }
      loadTransfer();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleReceive() {
    const receiveLines: ReceiveLineInput[] = lines
      .filter((l) => l.receive_qty > 0)
      .map((l) => ({ line_id: l.id!, received_quantity: l.receive_qty, remarks: l.receive_remarks || undefined }));
    if (!receiveLines.length) { toast.error('Enter received quantity for at least one line'); return; }
    setSaving(true);
    try {
      await stockTransfersApi.receive(id!, { lines: receiveLines });
      toast.success('Goods received — stock added to destination');
      loadTransfer();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await stockTransfersApi.delete(id!);
      toast.success('Transfer deleted');
      navigate('/inventory/transfers');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  // Actions based on status
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
    if (status === 'approved') {
      actions.push({ label: 'Dispatch', variant: 'primary', onClick: () => setDispatchConfirm(true), loading: saving });
    }
    if (showReceiveUI) {
      actions.push({ label: 'Confirm Receipt', variant: 'primary', onClick: handleReceive, loading: saving });
      if (status === 'in_transit') {
        actions.push({ label: 'Cancel', variant: 'danger', onClick: () => setCancelConfirm(true) });
      }
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
        title={isEdit ? `Transfer ${lines[0]?.item_code ? '' : ''}` : 'New Stock Transfer'}
        subtitle={isEdit ? `Status: ` : 'Create an inter-warehouse or inter-branch transfer'}
        actions={getActions()}
      >
        {isEdit && <StatusBadge status={status} statusMap={EXTENDED_TRANSFER_STATUSES} />}
      </PageHeader>

      {/* Header Fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Transfer Date" required>
            <Input type="date" value={form.transfer_date} onChange={(e) => setForm((f) => ({ ...f, transfer_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Transfer Type" required>
            <Select value={form.transfer_type}
              onChange={(e) => setForm((f) => ({ ...f, transfer_type: e.target.value as StockTransfer['transfer_type'] }))}
              options={[{ value: 'inter_warehouse', label: 'Inter-Warehouse' }, { value: 'inter_branch', label: 'Inter-Branch' }]}
              disabled={readonly} />
          </FormField>
          <div />

          <FormField label="From Branch">
            <Select value={form.from_branch_id} onChange={(e) => setForm((f) => ({ ...f, from_branch_id: e.target.value, from_warehouse_id: '' }))}
              options={branches.map((b) => ({ value: b.id, label: b.name }))} placeholder="Select branch" disabled={readonly} />
          </FormField>
          <FormField label="From Warehouse" required>
            <Select value={form.from_warehouse_id} onChange={(e) => setForm((f) => ({ ...f, from_warehouse_id: e.target.value }))}
              options={fromWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))} placeholder="Select warehouse" disabled={readonly} />
          </FormField>
          <div />

          <FormField label="To Branch">
            <Select value={form.to_branch_id} onChange={(e) => setForm((f) => ({ ...f, to_branch_id: e.target.value, to_warehouse_id: '' }))}
              options={branches.map((b) => ({ value: b.id, label: b.name }))} placeholder="Select branch" disabled={readonly} />
          </FormField>
          <FormField label="To Warehouse" required>
            <Select value={form.to_warehouse_id} onChange={(e) => setForm((f) => ({ ...f, to_warehouse_id: e.target.value }))}
              options={toWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))} placeholder="Select warehouse" disabled={readonly} />
          </FormField>
          <div />

          <FormField label="Reason" className="md:col-span-3">
            <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={2} disabled={readonly}
              placeholder="Reason for transfer..." />
          </FormField>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Transfer Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 w-8 text-gray-500 font-medium">#</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Item</th>
                <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Qty</th>
                <th className="text-left py-2 px-2 w-16 text-gray-500 font-medium">UOM</th>
                <th className="text-left py-2 px-2 w-32 text-gray-500 font-medium">Batch</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Cost</th>
                <th className="text-left py-2 px-2 w-32 text-gray-500 font-medium">Remarks</th>
                {readonly && <th className="text-right py-2 px-2 w-16 text-gray-500 font-medium">Rcvd</th>}
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
                          onFocus={() => setItemSearchIdx(idx)} placeholder="Search item..." className="!py-1 !text-xs h-8" />
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
                  <td className="py-2 px-2">
                    <Input type="number" value={line.quantity} onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-500">{line.uom_code || '—'}</td>
                  <td className="py-2 px-2">
                    {line.item_id && batchOptions[line.item_id]?.length ? (
                      <Select value={line.batch_id} onChange={(e) => {
                        const batch = batchOptions[line.item_id]?.find((b) => b.id === e.target.value);
                        updateLine(idx, 'batch_id', e.target.value);
                        if (batch) updateLine(idx, 'batch_number', batch.batch_number);
                      }} options={batchOptions[line.item_id].map((b) => ({ value: b.id, label: `${b.batch_number} (${b.current_quantity})` }))}
                        placeholder="—" disabled={readonly} />
                    ) : (
                      <span className="text-xs text-gray-400">{line.batch_number || '—'}</span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <Input type="number" value={line.unit_cost} onChange={(e) => updateLine(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                      disabled={readonly} className="!py-1 !text-xs h-8 text-right" min={0} />
                  </td>
                  <td className="py-2 px-2">
                    <Input value={line.remarks} onChange={(e) => updateLine(idx, 'remarks', e.target.value)}
                      disabled={readonly} className="!py-1 !text-xs h-8" placeholder="..." />
                  </td>
                  {readonly && <td className="py-2 px-2 text-right text-xs text-gray-500">{line.received_quantity || 0}</td>}
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
      </div>

      {/* Receive UI */}
      {showReceiveUI && (
        <div className="bg-white rounded-xl border-2 border-blue-200 p-6 mb-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-1">Receive Goods</h3>
          <p className="text-xs text-blue-600 mb-4">Enter the quantity received for each item. Partial receipt is supported.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-100">
                  <th className="text-left py-2 px-2 text-blue-700 font-medium">Item</th>
                  <th className="text-right py-2 px-2 w-24 text-blue-700 font-medium">Dispatched</th>
                  <th className="text-right py-2 px-2 w-24 text-blue-700 font-medium">Prev Rcvd</th>
                  <th className="text-right py-2 px-2 w-24 text-blue-700 font-medium">Remaining</th>
                  <th className="text-right py-2 px-2 w-28 text-blue-700 font-medium">Receive Qty</th>
                  <th className="text-left py-2 px-2 w-40 text-blue-700 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const remaining = line.quantity - (line.received_quantity || 0);
                  if (remaining <= 0) return null;
                  return (
                    <tr key={idx} className="border-b border-blue-50">
                      <td className="py-2 px-2">
                        <span className="font-mono text-xs">{line.item_code}</span>
                        <span className="ml-1 text-xs text-gray-600">{line.item_name}</span>
                      </td>
                      <td className="py-2 px-2 text-right text-xs text-gray-500">{formatIndianNumber(line.quantity, 2)}</td>
                      <td className="py-2 px-2 text-right text-xs text-gray-500">{formatIndianNumber(line.received_quantity, 2)}</td>
                      <td className="py-2 px-2 text-right text-xs font-medium text-gray-700">{formatIndianNumber(remaining, 2)}</td>
                      <td className="py-2 px-2">
                        <Input type="number" value={line.receive_qty}
                          onChange={(e) => updateLine(idx, 'receive_qty', Math.min(parseFloat(e.target.value) || 0, remaining))}
                          className="!py-1 !text-xs h-8 text-right" min={0} max={remaining} />
                      </td>
                      <td className="py-2 px-2">
                        <Input value={line.receive_remarks} onChange={(e) => updateLine(idx, 'receive_remarks', e.target.value)}
                          className="!py-1 !text-xs h-8" placeholder="Remarks..." />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog open={deleteConfirm} title="Delete Transfer" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
      <ConfirmDialog open={dispatchConfirm} title="Dispatch Transfer"
        message="This will deduct stock from the source warehouse. Proceed?"
        variant="danger" confirmLabel="Dispatch" onConfirm={() => { setDispatchConfirm(false); handleAction('dispatch'); }} onCancel={() => setDispatchConfirm(false)} />
      <ConfirmDialog open={cancelConfirm} title="Cancel Transfer"
        message="This will reverse dispatched stock back to the source warehouse. Proceed?"
        variant="danger" confirmLabel="Cancel Transfer" onConfirm={() => { setCancelConfirm(false); handleAction('cancel'); }} onCancel={() => setCancelConfirm(false)} />
    </div>
  );
}