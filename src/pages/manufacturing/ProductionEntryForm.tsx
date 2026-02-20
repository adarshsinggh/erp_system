// src/pages/manufacturing/ProductionEntryForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { productionEntriesApi, ProductionEntry } from '@/api/modules/production-entries.api';
import { workOrdersApi, WorkOrder, WorkOrderDetail } from '@/api/modules/work-orders.api';
import { settingsApi, Warehouse } from '@/api/modules/settings.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Textarea, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import { formatCurrency } from '@/lib/formatters';

export function ProductionEntryForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [entry, setEntry] = useState<ProductionEntry | null>(null);

  const [form, setForm] = useState({
    work_order_id: '',
    entry_date: new Date().toISOString().slice(0, 10),
    quantity_produced: '' as string | number,
    scrap_quantity: 0 as string | number,
    warehouse_id: '',
    batch_number: '',
    serial_numbers: '',
    remarks: '',
  });

  // WO search dropdown
  const [woSearch, setWoSearch] = useState('');
  const [woResults, setWoResults] = useState<WorkOrder[]>([]);
  const [selectedWo, setSelectedWo] = useState<WorkOrderDetail | null>(null);
  const [showWoDropdown, setShowWoDropdown] = useState(false);
  const debouncedWoSearch = useDebounce(woSearch, 300);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!isEdit) handleSave(); },
    'escape': () => navigate('/manufacturing/production'),
  });

  useEffect(() => { loadWarehouses(); }, []);
  useEffect(() => { if (isEdit) loadEntry(); }, [id]);

  // If navigated from WO form with ?wo=xxx
  useEffect(() => {
    const woId = searchParams.get('wo');
    if (woId && !isEdit) {
      loadWorkOrder(woId);
    }
  }, [searchParams]);

  async function loadEntry() {
    setLoading(true);
    try {
      const res = await productionEntriesApi.getById(id!);
      const data = res.data;
      setEntry(data);
      setForm({
        work_order_id: data.work_order_id || '',
        entry_date: data.entry_date || '',
        quantity_produced: data.quantity_produced || '',
        scrap_quantity: data.scrap_quantity || 0,
        warehouse_id: data.warehouse_id || '',
        batch_number: data.batch_number || '',
        serial_numbers: data.serial_numbers?.join(', ') || '',
        remarks: data.remarks || '',
      });
      setWoSearch(data.work_order_number);
      // Load the full WO detail for the progress card
      try {
        const woRes = await workOrdersApi.getById(data.work_order_id);
        setSelectedWo(woRes.data);
      } catch { /* ok */ }
    } catch (err: any) {
      toast.error(err.message);
      navigate('/manufacturing/production');
    } finally {
      setLoading(false);
    }
  }

  async function loadWarehouses() {
    try {
      const res = await settingsApi.listWarehouses();
      setWarehouses(res.data || []);
    } catch { /* ignore */ }
  }

  async function loadWorkOrder(woId: string) {
    try {
      const res = await workOrdersApi.getById(woId);
      const wo = res.data;
      setSelectedWo(wo);
      setWoSearch(wo.work_order_number);
      setForm((f) => ({
        ...f,
        work_order_id: wo.id,
        warehouse_id: wo.target_warehouse_id || f.warehouse_id,
      }));
      setShowWoDropdown(false);
    } catch (err: any) { toast.error('Failed to load work order'); }
  }

  // WO search
  useEffect(() => {
    if (debouncedWoSearch?.length >= 2 && !selectedWo)
      workOrdersApi.list({
        search: debouncedWoSearch, limit: 10,
        status: 'material_issued', // also allow in_progress
      }).then(async (r) => {
        // Also search in_progress
        const r2 = await workOrdersApi.list({ search: debouncedWoSearch, limit: 10, status: 'in_progress' });
        const combined = [...(r.data || []), ...(r2.data || [])];
        const unique = combined.filter((wo, idx, arr) => arr.findIndex((w) => w.id === wo.id) === idx);
        setWoResults(unique);
      }).catch(() => {});
    else setWoResults([]);
  }, [debouncedWoSearch]);

  function selectWo(wo: WorkOrder) {
    setShowWoDropdown(false);
    setWoSearch(wo.work_order_number);
    loadWorkOrder(wo.id);
  }

  async function handleSave() {
    if (!form.work_order_id || !form.quantity_produced) {
      toast.error('Work Order and Quantity Produced are required');
      return;
    }
    // Validate max production
    if (selectedWo) {
      const maxAllowed = selectedWo.planned_quantity * 1.1;
      const totalAfter = selectedWo.completed_quantity + Number(form.quantity_produced);
      if (totalAfter > maxAllowed) {
        toast.error(`Cannot exceed 110% of planned quantity (max ${maxAllowed.toFixed(2)}). Already completed: ${selectedWo.completed_quantity}`);
        return;
      }
    }

    setSaving(true);
    try {
      const serialArr = form.serial_numbers
        ? form.serial_numbers.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      await productionEntriesApi.create({
        work_order_id: form.work_order_id,
        entry_date: form.entry_date,
        quantity_produced: Number(form.quantity_produced),
        scrap_quantity: Number(form.scrap_quantity) || undefined,
        warehouse_id: form.warehouse_id || undefined,
        batch_number: form.batch_number || undefined,
        serial_numbers: serialArr,
        remarks: form.remarks || undefined,
      });
      toast.success('Production recorded. Finished goods added to warehouse.');
      navigate('/manufacturing/production');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-4 w-72 rounded" />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 mt-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-4 w-24 rounded" />
              <div className="skeleton h-4 flex-1 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const viewOnly = isEdit; // Production entries are create-only

  return (
    <div>
      <PageHeader
        title={isEdit ? `Production Entry ${entry?.entry_number || ''}` : 'New Production Entry'}
        onBack={() => navigate("/manufacturing/production")}
        actions={
          !isEdit ? [{ label: saving ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, disabled: saving, shortcut: 'Ctrl+Enter' }] : []
        }
      />

      {/* WO Progress Card */}
      {selectedWo && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-blue-900">Work Order Progress</h3>
            <Link to={`/manufacturing/work-orders/${selectedWo.id}`}
              className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-mono">
              {selectedWo.work_order_number}
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-blue-600 text-xs mb-1">Product</div>
              <div className="font-medium text-blue-900">
                <span className="font-mono text-xs">{selectedWo.product_code}</span> {selectedWo.product_name}
              </div>
            </div>
            <div>
              <div className="text-blue-600 text-xs mb-1">Planned</div>
              <div className="font-medium text-blue-900">{selectedWo.planned_quantity} {selectedWo.uom_symbol}</div>
            </div>
            <div>
              <div className="text-blue-600 text-xs mb-1">Already Completed</div>
              <div className="font-medium text-blue-900">{selectedWo.completed_quantity} {selectedWo.uom_symbol}</div>
            </div>
            <div>
              <div className="text-blue-600 text-xs mb-1">Remaining</div>
              <div className="font-semibold text-blue-900">
                {Math.max(0, selectedWo.planned_quantity - selectedWo.completed_quantity)} {selectedWo.uom_symbol}
              </div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            {(() => {
              const pct = selectedWo.planned_quantity > 0 ? Math.min((selectedWo.completed_quantity / selectedWo.planned_quantity) * 100, 100) : 0;
              return (
                <div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-blue-600'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-right text-xs text-blue-600 mt-1">{pct.toFixed(1)}% complete</div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Production Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Work Order search */}
          <FormField label="Work Order" required>
            {viewOnly ? (
              <Link to={`/manufacturing/work-orders/${entry?.work_order_id}`}
                className="text-sm text-brand-600 hover:underline py-2 block font-mono">
                {entry?.work_order_number}
              </Link>
            ) : (
              <div className="relative">
                <Input
                  value={selectedWo ? `${selectedWo.work_order_number} — ${selectedWo.product_name}` : woSearch}
                  onChange={(e) => { setWoSearch(e.target.value); setSelectedWo(null); setShowWoDropdown(true); setForm((f) => ({ ...f, work_order_id: '' })); }}
                  onFocus={() => setShowWoDropdown(true)}
                  placeholder="Search work orders (material_issued / in_progress)..."
                />
                {showWoDropdown && woResults.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                    {woResults.map((wo) => (
                      <button key={wo.id} type="button" onClick={() => selectWo(wo)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs border-b border-gray-50 last:border-0">
                        <span className="font-mono font-medium">{wo.work_order_number}</span>
                        <span className="ml-2 text-gray-700">{wo.product_name}</span>
                        <span className="ml-2 text-gray-400">({wo.status})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FormField>

          <FormField label="Entry Date" required>
            <Input type="date" value={form.entry_date}
              onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))} disabled={viewOnly} />
          </FormField>

          <FormField label="Quantity Produced" required>
            <div className="flex gap-2">
              <Input type="number" value={form.quantity_produced}
                onChange={(e) => setForm((f) => ({ ...f, quantity_produced: e.target.value }))}
                disabled={viewOnly} min={0} className="flex-1" />
              <span className="flex items-center text-sm text-gray-500 min-w-[40px]">
                {selectedWo?.uom_symbol || entry?.uom_symbol || 'UOM'}
              </span>
            </div>
          </FormField>

          <FormField label="Scrap Quantity">
            <Input type="number" value={form.scrap_quantity}
              onChange={(e) => setForm((f) => ({ ...f, scrap_quantity: e.target.value }))}
              disabled={viewOnly} min={0} />
          </FormField>

          <FormField label="Target Warehouse">
            {viewOnly ? (
              <div className="text-sm py-2">{entry?.warehouse_name || '—'}</div>
            ) : (
              <select
                value={form.warehouse_id}
                onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
                className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="">Auto (from WO target warehouse)</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Batch Number">
            <Input value={form.batch_number}
              onChange={(e) => setForm((f) => ({ ...f, batch_number: e.target.value }))}
              disabled={viewOnly} placeholder="Batch # for finished goods" />
          </FormField>

          <FormField label="Serial Numbers" className="md:col-span-2">
            <Input value={form.serial_numbers}
              onChange={(e) => setForm((f) => ({ ...f, serial_numbers: e.target.value }))}
              disabled={viewOnly} placeholder="Comma-separated serial numbers (optional)" />
          </FormField>
        </div>

        <FormField label="Remarks" className="mt-4">
          <Textarea value={form.remarks}
            onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            rows={3} disabled={viewOnly} placeholder="Production notes..." />
        </FormField>
      </div>

      {/* View-only cost info */}
      {isEdit && entry && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Cost Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-500 text-xs mb-1">Unit Cost</div>
              <div className="font-medium">{formatCurrency(entry.unit_cost)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Total Cost</div>
              <div className="font-semibold">{formatCurrency(entry.total_cost)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Qty Produced</div>
              <div className="font-medium">{entry.quantity_produced} {entry.uom_symbol}</div>
            </div>
            {entry.scrap_quantity > 0 && (
              <div>
                <div className="text-gray-500 text-xs mb-1">Scrap</div>
                <div className="font-medium text-red-600">{entry.scrap_quantity} {entry.uom_symbol}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}