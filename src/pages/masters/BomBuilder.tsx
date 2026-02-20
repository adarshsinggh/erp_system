// src/pages/masters/BomBuilder.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { bomsApi, BomDetail, BomLine, BomLineInput } from '@/api/modules/boms.api';
import { productsApi, Product } from '@/api/modules/products.api';
import { itemsApi, Item } from '@/api/modules/items.api';
import { mastersApi } from '@/api/modules/masters.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { useKeyboardShortcuts } from '@/hooks';
import { StatusConfig } from '@/lib/constants';

const BOM_STATUS_MAP: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  active: { label: 'Active', color: 'green' },
  obsolete: { label: 'Obsolete', color: 'red' },
};

interface LineRow {
  key: string;
  component_type: 'item' | 'product';
  component_item_id: string;
  component_product_id: string;
  display_name: string;
  display_code: string;
  quantity: string;
  uom_id: string;
  uom_label: string;
  wastage_pct: string;
  unit_cost: number;
  notes: string;
}

export function BomBuilder() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [bomData, setBomData] = useState<BomDetail | null>(null);

  // Header
  const [productId, setProductId] = useState(searchParams.get('product_id') || '');
  const [description, setDescription] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [outputQty, setOutputQty] = useState('1');

  // Lines
  const [lines, setLines] = useState<LineRow[]>([]);

  // Dropdowns
  const [products, setProducts] = useState<{ value: string; label: string }[]>([]);
  const [uoms, setUoms] = useState<{ value: string; label: string }[]>([]);

  // Component search
  const [componentSearch, setComponentSearch] = useState('');
  const [componentResults, setComponentResults] = useState<any[]>([]);
  const [searchingComponents, setSearchingComponents] = useState(false);
  const [showComponentSearch, setShowComponentSearch] = useState(false);

  // Confirm dialogs
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [confirmObsolete, setConfirmObsolete] = useState(false);

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/masters/boms'),
  });

  useEffect(() => {
    loadDropdowns();
    if (isEdit) loadBom();
  }, [id]);

  async function loadDropdowns() {
    try {
      const [prodRes, uomRes] = await Promise.all([
        productsApi.list({ limit: 200 }), mastersApi.listUoms(),
      ]);
      setProducts((prodRes.data || []).map((p: any) => ({ value: p.id, label: `${p.product_code} — ${p.name}` })));
      setUoms((uomRes.data || []).map((u: any) => ({ value: u.id, label: `${u.name} (${u.symbol || u.code})` })));
    } catch {} // silent
  }

  async function loadBom() {
    setLoading(true);
    try {
      const res = await bomsApi.getById(id!);
      const b = res.data;
      setBomData(b);
      setProductId(b.product_id);
      setDescription(b.description || '');
      setEffectiveFrom(b.effective_from ? b.effective_from.split('T')[0] : '');
      setEffectiveTo(b.effective_to ? b.effective_to.split('T')[0] : '');
      setOutputQty(b.output_quantity ? String(b.output_quantity) : '1');
      setLines((b.lines || []).map((l: BomLine, i: number) => ({
        key: l.id || `line-${i}`,
        component_type: l.component_type || 'item',
        component_item_id: l.component_item_id || '',
        component_product_id: l.component_product_id || '',
        display_name: l.item_name || l.sub_product_name || '',
        display_code: l.item_code || l.product_code || '',
        quantity: l.quantity ? String(l.quantity) : '1',
        uom_id: l.uom_id || '',
        uom_label: l.uom_code || '',
        wastage_pct: l.wastage_pct ? String(l.wastage_pct) : '0',
        unit_cost: parseFloat(String(l.item_cost || l.sub_product_cost || 0)),
        notes: l.notes || '',
      })));
    } catch (err: any) { toast.error(err.message); navigate('/masters/boms'); }
    finally { setLoading(false); }
  }

  async function searchComponents(query: string) {
    if (query.length < 2) { setComponentResults([]); return; }
    setSearchingComponents(true);
    try {
      const [itemRes, prodRes] = await Promise.all([
        itemsApi.list({ search: query, limit: 10 }),
        productsApi.list({ search: query, limit: 5 }),
      ]);
      const results = [
        ...(itemRes.data || []).map((i: any) => ({ type: 'item', id: i.id, code: i.item_code, name: i.name, uom_id: i.primary_uom_id, uom_code: i.uom_code, cost: i.purchase_price || i.standard_cost || 0 })),
        ...(prodRes.data || []).map((p: any) => ({ type: 'product', id: p.id, code: p.product_code, name: p.name, uom_id: p.primary_uom_id, uom_code: p.uom_code, cost: p.standard_cost || p.selling_price || 0 })),
      ];
      setComponentResults(results);
    } catch {} // silent
    finally { setSearchingComponents(false); }
  }

  function addComponent(comp: any) {
    const newLine: LineRow = {
      key: `line-${Date.now()}`,
      component_type: comp.type,
      component_item_id: comp.type === 'item' ? comp.id : '',
      component_product_id: comp.type === 'product' ? comp.id : '',
      display_name: comp.name,
      display_code: comp.code,
      quantity: '1',
      uom_id: comp.uom_id || '',
      uom_label: comp.uom_code || '',
      wastage_pct: '0',
      unit_cost: comp.cost || 0,
      notes: '',
    };
    setLines((prev) => [...prev, newLine]);
    setShowComponentSearch(false);
    setComponentSearch('');
    setComponentResults([]);
  }

  function updateLine(key: string, field: string, value: string) {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function getLineCost(line: LineRow): number {
    const qty = parseFloat(line.quantity) || 0;
    const wastage = parseFloat(line.wastage_pct) || 0;
    return line.unit_cost * qty * (1 + wastage / 100);
  }

  const totalMaterialCost = lines.reduce((sum, l) => sum + getLineCost(l), 0);

  function buildLinesPayload(): BomLineInput[] {
    return lines.map((l, i) => ({
      line_number: i + 1,
      component_type: l.component_type,
      component_item_id: l.component_type === 'item' ? l.component_item_id : undefined,
      component_product_id: l.component_type === 'product' ? l.component_product_id : undefined,
      quantity: parseFloat(l.quantity) || 1,
      uom_id: l.uom_id,
      wastage_pct: parseFloat(l.wastage_pct) || 0,
      notes: l.notes || undefined,
    }));
  }

  async function handleSave() {
    if (!productId) { toast.error('Select a product'); return; }
    if (lines.length === 0) { toast.error('Add at least one component'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await bomsApi.updateLines(id!, buildLinesPayload());
        toast.success('BOM lines updated');
      } else {
        await bomsApi.create({
          product_id: productId,
          description,
          effective_from: effectiveFrom || undefined,
          effective_to: effectiveTo || undefined,
          output_quantity: parseFloat(outputQty) || 1,
          lines: buildLinesPayload(),
        });
        toast.success('BOM created');
      }
      navigate('/masters/boms');
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleActivate() {
    try {
      await bomsApi.activate(id!);
      toast.success('BOM activated');
      loadBom();
    } catch (err: any) { toast.error(err.message); }
    finally { setConfirmActivate(false); }
  }

  async function handleObsolete() {
    try {
      await bomsApi.obsolete(id!);
      toast.success('BOM marked obsolete');
      loadBom();
    } catch (err: any) { toast.error(err.message); }
    finally { setConfirmObsolete(false); }
  }

  if (loading) {
    return (<div><PageHeader title="Loading BOM..." /><div className="bg-white rounded-xl border p-6 space-y-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div></div>);
  }

  const isDraft = !bomData || bomData.status === 'draft';

  return (
    <div>
      <PageHeader title={isEdit ? `BOM — ${bomData?.bom_code || ''}` : 'New Bill of Materials'}
        subtitle={isEdit && bomData ? `v${bomData.bom_version}` : undefined}
        actions={[
          ...(isEdit && bomData?.status === 'draft' ? [{ label: 'Activate', variant: 'secondary' as const, onClick: () => setConfirmActivate(true) }] : []),
          ...(isEdit && bomData?.status === 'active' ? [{ label: 'Obsolete', variant: 'secondary' as const, onClick: () => setConfirmObsolete(true) }] : []),
          { label: 'Cancel', variant: 'secondary' as const, onClick: () => navigate('/masters/boms') },
          ...(isDraft ? [{ label: saving ? 'Saving...' : 'Save', variant: 'primary' as const, onClick: handleSave, disabled: saving }] : []),
        ]}
      />

      {isEdit && bomData && (
        <div className="mb-4">
          <StatusBadge status={bomData.status || 'draft'} statusMap={BOM_STATUS_MAP} />
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Product" required>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)} options={products}
              placeholder="Select product" disabled={isEdit} />
          </FormField>
          <FormField label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isDraft} />
          </FormField>
          <FormField label="Output Quantity">
            <Input type="number" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} min={1} disabled={!isDraft} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <FormField label="Effective From">
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} disabled={!isDraft} />
          </FormField>
          <FormField label="Effective To">
            <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} disabled={!isDraft} />
          </FormField>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Components</h3>
          {isDraft && (
            <button onClick={() => setShowComponentSearch(true)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700">
              Add Component
            </button>
          )}
        </div>

        {/* Component Search Popup */}
        {showComponentSearch && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Input
                value={componentSearch}
                onChange={(e) => { setComponentSearch(e.target.value); searchComponents(e.target.value); }}
                placeholder="Search items or sub-assemblies by name or code..."
                autoFocus
                className="flex-1"
              />
              <button onClick={() => { setShowComponentSearch(false); setComponentSearch(''); setComponentResults([]); }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            </div>
            {searchingComponents && <p className="text-xs text-gray-500 mt-2">Searching...</p>}
            {componentResults.length > 0 && (
              <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                {componentResults.map((r) => (
                  <button key={`${r.type}-${r.id}`} onClick={() => addComponent(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${r.type === 'item' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {r.type === 'item' ? 'Item' : 'Product'}
                    </span>
                    <span className="font-mono text-xs text-gray-500">{r.code}</span>
                    <span className="text-sm font-medium text-gray-900 flex-1">{r.name}</span>
                    {r.cost > 0 && <span className="text-xs text-gray-500"><AmountDisplay value={r.cost} /></span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {lines.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500 mb-2">No components added yet</p>
            {isDraft && (
              <button onClick={() => setShowComponentSearch(true)} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Add your first component &#8594;
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-8">#</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Component</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-24">Qty</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase w-28">UOM</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-24">Wastage%</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-28">Unit Cost</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-28">Line Total</th>
                    {isDraft && <th className="px-3 py-2.5 w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.key} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase px-1 py-0.5 rounded ${line.component_type === 'item' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {line.component_type === 'item' ? 'I' : 'P'}
                          </span>
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{line.display_name}</div>
                            <div className="font-mono text-xs text-gray-500">{line.display_code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {isDraft ? (
                          <Input type="number" value={line.quantity} onChange={(e) => updateLine(line.key, 'quantity', e.target.value)} className="h-7 text-sm text-right w-20" min={0} step={0.01} />
                        ) : <span className="text-right block">{line.quantity}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {isDraft ? (
                          <Select value={line.uom_id} onChange={(e) => updateLine(line.key, 'uom_id', e.target.value)} options={uoms} className="h-7 text-xs" />
                        ) : <span className="text-xs">{line.uom_label || '--'}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {isDraft ? (
                          <Input type="number" value={line.wastage_pct} onChange={(e) => updateLine(line.key, 'wastage_pct', e.target.value)} className="h-7 text-sm text-right w-20" min={0} max={100} step={0.1} />
                        ) : <span className="text-right block">{line.wastage_pct}%</span>}
                      </td>
                      <td className="px-3 py-2 text-right"><AmountDisplay value={line.unit_cost} /></td>
                      <td className="px-3 py-2 text-right font-medium"><AmountDisplay value={getLineCost(line)} /></td>
                      {isDraft && (
                        <td className="px-3 py-2">
                          <button onClick={() => removeLine(line.key)} className="p-1 text-gray-400 hover:text-red-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold">
                    <td colSpan={6} className="px-3 py-3 text-right text-sm">Total Material Cost</td>
                    <td className="px-3 py-3 text-right"><AmountDisplay value={totalMaterialCost} /></td>
                    {isDraft && <td></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog open={confirmActivate} title="Activate BOM" message="This will activate this BOM version and obsolete any previously active BOM for this product. Continue?"
        variant="default" confirmLabel="Activate" onConfirm={handleActivate} onCancel={() => setConfirmActivate(false)} />
      <ConfirmDialog open={confirmObsolete} title="Mark Obsolete" message="This BOM will be marked as obsolete and can no longer be used. Continue?"
        variant="danger" confirmLabel="Mark Obsolete" onConfirm={handleObsolete} onCancel={() => setConfirmObsolete(false)} />
    </div>
  );
}