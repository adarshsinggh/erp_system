// src/pages/manufacturing/ScrapEntryForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { scrapEntriesApi, ScrapEntry } from '@/api/modules/scrap-entries.api';
import { workOrdersApi, WorkOrder } from '@/api/modules/work-orders.api';
import { itemsApi, Item } from '@/api/modules/items.api';
import { productsApi, Product } from '@/api/modules/products.api';
import { settingsApi, Warehouse } from '@/api/modules/settings.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import { formatDate, formatCurrency } from '@/lib/formatters';
import type { StatusConfig } from '@/lib/constants';

const SCRAP_REASONS: Record<string, StatusConfig> = {
  defective: { label: 'Defective', color: 'red' },
  damaged: { label: 'Damaged', color: 'orange' },
  expired: { label: 'Expired', color: 'yellow' },
  process_waste: { label: 'Process Waste', color: 'gray' },
};

const DISPOSAL_METHODS: Record<string, StatusConfig> = {
  sell: { label: 'Sell', color: 'green' },
  recycle: { label: 'Recycle', color: 'blue' },
  discard: { label: 'Discard', color: 'gray' },
};

const SCRAP_STATUSES: Record<string, StatusConfig> = {
  recorded: { label: 'Recorded', color: 'blue' },
  disposed: { label: 'Disposed', color: 'green' },
};

const SCRAP_REASON_OPTIONS = [
  { value: 'defective', label: 'Defective' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'process_waste', label: 'Process Waste' },
];

const DISPOSAL_OPTIONS = [
  { value: 'sell', label: 'Sell' },
  { value: 'recycle', label: 'Recycle' },
  { value: 'discard', label: 'Discard' },
];

export function ScrapEntryForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [entry, setEntry] = useState<ScrapEntry | null>(null);
  const [disposeConfirm, setDisposeConfirm] = useState(false);
  const [disposalChoice, setDisposalChoice] = useState('sell');

  const [componentType, setComponentType] = useState<'item' | 'product'>('item');

  const [form, setForm] = useState({
    scrap_date: new Date().toISOString().slice(0, 10),
    work_order_id: '',
    item_id: '',
    product_id: '',
    quantity: '' as string | number,
    uom_id: '',
    uom_symbol: '',
    scrap_reason: 'defective' as ScrapEntry['scrap_reason'],
    reason_detail: '',
    scrap_value: '' as string | number,
    disposal_method: '',
    warehouse_id: '',
  });

  // WO search
  const [woSearch, setWoSearch] = useState('');
  const [woResults, setWoResults] = useState<WorkOrder[]>([]);
  const [showWoDropdown, setShowWoDropdown] = useState(false);
  const [selectedWoName, setSelectedWoName] = useState('');
  const debouncedWoSearch = useDebounce(woSearch, 300);

  // Item search
  const [itemSearch, setItemSearch] = useState('');
  const [itemResults, setItemResults] = useState<Item[]>([]);
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [selectedItemName, setSelectedItemName] = useState('');
  const debouncedItemSearch = useDebounce(itemSearch, 300);

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState('');
  const debouncedProductSearch = useDebounce(productSearch, 300);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!isEdit) handleSave(); },
    'escape': () => navigate('/manufacturing/scrap'),
  });

  useEffect(() => { loadWarehouses(); }, []);
  useEffect(() => { if (isEdit) loadEntry(); }, [id]);

  // Pre-fill from WO
  useEffect(() => {
    const woId = searchParams.get('wo');
    if (woId && !isEdit) {
      setForm((f) => ({ ...f, work_order_id: woId }));
      workOrdersApi.getById(woId).then((res) => {
        setSelectedWoName(res.data.work_order_number);
        setWoSearch(res.data.work_order_number);
      }).catch(() => {});
    }
  }, [searchParams]);

  async function loadEntry() {
    setLoading(true);
    try {
      const res = await scrapEntriesApi.getById(id!);
      const data = res.data;
      setEntry(data);
      setComponentType(data.item_id ? 'item' : 'product');
      setForm({
        scrap_date: data.scrap_date || '',
        work_order_id: data.work_order_id || '',
        item_id: data.item_id || '',
        product_id: data.product_id || '',
        quantity: data.quantity || '',
        uom_id: data.uom_id || '',
        uom_symbol: data.uom_symbol || '',
        scrap_reason: (data.scrap_reason || 'defective') as ScrapEntry['scrap_reason'],
        reason_detail: data.reason_detail || '',
        scrap_value: data.scrap_value || '',
        disposal_method: data.disposal_method || '',
        warehouse_id: data.warehouse_id || '',
      });
      if (data.work_order_number) { setWoSearch(data.work_order_number); setSelectedWoName(data.work_order_number); }
      if (data.item_id) { setSelectedItemName(`${data.item_code} — ${data.item_name}`); }
      if (data.product_id) { setSelectedProductName(`${data.product_code} — ${data.product_name}`); }
    } catch (err: any) {
      toast.error(err.message);
      navigate('/manufacturing/scrap');
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

  // Search effects
  useEffect(() => {
    if (debouncedWoSearch?.length >= 2 && !selectedWoName)
      workOrdersApi.list({ search: debouncedWoSearch, limit: 10 })
        .then((r) => setWoResults(r.data || [])).catch(() => {});
    else setWoResults([]);
  }, [debouncedWoSearch]);

  useEffect(() => {
    if (debouncedItemSearch?.length >= 2 && !selectedItemName)
      itemsApi.list({ search: debouncedItemSearch, limit: 10, status: 'active' })
        .then((r) => setItemResults(r.data || [])).catch(() => {});
    else setItemResults([]);
  }, [debouncedItemSearch]);

  useEffect(() => {
    if (debouncedProductSearch?.length >= 2 && !selectedProductName)
      productsApi.list({ search: debouncedProductSearch, limit: 10, status: 'active' })
        .then((r) => setProductResults(r.data || [])).catch(() => {});
    else setProductResults([]);
  }, [debouncedProductSearch]);

  function selectItem(item: Item) {
    setSelectedItemName(`${item.item_code} — ${item.name}`);
    setShowItemDropdown(false);
    setItemSearch('');
    setForm((f) => ({
      ...f, item_id: item.id, product_id: '',
      uom_id: item.primary_uom_id || '', uom_symbol: item.uom_code || item.uom_name || '',
    }));
  }

  function selectProduct(p: Product) {
    setSelectedProductName(`${p.product_code} — ${p.name}`);
    setShowProductDropdown(false);
    setProductSearch('');
    setForm((f) => ({
      ...f, product_id: p.id, item_id: '',
      uom_id: p.primary_uom_id || '', uom_symbol: p.uom_code || p.uom_name || '',
    }));
  }

  async function handleSave() {
    if (!form.quantity || !form.scrap_reason || !form.warehouse_id) {
      toast.error('Quantity, Scrap Reason, and Warehouse are required');
      return;
    }
    if (!form.item_id && !form.product_id) {
      toast.error('Select an Item or Product');
      return;
    }
    setSaving(true);
    try {
      await scrapEntriesApi.create({
        scrap_date: form.scrap_date,
        item_id: componentType === 'item' ? form.item_id : undefined,
        product_id: componentType === 'product' ? form.product_id : undefined,
        quantity: Number(form.quantity),
        uom_id: form.uom_id,
        scrap_reason: form.scrap_reason,
        warehouse_id: form.warehouse_id,
        work_order_id: form.work_order_id || undefined,
        reason_detail: form.reason_detail || undefined,
        scrap_value: form.scrap_value ? Number(form.scrap_value) : undefined,
        disposal_method: form.disposal_method || undefined,
      });
      toast.success('Scrap recorded. Stock deducted from warehouse.');
      navigate('/manufacturing/scrap');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDispose() {
    if (!id || !disposalChoice) return;
    try {
      await scrapEntriesApi.dispose(id, disposalChoice);
      toast.success('Scrap entry marked as disposed');
      loadEntry();
    } catch (err: any) { toast.error(err.message); }
    setDisposeConfirm(false);
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

  const viewOnly = isEdit;
  const canDispose = isEdit && entry?.status === 'recorded' && !entry?.disposal_method;

  return (
    <div>
      <PageHeader
        title={isEdit ? `Scrap Entry ${entry?.scrap_number || ''}` : 'New Scrap Entry'}
        subtitle={isEdit && entry ? SCRAP_STATUSES[entry.status]?.label || entry.status : undefined}
        onBack={() => navigate("/manufacturing/scrap")}
        actions={[
          ...(!isEdit ? [{ label: saving ? 'Saving...' : 'Save', variant: 'primary' as const, onClick: handleSave, disabled: saving, shortcut: 'Ctrl+Enter' }] : []),
          ...(canDispose ? [{ label: 'Mark as Disposed', variant: 'primary' as const, onClick: () => setDisposeConfirm(true) }] : []),
        ]}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Scrap Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Scrap Date" required>
            <Input type="date" value={form.scrap_date}
              onChange={(e) => setForm((f) => ({ ...f, scrap_date: e.target.value }))} disabled={viewOnly} />
          </FormField>

          {/* Work Order (optional) */}
          <FormField label="Work Order (optional)">
            {viewOnly ? (
              entry?.work_order_number ? (
                <Link to={`/manufacturing/work-orders/${entry.work_order_id}`}
                  className="text-sm text-brand-600 hover:underline py-2 block font-mono">
                  {entry.work_order_number}
                </Link>
              ) : <div className="text-sm text-gray-400 py-2">—</div>
            ) : (
              <div className="relative">
                <Input
                  value={selectedWoName || woSearch}
                  onChange={(e) => { setWoSearch(e.target.value); setSelectedWoName(''); setShowWoDropdown(true); setForm((f) => ({ ...f, work_order_id: '' })); }}
                  onFocus={() => setShowWoDropdown(true)}
                  placeholder="Link to work order..."
                />
                {selectedWoName && (
                  <button onClick={() => { setSelectedWoName(''); setWoSearch(''); setForm((f) => ({ ...f, work_order_id: '' })); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
                )}
                {showWoDropdown && woResults.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                    {woResults.map((wo) => (
                      <button key={wo.id} type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, work_order_id: wo.id }));
                          setSelectedWoName(wo.work_order_number);
                          setShowWoDropdown(false); setWoSearch('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs border-b border-gray-50 last:border-0">
                        <span className="font-mono font-medium">{wo.work_order_number}</span>
                        <span className="ml-2 text-gray-500">{wo.product_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FormField>

          <FormField label="Warehouse" required>
            {viewOnly ? (
              <div className="text-sm py-2">{entry?.warehouse_name || '—'}</div>
            ) : (
              <Select value={form.warehouse_id}
                onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
                options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
                placeholder="Select warehouse..." />
            )}
          </FormField>
        </div>

        {/* Component type toggle + search */}
        <div className="mt-4 mb-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Scrap Type</label>
          {viewOnly ? (
            <div className="text-sm py-1">
              {entry?.item_id ? (
                <span><span className="font-mono text-xs text-gray-500">{entry.item_code}</span> {entry.item_name}</span>
              ) : (
                <span><span className="font-mono text-xs text-gray-500">{entry?.product_code}</span> {entry?.product_name}</span>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="componentType" value="item" checked={componentType === 'item'}
                    onChange={() => { setComponentType('item'); setForm((f) => ({ ...f, product_id: '', item_id: '' })); setSelectedProductName(''); setSelectedItemName(''); }}
                    className="text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm">Raw Material / Component</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="componentType" value="product" checked={componentType === 'product'}
                    onChange={() => { setComponentType('product'); setForm((f) => ({ ...f, item_id: '', product_id: '' })); setSelectedItemName(''); setSelectedProductName(''); }}
                    className="text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm">Finished / Semi-Finished</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {componentType === 'item' ? (
                  <FormField label="Item" required>
                    <div className="relative">
                      <Input
                        value={selectedItemName || itemSearch}
                        onChange={(e) => { setItemSearch(e.target.value); setSelectedItemName(''); setShowItemDropdown(true); }}
                        onFocus={() => setShowItemDropdown(true)}
                        placeholder="Search items..."
                      />
                      {selectedItemName && (
                        <button onClick={() => { setSelectedItemName(''); setItemSearch(''); setForm((f) => ({ ...f, item_id: '', uom_id: '', uom_symbol: '' })); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
                      )}
                      {showItemDropdown && itemResults.length > 0 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                          {itemResults.map((it) => (
                            <button key={it.id} type="button" onClick={() => selectItem(it)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs border-b border-gray-50 last:border-0">
                              <span className="font-mono font-medium">{it.item_code}</span>
                              <span className="ml-2">{it.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormField>
                ) : (
                  <FormField label="Product" required>
                    <div className="relative">
                      <Input
                        value={selectedProductName || productSearch}
                        onChange={(e) => { setProductSearch(e.target.value); setSelectedProductName(''); setShowProductDropdown(true); }}
                        onFocus={() => setShowProductDropdown(true)}
                        placeholder="Search products..."
                      />
                      {selectedProductName && (
                        <button onClick={() => { setSelectedProductName(''); setProductSearch(''); setForm((f) => ({ ...f, product_id: '', uom_id: '', uom_symbol: '' })); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">×</button>
                      )}
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
                  </FormField>
                )}

                <FormField label="Quantity" required>
                  <div className="flex gap-2">
                    <Input type="number" value={form.quantity}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                      min={0} className="flex-1" />
                    <span className="flex items-center text-sm text-gray-500 min-w-[40px]">{form.uom_symbol || 'UOM'}</span>
                  </div>
                </FormField>

                <FormField label="Scrap Reason" required>
                  <Select value={form.scrap_reason}
                    onChange={(e) => setForm((f) => ({ ...f, scrap_reason: e.target.value as ScrapEntry['scrap_reason'] }))}
                    options={SCRAP_REASON_OPTIONS} />
                </FormField>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Reason Detail">
            <Input value={form.reason_detail}
              onChange={(e) => setForm((f) => ({ ...f, reason_detail: e.target.value }))}
              disabled={viewOnly} placeholder="Additional details..." />
          </FormField>

          <FormField label="Scrap Value (₹)">
            <Input type="number" value={form.scrap_value}
              onChange={(e) => setForm((f) => ({ ...f, scrap_value: e.target.value }))}
              disabled={viewOnly} placeholder="Auto-calculated if blank" min={0} />
          </FormField>

          <FormField label="Disposal Method">
            {viewOnly ? (
              <div className="py-2">
                {entry?.disposal_method
                  ? <StatusBadge status={entry.disposal_method} statusMap={DISPOSAL_METHODS} />
                  : <span className="text-sm text-yellow-600">Pending</span>}
              </div>
            ) : (
              <Select value={form.disposal_method}
                onChange={(e) => setForm((f) => ({ ...f, disposal_method: e.target.value }))}
                options={DISPOSAL_OPTIONS} placeholder="Optional — can set later" />
            )}
          </FormField>
        </div>
      </div>

      {/* View-only summary */}
      {isEdit && entry && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-500 text-xs mb-1">Scrap Value</div>
              <div className="font-medium">{formatCurrency(entry.scrap_value)}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Quantity</div>
              <div className="font-medium">{entry.quantity} {entry.uom_symbol}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Reason</div>
              <StatusBadge status={entry.scrap_reason} statusMap={SCRAP_REASONS} />
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Status</div>
              <StatusBadge status={entry.status} statusMap={SCRAP_STATUSES} />
            </div>
          </div>
        </div>
      )}

      {/* Dispose dialog */}
      {disposeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Mark as Disposed</h2>
            <p className="text-sm text-gray-600 mb-4">Select a disposal method for this scrap entry.</p>
            <Select value={disposalChoice}
              onChange={(e) => setDisposalChoice(e.target.value)}
              options={DISPOSAL_OPTIONS} />
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDisposeConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                Cancel
              </button>
              <button onClick={handleDispose}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition">
                Confirm Disposal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}