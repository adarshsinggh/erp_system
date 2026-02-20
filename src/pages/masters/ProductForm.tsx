// src/pages/masters/ProductForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productsApi, ProductDetail, BomVersion } from '@/api/modules/products.api';
import { mastersApi } from '@/api/modules/masters.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, toast } from '@/components/shared/FormElements';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { useKeyboardShortcuts } from '@/hooks';
import { formatDate } from '@/lib/formatters';
import { StatusConfig } from '@/lib/constants';

const GST_RATES = [
  { value: '0', label: '0%' }, { value: '5', label: '5%' },
  { value: '12', label: '12%' }, { value: '18', label: '18%' }, { value: '28', label: '28%' },
];

const BOM_STATUS_MAP: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  active: { label: 'Active', color: 'green' },
  obsolete: { label: 'Obsolete', color: 'red' },
};

export function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [brands, setBrands] = useState<{ value: string; label: string }[]>([]);
  const [uoms, setUoms] = useState<{ value: string; label: string }[]>([]);

  const [bomVersions, setBomVersions] = useState<BomVersion[]>([]);
  const [bomLines, setBomLines] = useState<any[]>([]);
  const [activeBom, setActiveBom] = useState<any>(null);

  const [form, setForm] = useState({
    product_code: '', name: '', description: '',
    product_type: 'finished_goods' as string,
    category_id: '', brand_id: '', primary_uom_id: '',
    hsn_code: '', gst_rate: '18',
    selling_price: '', standard_cost: '',
    min_stock_threshold: '', reorder_quantity: '', max_stock_level: '',
    batch_tracking: false, serial_tracking: false,
    warranty_months: '', weight: '', weight_uom: 'kg',
    tags: '', status: 'active',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/masters/products'),
  });

  useEffect(() => { loadDropdowns(); if (isEdit) loadProduct(); }, [id]);

  async function loadDropdowns() {
    try {
      const [catRes, brandRes, uomRes] = await Promise.all([
        mastersApi.listCategories(), mastersApi.listBrands(), mastersApi.listUoms(),
      ]);
      setCategories((catRes.data || []).map((c: any) => ({ value: c.id, label: c.name })));
      setBrands((brandRes.data || []).map((b: any) => ({ value: b.id, label: b.name })));
      setUoms((uomRes.data || []).map((u: any) => ({ value: u.id, label: `${u.name} (${u.symbol || u.code})` })));
    } catch {} // silent
  }

  async function loadProduct() {
    setLoading(true);
    try {
      const res = await productsApi.getById(id!);
      const p = res.data;
      setForm({
        product_code: p.product_code || '', name: p.name || '', description: p.description || '',
        product_type: p.product_type || 'finished_goods',
        category_id: p.category_id || '', brand_id: p.brand_id || '',
        primary_uom_id: p.primary_uom_id || '', hsn_code: p.hsn_code || '',
        gst_rate: p.gst_rate != null ? String(p.gst_rate) : '18',
        selling_price: p.selling_price ? String(p.selling_price) : '',
        standard_cost: p.standard_cost ? String(p.standard_cost) : '',
        min_stock_threshold: p.min_stock_threshold ? String(p.min_stock_threshold) : '',
        reorder_quantity: p.reorder_quantity ? String(p.reorder_quantity) : '',
        max_stock_level: p.max_stock_level ? String(p.max_stock_level) : '',
        batch_tracking: !!p.batch_tracking, serial_tracking: !!p.serial_tracking,
        warranty_months: p.warranty_months ? String(p.warranty_months) : '',
        weight: p.weight ? String(p.weight) : '', weight_uom: p.weight_uom || 'kg',
        tags: (p.tags || []).join(', '), status: p.status || 'active',
      });
      setBomVersions(p.bom_versions || []);
      setBomLines(p.bom_lines || []);
      setActiveBom(p.active_bom || null);
    } catch (err: any) { toast.error(err.message); navigate('/masters/products'); }
    finally { setLoading(false); }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.product_code.trim()) errs.product_code = 'Code is required';
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
        selling_price: form.selling_price ? parseFloat(form.selling_price) : 0,
        standard_cost: form.standard_cost ? parseFloat(form.standard_cost) : 0,
        min_stock_threshold: form.min_stock_threshold ? parseFloat(form.min_stock_threshold) : 0,
        reorder_quantity: form.reorder_quantity ? parseFloat(form.reorder_quantity) : 0,
        max_stock_level: form.max_stock_level ? parseFloat(form.max_stock_level) : 0,
        warranty_months: form.warranty_months ? parseInt(form.warranty_months) : null,
        weight: form.weight ? parseFloat(form.weight) : null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
      };
      if (isEdit) { await productsApi.update(id!, payload); toast.success('Product updated'); }
      else { await productsApi.create(payload); toast.success('Product created'); }
      navigate('/masters/products');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  const set = (field: string, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const tabs = [
    { key: 'details', label: 'Details' },
    { key: 'stock', label: 'Stock Settings' },
    ...(isEdit ? [{ key: 'bom', label: `BOM (${bomVersions.length})` }] : []),
  ];

  if (loading) {
    return (<div><PageHeader title="Loading..." /><div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div></div>);
  }

  return (
    <div>
      <PageHeader title={isEdit ? `Edit Product — ${form.name}` : 'New Product'} subtitle={isEdit ? form.product_code : undefined}
        actions={[
          { label: 'Cancel', variant: 'secondary', onClick: () => navigate('/masters/products') },
          { label: saving ? 'Saving...' : 'Save', variant: 'primary', onClick: handleSave, disabled: saving },
        ]} />

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">{tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >{tab.label}</button>
        ))}</div>
      </div>

      {activeTab === 'details' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Product Code" required error={errors.product_code}>
              <Input value={form.product_code} onChange={(e) => set('product_code', e.target.value.toUpperCase())} error={!!errors.product_code} placeholder="e.g. FG-001" />
            </FormField>
            <FormField label="Product Type">
              <Select value={form.product_type} onChange={(e) => set('product_type', e.target.value)}
                options={[{ value: 'finished_goods', label: 'Finished Goods' }, { value: 'semi_finished', label: 'Semi-Finished' }]} />
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
            <FormField label="Category">{categories.length > 0 ? <Select value={form.category_id} onChange={(e) => set('category_id', e.target.value)} options={categories} placeholder="Select" /> : <Input disabled placeholder="No categories" />}</FormField>
            <FormField label="Brand">{brands.length > 0 ? <Select value={form.brand_id} onChange={(e) => set('brand_id', e.target.value)} options={brands} placeholder="Select" /> : <Input disabled placeholder="No brands" />}</FormField>
            <FormField label="Primary UOM" required error={errors.primary_uom_id}>
              <Select value={form.primary_uom_id} onChange={(e) => set('primary_uom_id', e.target.value)} options={uoms} placeholder="Select UOM" error={!!errors.primary_uom_id} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField label="HSN Code"><Input value={form.hsn_code} onChange={(e) => set('hsn_code', e.target.value)} /></FormField>
            <FormField label="GST Rate"><Select value={form.gst_rate} onChange={(e) => set('gst_rate', e.target.value)} options={GST_RATES} /></FormField>
            <FormField label="Selling Price"><Input type="number" value={form.selling_price} onChange={(e) => set('selling_price', e.target.value)} min={0} step={0.01} /></FormField>
            <FormField label="Standard Cost"><Input type="number" value={form.standard_cost} onChange={(e) => set('standard_cost', e.target.value)} min={0} step={0.01} /></FormField>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Warranty (months)"><Input type="number" value={form.warranty_months} onChange={(e) => set('warranty_months', e.target.value)} min={0} /></FormField>
            <FormField label="Weight">
              <div className="flex gap-2">
                <Input type="number" value={form.weight} onChange={(e) => set('weight', e.target.value)} className="flex-1" min={0} step={0.01} />
                <Select value={form.weight_uom} onChange={(e) => set('weight_uom', e.target.value)} options={[{ value: 'kg', label: 'kg' }, { value: 'g', label: 'g' }]} className="w-20" />
              </div>
            </FormField>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.batch_tracking} onChange={(e) => set('batch_tracking', e.target.checked)} className="rounded border-gray-300" /><span className="text-sm">Batch Tracking</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.serial_tracking} onChange={(e) => set('serial_tracking', e.target.checked)} className="rounded border-gray-300" /><span className="text-sm">Serial Tracking</span></label>
          </div>
          <FormField label="Tags"><Input value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="Comma-separated" /></FormField>
        </div>
      )}

      {activeTab === 'stock' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h3 className="text-sm font-semibold text-gray-700 border-b pb-2">Stock Thresholds</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Minimum Stock"><Input type="number" value={form.min_stock_threshold} onChange={(e) => set('min_stock_threshold', e.target.value)} min={0} /></FormField>
            <FormField label="Reorder Quantity"><Input type="number" value={form.reorder_quantity} onChange={(e) => set('reorder_quantity', e.target.value)} min={0} /></FormField>
            <FormField label="Maximum Stock"><Input type="number" value={form.max_stock_level} onChange={(e) => set('max_stock_level', e.target.value)} min={0} /></FormField>
          </div>
        </div>
      )}

      {activeTab === 'bom' && isEdit && (
        <div className="space-y-4">
          {activeBom && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-green-800">Active BOM: </span>
                  <span className="font-mono text-sm text-green-700">{activeBom.bom_code}</span>
                  <span className="text-sm text-green-600 ml-2">v{activeBom.bom_version}</span>
                </div>
                <button onClick={() => navigate(`/masters/boms/${activeBom.id}`)}
                  className="px-3 py-1.5 text-sm font-medium text-green-700 bg-white border border-green-300 rounded-lg hover:bg-green-50">
                  View BOM
                </button>
              </div>
              {bomLines.length > 0 && (
                <div className="mt-3 text-sm text-green-700">
                  {bomLines.length} component{bomLines.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">BOM Versions</h3>
            <button onClick={() => navigate(`/masters/boms/new?product_id=${id}`)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700">
              Create New BOM
            </button>
          </div>

          {bomVersions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
              <p className="text-sm text-gray-500 mb-2">No BOMs created for this product</p>
              <button onClick={() => navigate(`/masters/boms/new?product_id=${id}`)}
                className="text-sm font-medium text-brand-600 hover:text-brand-700">Create first BOM &#8594;</button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">BOM Code</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Version</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Effective From</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Effective To</th>
                </tr></thead>
                <tbody>
                  {bomVersions.map((v) => (
                    <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/masters/boms/${v.id}`)}>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-brand-700">{v.bom_code}</td>
                      <td className="px-4 py-3 text-center">v{v.bom_version}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={v.status || 'draft'} statusMap={BOM_STATUS_MAP} /></td>
                      <td className="px-4 py-3 text-xs">{v.effective_from ? formatDate(v.effective_from) : '--'}</td>
                      <td className="px-4 py-3 text-xs">{v.effective_to ? formatDate(v.effective_to) : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}