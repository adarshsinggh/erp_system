// src/pages/masters/ItemForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { itemsApi, ItemDetail } from '@/api/modules/items.api';
import { mastersApi } from '@/api/modules/masters.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, Textarea, toast } from '@/components/shared/FormElements';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { useKeyboardShortcuts } from '@/hooks';

const ITEM_TYPES = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'component', label: 'Component' },
  { value: 'consumable', label: 'Consumable' },
  { value: 'packing', label: 'Packing' },
];

const COSTING_METHODS = [
  { value: 'weighted_avg', label: 'Weighted Average' },
  { value: 'fifo', label: 'FIFO' },
  { value: 'standard', label: 'Standard Cost' },
];

const GST_RATES = [
  { value: '0', label: '0%' }, { value: '5', label: '5%' },
  { value: '12', label: '12%' }, { value: '18', label: '18%' }, { value: '28', label: '28%' },
];

export function ItemForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  // Dropdown data
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [brands, setBrands] = useState<{ value: string; label: string }[]>([]);
  const [manufacturers, setManufacturers] = useState<{ value: string; label: string }[]>([]);
  const [uoms, setUoms] = useState<{ value: string; label: string }[]>([]);

  // Vendor/alternatives data (read-only display for edit)
  const [vendors, setVendors] = useState<any[]>([]);
  const [alternatives, setAlternatives] = useState<any[]>([]);

  const [form, setForm] = useState({
    item_code: '', name: '', description: '',
    item_type: 'raw_material' as string,
    category_id: '', brand_id: '', manufacturer_id: '',
    primary_uom_id: '', purchase_uom_id: '',
    hsn_code: '', gst_rate: '18',
    purchase_price: '', selling_price: '', standard_cost: '',
    costing_method: 'weighted_avg' as string,
    min_stock_threshold: '', reorder_quantity: '', max_stock_level: '',
    lead_time_days: '',
    batch_tracking: false, serial_tracking: false,
    shelf_life_days: '', weight: '', weight_uom: 'kg',
    tags: '', status: 'active',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/masters/items'),
  });

  useEffect(() => {
    loadDropdowns();
    if (isEdit) loadItem();
  }, [id]);

  async function loadDropdowns() {
    try {
      const [catRes, brandRes, mfgRes, uomRes] = await Promise.all([
        mastersApi.listCategories(), mastersApi.listBrands(),
        mastersApi.listManufacturers(), mastersApi.listUoms(),
      ]);
      setCategories((catRes.data || []).map((c: any) => ({ value: c.id, label: c.name })));
      setBrands((brandRes.data || []).map((b: any) => ({ value: b.id, label: b.name })));
      setManufacturers((mfgRes.data || []).map((m: any) => ({ value: m.id, label: m.name })));
      setUoms((uomRes.data || []).map((u: any) => ({ value: u.id, label: `${u.name} (${u.symbol || u.code})` })));
    } catch (err: any) { toast.error('Failed to load master data'); }
  }

  async function loadItem() {
    setLoading(true);
    try {
      const res = await itemsApi.getById(id!);
      const it = res.data;
      setForm({
        item_code: it.item_code || '', name: it.name || '', description: it.description || '',
        item_type: it.item_type || 'raw_material',
        category_id: it.category_id || '', brand_id: it.brand_id || '', manufacturer_id: it.manufacturer_id || '',
        primary_uom_id: it.primary_uom_id || '', purchase_uom_id: it.purchase_uom_id || '',
        hsn_code: it.hsn_code || '', gst_rate: it.gst_rate != null ? String(it.gst_rate) : '18',
        purchase_price: it.purchase_price ? String(it.purchase_price) : '',
        selling_price: it.selling_price ? String(it.selling_price) : '',
        standard_cost: it.standard_cost ? String(it.standard_cost) : '',
        costing_method: it.costing_method || 'weighted_avg',
        min_stock_threshold: it.min_stock_threshold ? String(it.min_stock_threshold) : '',
        reorder_quantity: it.reorder_quantity ? String(it.reorder_quantity) : '',
        max_stock_level: it.max_stock_level ? String(it.max_stock_level) : '',
        lead_time_days: it.lead_time_days ? String(it.lead_time_days) : '',
        batch_tracking: !!it.batch_tracking, serial_tracking: !!it.serial_tracking,
        shelf_life_days: it.shelf_life_days ? String(it.shelf_life_days) : '',
        weight: it.weight ? String(it.weight) : '', weight_uom: it.weight_uom || 'kg',
        tags: (it.tags || []).join(', '), status: it.status || 'active',
      });
      setVendors(it.vendors || []);
      setAlternatives(it.alternatives || []);
    } catch (err: any) { toast.error(err.message); navigate('/masters/items'); }
    finally { setLoading(false); }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.item_code.trim()) errs.item_code = 'Code is required';
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.primary_uom_id) errs.primary_uom_id = 'UOM is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        gst_rate: form.gst_rate ? parseFloat(form.gst_rate) : 0,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : 0,
        selling_price: form.selling_price ? parseFloat(form.selling_price) : 0,
        standard_cost: form.standard_cost ? parseFloat(form.standard_cost) : 0,
        min_stock_threshold: form.min_stock_threshold ? parseFloat(form.min_stock_threshold) : 0,
        reorder_quantity: form.reorder_quantity ? parseFloat(form.reorder_quantity) : 0,
        max_stock_level: form.max_stock_level ? parseFloat(form.max_stock_level) : 0,
        lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : 0,
        shelf_life_days: form.shelf_life_days ? parseInt(form.shelf_life_days) : null,
        weight: form.weight ? parseFloat(form.weight) : null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        manufacturer_id: form.manufacturer_id || null,
        purchase_uom_id: form.purchase_uom_id || null,
      };
      if (isEdit) {
        await itemsApi.update(id!, payload);
        toast.success('Item updated');
      } else {
        await itemsApi.create(payload);
        toast.success('Item created');
      }
      navigate('/masters/items');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  const set = (field: string, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const tabs = [
    { key: 'details', label: 'Details' },
    { key: 'pricing', label: 'Pricing & Stock' },
    ...(isEdit ? [
      { key: 'vendors', label: `Vendors (${vendors.length})` },
      { key: 'alternatives', label: `Alternatives (${alternatives.length})` },
    ] : []),
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Loading..." />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={isEdit ? `Edit Item — ${form.name}` : 'New Item'} subtitle={isEdit ? form.item_code : undefined}
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => navigate('/masters/items') },
          { label: saving ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, disabled: saving },
        ]} />

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >{tab.label}</button>
          ))}
        </div>
      </div>

      {/* ─── Details Tab ─── */}
      {activeTab === 'details' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Item Code" required error={errors.item_code}>
              <Input value={form.item_code} onChange={(e) => set('item_code', e.target.value.toUpperCase())} error={!!errors.item_code} placeholder="e.g. RM-001" />
            </FormField>
            <FormField label="Item Type">
              <Select value={form.item_type} onChange={(e) => set('item_type', e.target.value)} options={ITEM_TYPES} />
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={(e) => set('status', e.target.value)}
                options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Name" required error={errors.name}>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} error={!!errors.name} />
            </FormField>
            <FormField label="Description">
              <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Category">{categories.length > 0 ? <Select value={form.category_id} onChange={(e) => set('category_id', e.target.value)} options={categories} placeholder="Select category" /> : <Input value="" disabled placeholder="No categories" />}</FormField>
            <FormField label="Brand">{brands.length > 0 ? <Select value={form.brand_id} onChange={(e) => set('brand_id', e.target.value)} options={brands} placeholder="Select brand" /> : <Input value="" disabled placeholder="No brands" />}</FormField>
            <FormField label="Manufacturer">{manufacturers.length > 0 ? <Select value={form.manufacturer_id} onChange={(e) => set('manufacturer_id', e.target.value)} options={manufacturers} placeholder="Select manufacturer" /> : <Input value="" disabled placeholder="No manufacturers" />}</FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Primary UOM" required error={errors.primary_uom_id}>
              <Select value={form.primary_uom_id} onChange={(e) => set('primary_uom_id', e.target.value)} options={uoms} placeholder="Select UOM" error={!!errors.primary_uom_id} />
            </FormField>
            <FormField label="Purchase UOM">
              <Select value={form.purchase_uom_id} onChange={(e) => set('purchase_uom_id', e.target.value)} options={uoms} placeholder="Same as primary" />
            </FormField>
            <FormField label="HSN Code">
              <Input value={form.hsn_code} onChange={(e) => set('hsn_code', e.target.value)} placeholder="e.g. 7318" />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="GST Rate">
              <Select value={form.gst_rate} onChange={(e) => set('gst_rate', e.target.value)} options={GST_RATES} />
            </FormField>
            <FormField label="Weight">
              <div className="flex gap-2">
                <Input type="number" value={form.weight} onChange={(e) => set('weight', e.target.value)} className="flex-1" min={0} step={0.01} />
                <Select value={form.weight_uom} onChange={(e) => set('weight_uom', e.target.value)} options={[{ value: 'kg', label: 'kg' }, { value: 'g', label: 'g' }]} className="w-20" />
              </div>
            </FormField>
            <FormField label="Shelf Life (days)">
              <Input type="number" value={form.shelf_life_days} onChange={(e) => set('shelf_life_days', e.target.value)} min={0} />
            </FormField>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.batch_tracking} onChange={(e) => set('batch_tracking', e.target.checked)} className="rounded border-gray-300" /><span className="text-sm">Batch Tracking</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.serial_tracking} onChange={(e) => set('serial_tracking', e.target.checked)} className="rounded border-gray-300" /><span className="text-sm">Serial Tracking</span></label>
          </div>
          <FormField label="Tags"><Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="Comma-separated" /></FormField>
        </div>
      )}

      {/* ─── Pricing & Stock Tab ─── */}
      {activeTab === 'pricing' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">Pricing</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField label="Purchase Price (₹)"><Input type="number" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} min={0} step={0.01} /></FormField>
            <FormField label="Selling Price (₹)"><Input type="number" value={form.selling_price} onChange={(e) => set('selling_price', e.target.value)} min={0} step={0.01} /></FormField>
            <FormField label="Standard Cost (₹)"><Input type="number" value={form.standard_cost} onChange={(e) => set('standard_cost', e.target.value)} min={0} step={0.01} /></FormField>
            <FormField label="Costing Method"><Select value={form.costing_method} onChange={(e) => set('costing_method', e.target.value)} options={COSTING_METHODS} /></FormField>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">Stock Thresholds</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField label="Min Stock"><Input type="number" value={form.min_stock_threshold} onChange={(e) => set('min_stock_threshold', e.target.value)} min={0} /></FormField>
            <FormField label="Reorder Qty"><Input type="number" value={form.reorder_quantity} onChange={(e) => set('reorder_quantity', e.target.value)} min={0} /></FormField>
            <FormField label="Max Stock"><Input type="number" value={form.max_stock_level} onChange={(e) => set('max_stock_level', e.target.value)} min={0} /></FormField>
            <FormField label="Lead Time (days)"><Input type="number" value={form.lead_time_days} onChange={(e) => set('lead_time_days', e.target.value)} min={0} /></FormField>
          </div>
        </div>
      )}

      {/* ─── Vendors Tab ─── */}
      {activeTab === 'vendors' && isEdit && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Vendor Mapping</h3>
          {vendors.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">No vendors mapped to this item yet. Map vendors from the Vendor form.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Vendor Item Code</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Price</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Lead Time</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Min Order</th>
                </tr></thead>
                <tbody>
                  {vendors.map((v: any) => (
                    <tr key={v.id} className="border-b border-gray-100">
                      <td className="px-4 py-3"><span className="font-medium text-gray-900">{v.vendor_name}</span><span className="text-xs text-gray-500 ml-2">{v.vendor_code}</span></td>
                      <td className="px-4 py-3 font-mono text-xs">{v.vendor_item_code || '—'}</td>
                      <td className="px-4 py-3 text-right">{v.vendor_price ? <AmountDisplay value={v.vendor_price} /> : '—'}</td>
                      <td className="px-4 py-3 text-right">{v.lead_time_days ? `${v.lead_time_days}d` : '—'}</td>
                      <td className="px-4 py-3 text-right">{v.minimum_order_qty || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Alternatives Tab ─── */}
      {activeTab === 'alternatives' && isEdit && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Alternative Items</h3>
          {alternatives.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">No alternative items configured.</p>
          ) : (
            <div className="space-y-2">
              {alternatives.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div>
                    <span className="font-mono text-xs text-brand-700 mr-2">{a.alt_item_code}</span>
                    <span className="font-medium text-gray-900">{a.alt_item_name}</span>
                    {a.notes && <span className="text-xs text-gray-500 ml-2">({a.notes})</span>}
                  </div>
                  <span className="text-xs text-gray-500">Priority: {a.priority}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}