// src/pages/sales/DeliveryChallanForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { deliveryChallansApi, DeliveryChallanDetail, DeliveryChallanLine } from '@/api/modules/delivery-challans.api';
import { salesOrdersApi, SalesOrder } from '@/api/modules/sales-orders.api';
import { customersApi, Customer } from '@/api/modules/customers.api';
import { productsApi, Product } from '@/api/modules/products.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FormField, Input, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const CHALLAN_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  dispatched: { label: 'Dispatched', color: 'blue' },
  in_transit: { label: 'In Transit', color: 'purple' },
  delivered: { label: 'Delivered', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

interface FormLine {
  id?: string;
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  uom_id: string;
  uom_code: string;
  sales_order_line_id?: string;
}

function emptyLine(): FormLine {
  return { product_id: '', product_code: '', product_name: '', quantity: 1, uom_id: '', uom_code: '' };
}

export function DeliveryChallanForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [dispatchConfirm, setDispatchConfirm] = useState(false);

  const [form, setForm] = useState({
    customer_id: '', challan_date: new Date().toISOString().slice(0, 10),
    sales_order_id: '', warehouse_id: '', shipping_address_id: '',
    transporter_name: '', vehicle_number: '', lr_number: '', e_way_bill_number: '',
    internal_notes: '',
  });
  const [soNumber, setSoNumber] = useState('');
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const debouncedCustSearch = useDebounce(customerSearch, 300);

  const [productSearchIdx, setProductSearchIdx] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<Product[]>([]);
  const debouncedProdSearch = useDebounce(productSearch, 300);

  // SO search
  const [soSearch, setSoSearch] = useState('');
  const [soResults, setSoResults] = useState<SalesOrder[]>([]);
  const [showSoDropdown, setShowSoDropdown] = useState(false);
  const debouncedSoSearch = useDebounce(soSearch, 300);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/sales/challans'),
  });

  useEffect(() => { if (isEdit) loadChallan(); }, [id]);

  async function loadChallan() {
    setLoading(true);
    try {
      const res = await deliveryChallansApi.getById(id!);
      const d = res.data;
      setStatus(d.status);
      setForm({
        customer_id: d.customer_id || '',
        challan_date: d.challan_date ? String(d.challan_date).substring(0, 10) : '',
        sales_order_id: d.sales_order_id || '', warehouse_id: d.warehouse_id || '',
        shipping_address_id: d.shipping_address_id || '',
        transporter_name: d.transporter_name || '', vehicle_number: d.vehicle_number || '',
        lr_number: d.lr_number || '', e_way_bill_number: d.e_way_bill_number || '',
        internal_notes: d.internal_notes || '',
      });
      if (d.sales_order) { setSoNumber(d.sales_order.order_number); setSoSearch(d.sales_order.order_number); }
      if (d.customer) { setSelectedCustomer(d.customer as unknown as Customer); setCustomerSearch(d.customer.name); }
      if (d.lines?.length) {
        setLines(d.lines.map((l) => ({
          id: l.id, product_id: l.product_id || '', product_code: l.product_code || '',
          product_name: l.product_name || '', quantity: l.quantity || 1,
          uom_id: l.uom_id || '', uom_code: l.uom_code || '',
          sales_order_line_id: l.sales_order_line_id,
        })));
      }
    } catch (err: any) { toast.error(err.message); navigate('/sales/challans'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (debouncedCustSearch?.length >= 2)
      customersApi.list({ search: debouncedCustSearch, limit: 10, status: 'active' }).then((r) => setCustomerResults(r.data || [])).catch(() => {});
    else setCustomerResults([]);
  }, [debouncedCustSearch]);

  useEffect(() => {
    if (debouncedSoSearch?.length >= 2) {
      const params: any = { search: debouncedSoSearch, limit: 10, status: 'confirmed' };
      if (form.customer_id) params.customer_id = form.customer_id;
      salesOrdersApi.list(params).then((r) => setSoResults(r.data || [])).catch(() => {});
    } else { setSoResults([]); }
  }, [debouncedSoSearch]);

  function selectSO(so: SalesOrder) {
    setForm((f) => ({ ...f, sales_order_id: so.id }));
    setSoSearch(so.order_number);
    setSoNumber(so.order_number);
    setShowSoDropdown(false);
  }

  useEffect(() => {
    if (debouncedProdSearch?.length >= 1)
      productsApi.list({ search: debouncedProdSearch, limit: 10, status: 'active' }).then((r) => setProductResults(r.data || [])).catch(() => {});
    else setProductResults([]);
  }, [debouncedProdSearch]);

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c); setCustomerSearch(c.name);
    setForm((f) => ({ ...f, customer_id: c.id })); setShowCustomerDropdown(false);
  }
  function selectProduct(idx: number, p: Product) {
    setLines((prev) => prev.map((line, i) => i === idx ? {
      ...line, product_id: p.id, product_code: p.product_code, product_name: p.name,
      uom_id: p.primary_uom_id || '', uom_code: p.uom_code || '',
    } : line));
    setProductSearchIdx(null); setProductSearch('');
  }
  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(idx: number) { if (lines.length > 1) setLines((prev) => prev.filter((_, i) => i !== idx)); }
  function updateLine(idx: number, field: keyof FormLine, value: any) {
    setLines((prev) => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line));
  }

  async function handleSave() {
    if (!form.customer_id) { toast.error('Please select a customer'); return; }
    if (!form.challan_date) { toast.error('Please enter challan date'); return; }
    const validLines = lines.filter((l) => l.product_id && l.quantity > 0);
    if (!validLines.length) { toast.error('Add at least one line item'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        lines: validLines.map((l) => ({
          id: l.id, product_id: l.product_id, quantity: l.quantity, uom_id: l.uom_id,
          sales_order_line_id: l.sales_order_line_id,
        })),
      };
      if (isEdit) { await deliveryChallansApi.update(id!, payload); toast.success('Challan updated'); loadChallan(); }
      else { const res = await deliveryChallansApi.create(payload as any); toast.success('Challan created'); navigate(`/sales/challans/${res.data.id}`); }
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: string) {
    try {
      if (action === 'dispatch') { await deliveryChallansApi.dispatch(id!); toast.success('Challan dispatched'); }
      else if (action === 'deliver') { await deliveryChallansApi.deliver(id!); toast.success('Marked as delivered'); }
      else if (action === 'cancel') { await deliveryChallansApi.cancel(id!); toast.success('Challan cancelled'); }
      loadChallan();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete() {
    try { await deliveryChallansApi.delete(id!); toast.success('Challan deleted'); navigate('/sales/challans'); }
    catch (err: any) { toast.error(err.message); }
  }

  function getActions() {
    const a: any[] = [];
    if (isDraft) {
      a.push({ label: saving ? 'Saving...' : 'Save Draft', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving });
      if (isEdit) {
        a.push({ label: 'Dispatch', variant: 'default', onClick: () => setDispatchConfirm(true) });
        a.push({ label: 'Delete', variant: 'danger', onClick: () => setDeleteConfirm(true) });
      }
    }
    if (status === 'dispatched' || status === 'in_transit')
      a.push({ label: 'Mark Delivered', variant: 'primary', onClick: () => handleAction('deliver') });
    if (status !== 'delivered' && status !== 'cancelled' && isEdit)
      a.push({ label: 'Cancel', variant: 'danger', onClick: () => handleAction('cancel') });
    return a;
  }

  if (loading) return (
    <div className="space-y-4 animate-fade-in">
      <div className="skeleton h-8 w-64 rounded" />
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title={isEdit ? 'Delivery Challan' : 'New Delivery Challan'}
        subtitle={selectedCustomer?.name} actions={getActions()} />

      {isEdit && (
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={status} statusMap={CHALLAN_STATUSES} />
          {soNumber && (
            <Link to={`/sales/orders/${form.sales_order_id}`} className="text-xs text-purple-600 hover:text-purple-800 font-medium">
              SO: {soNumber}
            </Link>
          )}
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Customer" required className="relative">
            <Input value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
              onFocus={() => setShowCustomerDropdown(true)} placeholder="Search customer..." disabled={readonly} />
            {showCustomerDropdown && customerResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {customerResults.map((c) => (
                  <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{c.customer_code}</span>
                  </button>
                ))}
              </div>
            )}
          </FormField>
          <FormField label="Challan Date" required>
            <Input type="date" value={form.challan_date} onChange={(e) => setForm((f) => ({ ...f, challan_date: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="Sales Order" hint="Link to existing SO" className="relative">
            <Input value={soSearch}
              onChange={(e) => { setSoSearch(e.target.value); setShowSoDropdown(true); }}
              onFocus={() => setShowSoDropdown(true)}
              placeholder="Search SO number..."
              disabled={readonly} />
            {showSoDropdown && soResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
                {soResults.map((so) => (
                  <button key={so.id} type="button" onClick={() => selectSO(so)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                    <span className="font-mono font-medium">{so.order_number}</span>
                    <span className="ml-2 text-xs text-gray-500">{so.customer?.name}</span>
                  </button>
                ))}
              </div>
            )}
          </FormField>
        </div>

        {/* Transport Details */}
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-3">Transport Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormField label="Transporter Name">
            <Input value={form.transporter_name} onChange={(e) => setForm((f) => ({ ...f, transporter_name: e.target.value }))} disabled={readonly} placeholder="e.g. BlueDart" />
          </FormField>
          <FormField label="Vehicle Number">
            <Input value={form.vehicle_number} onChange={(e) => setForm((f) => ({ ...f, vehicle_number: e.target.value }))} disabled={readonly} placeholder="e.g. UP32XX1234" />
          </FormField>
          <FormField label="LR Number">
            <Input value={form.lr_number} onChange={(e) => setForm((f) => ({ ...f, lr_number: e.target.value }))} disabled={readonly} />
          </FormField>
          <FormField label="E-Way Bill Number">
            <Input value={form.e_way_bill_number} onChange={(e) => setForm((f) => ({ ...f, e_way_bill_number: e.target.value }))} disabled={readonly} />
          </FormField>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Delivery Items</h3>
        <div className="overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 w-8 text-gray-500 font-medium">#</th>
                <th className="text-left py-2 px-2 text-gray-500 font-medium">Product</th>
                <th className="text-right py-2 px-2 w-24 text-gray-500 font-medium">Quantity</th>
                <th className="text-left py-2 px-2 w-16 text-gray-500 font-medium">UOM</th>
                {!readonly && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-2 px-2 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="py-2 px-2 relative">
                    {readonly ? (
                      <span className="text-xs">{line.product_code} - {line.product_name}</span>
                    ) : (
                      <>
                        <Input value={productSearchIdx === idx ? productSearch : (line.product_code ? `${line.product_code} - ${line.product_name}` : '')}
                          onChange={(e) => { setProductSearchIdx(idx); setProductSearch(e.target.value); }}
                          onFocus={() => setProductSearchIdx(idx)} placeholder="Search product..." className="!py-1 !text-xs h-8" />
                        {productSearchIdx === idx && productResults.length > 0 && (
                          <div className="absolute z-50 top-full left-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-48 overflow-y-auto min-w-[320px]">
                            {productResults.map((p) => (
                              <button key={p.id} type="button" onClick={() => selectProduct(idx, p)}
                                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs">
                                <span className="font-mono font-medium">{p.product_code}</span>
                                <span className="ml-2">{p.name}</span>
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

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <FormField label="Internal Notes">
          <Textarea value={form.internal_notes} onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))} rows={3} disabled={readonly} />
        </FormField>
      </div>

      <ConfirmDialog open={deleteConfirm} title="Delete Challan" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
      <ConfirmDialog open={dispatchConfirm} title="Dispatch Challan"
        message="This will deduct stock from the warehouse and update delivery quantities on the Sales Order."
        confirmLabel="Dispatch" onConfirm={() => { setDispatchConfirm(false); handleAction('dispatch'); }} onCancel={() => setDispatchConfirm(false)} />
    </div>
  );
}