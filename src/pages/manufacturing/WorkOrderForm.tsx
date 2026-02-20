// src/pages/manufacturing/WorkOrderForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { workOrdersApi, WorkOrder, WorkOrderDetail, WorkOrderMaterial, MaterialIssueLine, MaterialConsumeLine, MaterialReturnLine } from '@/api/modules/work-orders.api';
import { productsApi, Product } from '@/api/modules/products.api';
import { bomsApi, Bom } from '@/api/modules/boms.api';
import { settingsApi, Warehouse } from '@/api/modules/settings.api';
import { salesOrdersApi, SalesOrder } from '@/api/modules/sales-orders.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { PRIORITY_CONFIG } from '@/lib/constants';
import type { StatusConfig } from '@/lib/constants';

const WORK_ORDER_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  material_issued: { label: 'Material Issued', color: 'purple' },
  in_progress: { label: 'In Progress', color: 'orange' },
  completed: { label: 'Completed', color: 'green' },
  closed: { label: 'Closed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

// ─── Material Modal Types ───────────────────────────────────────
type ModalType = 'issue' | 'consume' | 'return' | null;

interface ModalLine {
  material_id: string;
  component_name: string;
  max: number;
  quantity: number;
  wastage?: number;
  batch_id?: string;
}

export function WorkOrderForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [wo, setWo] = useState<WorkOrderDetail | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionConfirm, setActionConfirm] = useState<{ action: string; title: string; message: string } | null>(null);

  const [form, setForm] = useState({
    work_order_date: new Date().toISOString().slice(0, 10),
    product_id: '',
    bom_header_id: '',
    planned_quantity: '' as string | number,
    uom_id: '',
    uom_symbol: '',
    planned_start_date: '',
    planned_end_date: '',
    source_warehouse_id: '',
    target_warehouse_id: '',
    sales_order_id: '',
    priority: 'normal' as WorkOrder['priority'],
    internal_notes: '',
  });

  // Search dropdowns state
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const debouncedProductSearch = useDebounce(productSearch, 300);

  const [bomOptions, setBomOptions] = useState<Bom[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [soSearch, setSoSearch] = useState('');
  const [soResults, setSoResults] = useState<SalesOrder[]>([]);
  const [selectedSo, setSelectedSo] = useState<SalesOrder | null>(null);
  const [showSoDropdown, setShowSoDropdown] = useState(false);
  const debouncedSoSearch = useDebounce(soSearch, 300);

  // Modal state
  const [modalType, setModalType] = useState<ModalType>(null);
  const [modalLines, setModalLines] = useState<ModalLine[]>([]);
  const [modalSaving, setModalSaving] = useState(false);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly && !modalType) handleSave(); },
    'escape': () => {
      if (modalType) { setModalType(null); return; }
      navigate('/manufacturing/work-orders');
    },
  });

  // Load data
  useEffect(() => { if (isEdit) loadWO(); }, [id]);
  useEffect(() => { loadWarehouses(); }, []);

  async function loadWO() {
    setLoading(true);
    try {
      const res = await workOrdersApi.getById(id!);
      const data = res.data;
      setWo(data);
      setStatus(data.status);
      setForm({
        work_order_date: data.work_order_date || '',
        product_id: data.product_id || '',
        bom_header_id: data.bom_header_id || '',
        planned_quantity: data.planned_quantity || '',
        uom_id: data.uom_id || '',
        uom_symbol: data.uom_symbol || '',
        planned_start_date: data.planned_start_date || '',
        planned_end_date: data.planned_end_date || '',
        source_warehouse_id: data.source_warehouse_id || '',
        target_warehouse_id: data.target_warehouse_id || '',
        sales_order_id: data.sales_order_id || '',
        priority: (data.priority || 'normal') as WorkOrder['priority'],
        internal_notes: data.internal_notes || '',
      });
      if (data.product_name) {
        setProductSearch(data.product_name);
        setSelectedProduct({ id: data.product_id, name: data.product_name, product_code: data.product_code } as Product);
        // Load BOMs for this product
        loadBoms(data.product_id);
      }
      if (data.sales_order_number) {
        setSoSearch(data.sales_order_number);
        setSelectedSo({ id: data.sales_order_id, order_number: data.sales_order_number } as SalesOrder);
      }
    } catch (err: any) {
      toast.error(err.message);
      navigate('/manufacturing/work-orders');
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

  async function loadBoms(productId: string) {
    try {
      const res = await bomsApi.list({ product_id: productId, status: 'active' });
      setBomOptions(res.data || []);
    } catch { setBomOptions([]); }
  }

  // Product search
  useEffect(() => {
    if (debouncedProductSearch?.length >= 2 && !selectedProduct)
      productsApi.list({ search: debouncedProductSearch, limit: 10, status: 'active' })
        .then((r) => setProductResults(r.data || [])).catch(() => {});
    else setProductResults([]);
  }, [debouncedProductSearch]);

  // SO search
  useEffect(() => {
    if (debouncedSoSearch?.length >= 2 && !selectedSo)
      salesOrdersApi.list({ search: debouncedSoSearch, limit: 10 })
        .then((r) => setSoResults(r.data || [])).catch(() => {});
    else setSoResults([]);
  }, [debouncedSoSearch]);

  function selectProduct(p: Product) {
    setSelectedProduct(p);
    setProductSearch(p.name);
    setShowProductDropdown(false);
    setForm((f) => ({
      ...f,
      product_id: p.id,
      uom_id: p.primary_uom_id || '',
      uom_symbol: p.uom_code || p.uom_name || '',
      bom_header_id: '', // reset BOM selection
    }));
    loadBoms(p.id);
  }

  function selectSo(so: SalesOrder) {
    setSelectedSo(so);
    setSoSearch(so.order_number);
    setShowSoDropdown(false);
    setForm((f) => ({ ...f, sales_order_id: so.id }));
  }

  // Save
  async function handleSave() {
    if (!form.product_id || !form.bom_header_id || !form.planned_quantity || !form.source_warehouse_id || !form.target_warehouse_id) {
      toast.error('Please fill all required fields');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        planned_quantity: Number(form.planned_quantity),
        sales_order_id: form.sales_order_id || undefined,
        planned_start_date: form.planned_start_date || undefined,
        planned_end_date: form.planned_end_date || undefined,
      };
      if (isEdit) {
        await workOrdersApi.update(id!, payload);
        toast.success('Work order updated');
        loadWO();
      } else {
        const res = await workOrdersApi.create(payload as any);
        toast.success('Work order created. BOM components exploded into materials.');
        navigate(`/manufacturing/work-orders/${res.data.id}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await workOrdersApi.delete(id!);
      toast.success('Work order deleted');
      navigate('/manufacturing/work-orders');
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleAction(action: string) {
    try {
      switch (action) {
        case 'approve': await workOrdersApi.approve(id!); toast.success('Work order approved'); break;
        case 'start': await workOrdersApi.start(id!); toast.success('Production started'); break;
        case 'complete': await workOrdersApi.complete(id!); toast.success('Work order completed'); break;
        case 'close': await workOrdersApi.close(id!); toast.success('Work order closed'); break;
        case 'cancel': await workOrdersApi.cancel(id!); toast.success('Work order cancelled'); break;
      }
      loadWO();
    } catch (err: any) { toast.error(err.message); }
  }

  // ─── Material Modal Helpers ───────────────────────────────────
  function openIssueModal() {
    if (!wo?.materials) return;
    const lines: ModalLine[] = wo.materials
      .filter((m) => m.issued_quantity < m.planned_quantity)
      .map((m) => ({
        material_id: m.id,
        component_name: m.component_type === 'item' ? `${m.item_code} — ${m.item_name}` : `${m.product_code} — ${m.product_name}`,
        max: m.planned_quantity - m.issued_quantity,
        quantity: m.planned_quantity - m.issued_quantity,
      }));
    setModalLines(lines);
    setModalType('issue');
  }

  function openConsumeModal() {
    if (!wo?.materials) return;
    const lines: ModalLine[] = wo.materials
      .filter((m) => m.issued_quantity > 0 && m.consumed_quantity < m.issued_quantity)
      .map((m) => {
        const available = m.issued_quantity - m.consumed_quantity - m.wastage_quantity - m.returned_quantity;
        return {
          material_id: m.id,
          component_name: m.component_type === 'item' ? `${m.item_code} — ${m.item_name}` : `${m.product_code} — ${m.product_name}`,
          max: Math.max(0, available),
          quantity: Math.max(0, available),
          wastage: 0,
        };
      })
      .filter((l) => l.max > 0);
    setModalLines(lines);
    setModalType('consume');
  }

  function openReturnModal() {
    if (!wo?.materials) return;
    const lines: ModalLine[] = wo.materials
      .map((m) => {
        const returnable = m.issued_quantity - m.consumed_quantity - m.wastage_quantity - m.returned_quantity;
        return {
          material_id: m.id,
          component_name: m.component_type === 'item' ? `${m.item_code} — ${m.item_name}` : `${m.product_code} — ${m.product_name}`,
          max: Math.max(0, returnable),
          quantity: 0,
        };
      })
      .filter((l) => l.max > 0);
    setModalLines(lines);
    setModalType('return');
  }

  async function handleModalSubmit() {
    if (!id || !modalType) return;
    const activeLines = modalLines.filter((l) => l.quantity > 0);
    if (activeLines.length === 0) { toast.error('Enter at least one quantity'); return; }

    setModalSaving(true);
    try {
      if (modalType === 'issue') {
        const lines: MaterialIssueLine[] = activeLines.map((l) => ({
          material_id: l.material_id, issue_quantity: l.quantity, batch_id: l.batch_id,
        }));
        await workOrdersApi.issueMaterials(id, lines);
        toast.success('Materials issued. Stock deducted from source warehouse.');
      } else if (modalType === 'consume') {
        const lines: MaterialConsumeLine[] = activeLines.map((l) => ({
          material_id: l.material_id, consumed_quantity: l.quantity, wastage_quantity: l.wastage || undefined,
        }));
        await workOrdersApi.consumeMaterials(id, lines);
        toast.success('Consumption recorded. Variance calculated.');
      } else if (modalType === 'return') {
        const lines: MaterialReturnLine[] = activeLines.map((l) => ({
          material_id: l.material_id, return_quantity: l.quantity, batch_id: l.batch_id,
        }));
        await workOrdersApi.returnMaterials(id, lines);
        toast.success('Materials returned to warehouse.');
      }
      setModalType(null);
      loadWO();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setModalSaving(false);
    }
  }

  // ─── Dynamic Actions ──────────────────────────────────────────
  function getHeaderActions() {
    const actions: any[] = [];

    if (status === 'draft') {
      actions.push({ label: saving ? 'Saving...' : 'Save Draft', variant: 'primary', onClick: handleSave, disabled: saving, shortcut: 'Ctrl+Enter' });
      if (isEdit) {
        actions.push({ label: 'Approve', variant: 'primary', onClick: () => setActionConfirm({ action: 'approve', title: 'Approve Work Order', message: 'Approve this work order? Materials can then be issued.' }) });
        actions.push({ label: 'Delete', variant: 'danger', onClick: () => setDeleteConfirm(true) });
      }
    } else if (status === 'approved') {
      actions.push({ label: 'Issue Materials', variant: 'primary', onClick: openIssueModal });
      actions.push({ label: 'Cancel', variant: 'danger', onClick: () => setActionConfirm({ action: 'cancel', title: 'Cancel Work Order', message: 'Cancel this work order? This cannot be undone.' }) });
    } else if (status === 'material_issued') {
      actions.push({ label: 'Start Production', variant: 'primary', onClick: () => setActionConfirm({ action: 'start', title: 'Start Production', message: 'Start production? This will set the actual start date.' }) });
      actions.push({ label: 'Consume Materials', variant: 'primary', onClick: openConsumeModal });
      actions.push({ label: 'Return Materials', variant: 'secondary', onClick: openReturnModal });
      actions.push({ label: 'Record Production', variant: 'secondary', onClick: () => navigate(`/manufacturing/production/new?wo=${id}`) });
    } else if (status === 'in_progress') {
      actions.push({ label: 'Complete', variant: 'primary', onClick: () => setActionConfirm({ action: 'complete', title: 'Complete Work Order', message: 'Mark this work order as completed?' }) });
      actions.push({ label: 'Consume Materials', variant: 'primary', onClick: openConsumeModal });
      actions.push({ label: 'Return Materials', variant: 'secondary', onClick: openReturnModal });
      actions.push({ label: 'Record Production', variant: 'secondary', onClick: () => navigate(`/manufacturing/production/new?wo=${id}`) });
      actions.push({ label: 'Record Scrap', variant: 'danger', onClick: () => navigate(`/manufacturing/scrap/new?wo=${id}`) });
    } else if (status === 'completed') {
      actions.push({ label: 'Close', variant: 'primary', onClick: () => setActionConfirm({ action: 'close', title: 'Close Work Order', message: 'Close this work order? No further modifications allowed.' }) });
      actions.push({ label: 'Return Materials', variant: 'secondary', onClick: openReturnModal });
      actions.push({ label: 'Record Scrap', variant: 'danger', onClick: () => navigate(`/manufacturing/scrap/new?wo=${id}`) });
    }

    return actions;
  }

  // ─── Variance Color ───────────────────────────────────────────
  function varianceColor(v: number | null): string {
    if (v === null || v === 0) return 'text-gray-400';
    return v < 0 ? 'text-green-600' : 'text-red-600';
  }

  // ─── Loading Skeleton ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-4 w-72 rounded" />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 mt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-4 w-24 rounded" />
              <div className="skeleton h-4 flex-1 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isEdit ? `Work Order ${wo?.work_order_number || ''}` : 'New Work Order'}
        subtitle={isEdit ? WORK_ORDER_STATUSES[status]?.label || status : undefined}
        onBack={() => navigate("/manufacturing/work-orders")}
        actions={getHeaderActions()}
      />

      {/* Header Fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Work Order Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Work Order Date" required>
            <Input type="date" value={form.work_order_date}
              onChange={(e) => setForm((f) => ({ ...f, work_order_date: e.target.value }))} disabled={readonly} />
          </FormField>

          {/* Product search dropdown */}
          <FormField label="Product" required>
            {readonly ? (
              <div className="text-sm py-2">
                <span className="font-mono text-xs text-gray-500">{wo?.product_code}</span>
                <span className="ml-2">{wo?.product_name}</span>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={selectedProduct ? `${selectedProduct.product_code} — ${selectedProduct.name}` : productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setSelectedProduct(null); setShowProductDropdown(true); }}
                  onFocus={() => setShowProductDropdown(true)}
                  placeholder="Search products..."
                />
                {showProductDropdown && productResults.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                    {productResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => selectProduct(p)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs border-b border-gray-50 last:border-0">
                        <span className="font-mono font-medium">{p.product_code}</span>
                        <span className="ml-2">{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FormField>

          {/* BOM dropdown */}
          <FormField label="Bill of Materials" required>
            {readonly ? (
              <div className="text-sm py-2">{wo?.bom_name} (v{wo?.bom_version})</div>
            ) : (
              <Select
                value={form.bom_header_id}
                onChange={(e) => setForm((f) => ({ ...f, bom_header_id: e.target.value }))}
                options={bomOptions.map((b) => ({ value: b.id, label: `${b.bom_code} (v${b.bom_version})` }))}
                placeholder={bomOptions.length === 0 ? 'Select a product first' : 'Select BOM...'}
                disabled={bomOptions.length === 0}
              />
            )}
          </FormField>

          <FormField label="Planned Quantity" required>
            <div className="flex gap-2">
              <Input type="number" value={form.planned_quantity}
                onChange={(e) => setForm((f) => ({ ...f, planned_quantity: e.target.value }))}
                disabled={readonly} min={0} className="flex-1" />
              <span className="flex items-center text-sm text-gray-500 min-w-[40px]">{form.uom_symbol || 'UOM'}</span>
            </div>
          </FormField>

          <FormField label="Planned Start Date">
            <Input type="date" value={form.planned_start_date}
              onChange={(e) => setForm((f) => ({ ...f, planned_start_date: e.target.value }))} disabled={readonly} />
          </FormField>

          <FormField label="Planned End Date">
            <Input type="date" value={form.planned_end_date}
              onChange={(e) => setForm((f) => ({ ...f, planned_end_date: e.target.value }))} disabled={readonly} />
          </FormField>

          <FormField label="Source Warehouse" required>
            <Select value={form.source_warehouse_id}
              onChange={(e) => setForm((f) => ({ ...f, source_warehouse_id: e.target.value }))}
              options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
              placeholder="Where raw materials come from" disabled={readonly} />
          </FormField>

          <FormField label="Target Warehouse" required>
            <Select value={form.target_warehouse_id}
              onChange={(e) => setForm((f) => ({ ...f, target_warehouse_id: e.target.value }))}
              options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
              placeholder="Where finished goods go" disabled={readonly} />
          </FormField>

          {/* Sales Order search */}
          <FormField label="Sales Order (optional)">
            {readonly ? (
              wo?.sales_order_number ? (
                <Link to={`/sales/orders/${wo.sales_order_id}`} className="text-sm text-brand-600 hover:underline py-2 block">
                  {wo.sales_order_number}
                </Link>
              ) : <div className="text-sm text-gray-400 py-2">—</div>
            ) : (
              <div className="relative">
                <Input
                  value={selectedSo ? selectedSo.order_number : soSearch}
                  onChange={(e) => { setSoSearch(e.target.value); setSelectedSo(null); setShowSoDropdown(true); setForm((f) => ({ ...f, sales_order_id: '' })); }}
                  onFocus={() => setShowSoDropdown(true)}
                  placeholder="Link to sales order..."
                />
                {selectedSo && (
                  <button onClick={() => { setSelectedSo(null); setSoSearch(''); setForm((f) => ({ ...f, sales_order_id: '' })); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
                )}
                {showSoDropdown && soResults.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                    {soResults.map((so) => (
                      <button key={so.id} type="button" onClick={() => selectSo(so)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs border-b border-gray-50 last:border-0">
                        <span className="font-mono font-medium">{so.order_number}</span>
                        {so.customer && <span className="ml-2 text-gray-500">{so.customer.name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FormField>

          <FormField label="Priority">
            <Select value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as WorkOrder['priority'] }))}
              options={PRIORITY_OPTIONS} disabled={readonly} />
          </FormField>
        </div>

        {/* Actual dates (read-only, for started/completed WOs) */}
        {wo && (wo.actual_start_date || wo.actual_end_date) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
            {wo.actual_start_date && (
              <FormField label="Actual Start Date">
                <div className="text-sm py-2 text-gray-700">{formatDate(wo.actual_start_date)}</div>
              </FormField>
            )}
            {wo.actual_end_date && (
              <FormField label="Actual End Date">
                <div className="text-sm py-2 text-gray-700">{formatDate(wo.actual_end_date)}</div>
              </FormField>
            )}
          </div>
        )}

        <FormField label="Internal Notes" className="mt-4">
          <Textarea value={form.internal_notes}
            onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
            rows={3} disabled={readonly} placeholder="Notes for internal reference..." />
        </FormField>
      </div>

      {/* Materials Table (visible on edit with materials) */}
      {wo?.materials && wo.materials.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">BOM Materials — Planned vs Actual</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 w-8 text-gray-500 font-medium">#</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Component</th>
                  <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Planned</th>
                  <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Issued</th>
                  <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Consumed</th>
                  <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Returned</th>
                  <th className="text-right py-2 px-2 w-20 text-gray-500 font-medium">Wastage</th>
                  <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Variance</th>
                  <th className="text-left py-2 px-2 w-14 text-gray-500 font-medium">UOM</th>
                  <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Unit Cost</th>
                  <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {wo.materials.map((m) => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 px-2 text-xs text-gray-400">{m.line_number}</td>
                    <td className="py-2 px-2">
                      <div className="text-xs">
                        <span className="font-mono font-medium text-gray-700">
                          {m.component_type === 'item' ? m.item_code : m.product_code}
                        </span>
                        <span className="ml-1.5 text-gray-600">
                          {m.component_type === 'item' ? m.item_name : m.product_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right text-xs font-medium">{m.planned_quantity}</td>
                    <td className={`py-2 px-2 text-right text-xs font-medium ${m.issued_quantity > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {m.issued_quantity}
                    </td>
                    <td className={`py-2 px-2 text-right text-xs font-medium ${m.consumed_quantity > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                      {m.consumed_quantity}
                    </td>
                    <td className={`py-2 px-2 text-right text-xs font-medium ${m.returned_quantity > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                      {m.returned_quantity}
                    </td>
                    <td className={`py-2 px-2 text-right text-xs font-medium ${m.wastage_quantity > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {m.wastage_quantity}
                    </td>
                    <td className={`py-2 px-2 text-right text-xs font-medium ${varianceColor(m.variance_quantity)}`}>
                      {m.variance_quantity != null ? (
                        <>
                          {m.variance_quantity > 0 ? '+' : ''}{m.variance_quantity}
                          {m.variance_pct != null && (
                            <span className="text-[10px] ml-0.5">({m.variance_pct > 0 ? '+' : ''}{m.variance_pct.toFixed(1)}%)</span>
                          )}
                        </>
                      ) : '—'}
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500">{m.uom_symbol}</td>
                    <td className="py-2 px-2 text-right text-xs"><AmountDisplay value={m.unit_cost} compact /></td>
                    <td className="py-2 px-2 text-right text-xs"><AmountDisplay value={m.total_cost} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cost Summary & Progress */}
      {wo && isEdit && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Cost Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Cost Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Planned Cost</span>
                <span className="font-medium">{formatCurrency(wo.planned_cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Actual Cost</span>
                <span className="font-medium">{wo.actual_cost != null ? formatCurrency(wo.actual_cost) : '—'}</span>
              </div>
              {wo.planned_cost != null && wo.actual_cost != null && (
                <div className="flex justify-between pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Variance</span>
                  <span className={`font-semibold ${(wo.actual_cost - wo.planned_cost) <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(wo.actual_cost - wo.planned_cost)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Completion Progress */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Completion Progress</h3>
            {(() => {
              const pct = wo.planned_quantity > 0 ? Math.min((wo.completed_quantity / wo.planned_quantity) * 100, 100) : 0;
              return (
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Completed</span>
                    <span className="font-semibold">{wo.completed_quantity} / {wo.planned_quantity} {wo.uom_symbol}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
                    <div className={`h-3 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-blue-500' : 'bg-gray-300'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-right text-sm font-medium text-gray-600">{pct.toFixed(1)}%</div>
                  {wo.scrap_quantity > 0 && (
                    <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-100">
                      <span className="text-gray-500">Scrap</span>
                      <span className="text-red-600 font-medium">{wo.scrap_quantity} {wo.uom_symbol}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ─── Material Operation Modal ────────────────────────────── */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalType === 'issue' && 'Issue Materials'}
                {modalType === 'consume' && 'Consume Materials'}
                {modalType === 'return' && 'Return Materials'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {modalType === 'issue' && 'Deduct raw materials from source warehouse'}
                {modalType === 'consume' && 'Record actual material consumption'}
                {modalType === 'return' && 'Return unused materials to source warehouse'}
              </p>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {modalLines.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No materials available for this action.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 text-gray-500 font-medium">Component</th>
                      <th className="text-right py-2 w-20 text-gray-500 font-medium">Max</th>
                      <th className="text-right py-2 w-28 text-gray-500 font-medium">
                        {modalType === 'issue' ? 'Issue Qty' : modalType === 'consume' ? 'Consume Qty' : 'Return Qty'}
                      </th>
                      {modalType === 'consume' && (
                        <th className="text-right py-2 w-24 text-gray-500 font-medium">Wastage</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {modalLines.map((line, idx) => (
                      <tr key={line.material_id} className="border-b border-gray-50">
                        <td className="py-2 text-xs text-gray-700">{line.component_name}</td>
                        <td className="py-2 text-right text-xs text-gray-500">{line.max}</td>
                        <td className="py-2">
                          <Input type="number" value={line.quantity}
                            onChange={(e) => {
                              const val = Math.min(parseFloat(e.target.value) || 0, line.max);
                              setModalLines((prev) => prev.map((l, i) => i === idx ? { ...l, quantity: val } : l));
                            }}
                            min={0} max={line.max} className="!py-1 !text-xs h-8 text-right" />
                        </td>
                        {modalType === 'consume' && (
                          <td className="py-2">
                            <Input type="number" value={line.wastage || 0}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setModalLines((prev) => prev.map((l, i) => i === idx ? { ...l, wastage: val } : l));
                              }}
                              min={0} className="!py-1 !text-xs h-8 text-right" />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setModalType(null)} disabled={modalSaving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                Cancel
              </button>
              <button onClick={handleModalSubmit} disabled={modalSaving || modalLines.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition disabled:opacity-50">
                {modalSaving ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={deleteConfirm} title="Delete Work Order" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
      {actionConfirm && (
        <ConfirmDialog open={true} title={actionConfirm.title} message={actionConfirm.message}
          confirmLabel={actionConfirm.title.replace('Work Order', '').trim()} onConfirm={() => { const a = actionConfirm.action; setActionConfirm(null); handleAction(a); }} onCancel={() => setActionConfirm(null)} />
      )}
    </div>
  );
}