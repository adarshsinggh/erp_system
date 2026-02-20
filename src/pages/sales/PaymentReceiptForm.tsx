// src/pages/sales/PaymentReceiptForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { paymentReceiptsApi, PaymentReceipt } from '@/api/modules/payment-receipts.api';
import { customersApi, Customer } from '@/api/modules/customers.api';
import { salesInvoicesApi, CustomerOutstanding } from '@/api/modules/sales-invoices.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, Textarea, ConfirmDialog, toast } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useDebounce } from '@/hooks';
import type { StatusConfig } from '@/lib/constants';

const RECEIPT_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  confirmed: { label: 'Confirmed', color: 'green' },
  bounced: { label: 'Bounced', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
];

export function PaymentReceiptForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('draft');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [bounceConfirm, setBounceConfirm] = useState(false);

  const [form, setForm] = useState({
    customer_id: searchParams.get('customer_id') || '',
    receipt_date: new Date().toISOString().slice(0, 10),
    invoice_id: searchParams.get('invoice_id') || '',
    amount: '', payment_mode: 'bank_transfer',
    bank_account_id: '', cheque_number: '', cheque_date: '',
    transaction_reference: '', tds_deducted: '0',
    narration: '', is_advance: false,
  });
  const [invoiceInfo, setInvoiceInfo] = useState<{ invoice_number: string; grand_total: number; amount_due: number } | null>(null);
  const [outstanding, setOutstanding] = useState<CustomerOutstanding | null>(null);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const debouncedCustSearch = useDebounce(customerSearch, 300);

  const isDraft = status === 'draft';
  const readonly = !isDraft && isEdit;
  const netAmount = (parseFloat(form.amount) || 0) - (parseFloat(form.tds_deducted) || 0);

  useKeyboardShortcuts({
    'ctrl+enter': () => { if (!readonly) handleSave(); },
    'escape': () => navigate('/sales/payments'),
  });

  useEffect(() => { if (isEdit) loadReceipt(); }, [id]);

  // Load customer outstanding when customer changes
  useEffect(() => {
    if (form.customer_id) {
      salesInvoicesApi.getCustomerOutstanding(form.customer_id)
        .then((res) => setOutstanding(res.data))
        .catch(() => {});
    }
  }, [form.customer_id]);

  async function loadReceipt() {
    setLoading(true);
    try {
      const res = await paymentReceiptsApi.getById(id!);
      const p = res.data;
      setStatus(p.status);
      setForm({
        customer_id: p.customer_id || '', receipt_date: p.receipt_date || '',
        invoice_id: p.invoice_id || '', amount: p.amount ? String(p.amount) : '',
        payment_mode: p.payment_mode || 'bank_transfer',
        bank_account_id: p.bank_account_id || '',
        cheque_number: p.cheque_number || '', cheque_date: p.cheque_date || '',
        transaction_reference: p.transaction_reference || '',
        tds_deducted: p.tds_deducted ? String(p.tds_deducted) : '0',
        narration: p.narration || '', is_advance: !!p.is_advance,
      });
      if (p.customer) { setSelectedCustomer(p.customer as unknown as Customer); setCustomerSearch(p.customer.name); }
      if (p.invoice) setInvoiceInfo(p.invoice);
    } catch (err: any) { toast.error(err.message); navigate('/sales/payments'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (debouncedCustSearch?.length >= 2)
      customersApi.list({ search: debouncedCustSearch, limit: 10, status: 'active' }).then((r) => setCustomerResults(r.data || [])).catch(() => {});
    else setCustomerResults([]);
  }, [debouncedCustSearch]);

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c); setCustomerSearch(c.name);
    setForm((f) => ({ ...f, customer_id: c.id })); setShowCustomerDropdown(false);
  }

  async function handleSave() {
    if (!form.customer_id) { toast.error('Please select a customer'); return; }
    if (!form.receipt_date) { toast.error('Please enter receipt date'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Please enter a valid amount'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
        tds_deducted: parseFloat(form.tds_deducted) || 0,
        invoice_id: form.invoice_id || null,
        bank_account_id: form.bank_account_id || null,
        cheque_number: form.cheque_number || null,
        cheque_date: form.cheque_date || null,
        transaction_reference: form.transaction_reference || null,
      };
      if (isEdit) { await paymentReceiptsApi.update(id!, payload); toast.success('Receipt updated'); loadReceipt(); }
      else { const res = await paymentReceiptsApi.create(payload); toast.success('Receipt created'); navigate(`/sales/payments/${res.data.id}`); }
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  async function handleAction(action: string) {
    try {
      if (action === 'confirm') { await paymentReceiptsApi.confirm(id!); toast.success('Payment confirmed'); }
      else if (action === 'bounce') { await paymentReceiptsApi.bounce(id!); toast.success('Payment marked as bounced'); }
      else if (action === 'cancel') { await paymentReceiptsApi.cancel(id!); toast.success('Payment cancelled'); }
      loadReceipt();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete() {
    try { await paymentReceiptsApi.delete(id!); toast.success('Receipt deleted'); navigate('/sales/payments'); }
    catch (err: any) { toast.error(err.message); }
  }

  function getActions() {
    const a: any[] = [];
    if (isDraft) {
      a.push({ label: saving ? 'Saving...' : 'Save Draft', variant: 'primary', onClick: handleSave, shortcut: 'Ctrl+Enter', disabled: saving });
      if (isEdit) {
        a.push({ label: 'Confirm', variant: 'default', onClick: () => handleAction('confirm') });
        a.push({ label: 'Delete', variant: 'danger', onClick: () => setDeleteConfirm(true) });
      }
    }
    if (status === 'confirmed')
      a.push({ label: 'Bounce', variant: 'danger', onClick: () => setBounceConfirm(true) });
    if (status !== 'cancelled' && status !== 'bounced' && isEdit && status !== 'draft')
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
      <PageHeader title={isEdit ? 'Payment Receipt' : 'New Payment Receipt'}
        subtitle={selectedCustomer?.name} actions={getActions()} />

      {isEdit && (
        <div className="flex items-center gap-3 mb-4">
          <StatusBadge status={status} statusMap={RECEIPT_STATUSES} />
          {form.is_advance && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-orange-100 text-orange-700">Advance Payment</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <FormField label="Receipt Date" required>
                <Input type="date" value={form.receipt_date} onChange={(e) => setForm((f) => ({ ...f, receipt_date: e.target.value }))} disabled={readonly} />
              </FormField>
              <FormField label="Amount" required>
                <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00" disabled={readonly} min={0} step={0.01} />
              </FormField>
              <FormField label="Payment Mode" required>
                <Select value={form.payment_mode} onChange={(e) => setForm((f) => ({ ...f, payment_mode: e.target.value }))}
                  options={PAYMENT_MODES} disabled={readonly} />
              </FormField>
              <FormField label="Invoice (optional)">
                <Input value={form.invoice_id} onChange={(e) => setForm((f) => ({ ...f, invoice_id: e.target.value }))}
                  placeholder="Invoice UUID" disabled={readonly} />
              </FormField>
              <FormField label="Advance Payment">
                <label className="flex items-center gap-2 mt-2">
                  <input type="checkbox" checked={form.is_advance}
                    onChange={(e) => setForm((f) => ({ ...f, is_advance: e.target.checked }))}
                    disabled={readonly} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm text-gray-600">This is an advance payment</span>
                </label>
              </FormField>
            </div>

            {/* Conditional Fields */}
            {form.payment_mode === 'cheque' && (
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
                <FormField label="Cheque Number">
                  <Input value={form.cheque_number} onChange={(e) => setForm((f) => ({ ...f, cheque_number: e.target.value }))} disabled={readonly} />
                </FormField>
                <FormField label="Cheque Date">
                  <Input type="date" value={form.cheque_date} onChange={(e) => setForm((f) => ({ ...f, cheque_date: e.target.value }))} disabled={readonly} />
                </FormField>
              </div>
            )}
            {(form.payment_mode === 'bank_transfer' || form.payment_mode === 'upi') && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <FormField label="Transaction Reference">
                  <Input value={form.transaction_reference} onChange={(e) => setForm((f) => ({ ...f, transaction_reference: e.target.value }))}
                    placeholder="UTR / Transaction ID" disabled={readonly} />
                </FormField>
              </div>
            )}

            {/* TDS */}
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
              <FormField label="TDS Deducted">
                <Input type="number" value={form.tds_deducted} onChange={(e) => setForm((f) => ({ ...f, tds_deducted: e.target.value }))}
                  disabled={readonly} min={0} step={0.01} />
              </FormField>
              <FormField label="Net Amount">
                <div className="px-3 py-2 text-sm font-semibold bg-gray-50 border border-gray-200 rounded-lg">
                  <AmountDisplay value={netAmount} />
                </div>
              </FormField>
            </div>

            {/* Narration */}
            <div className="mt-4">
              <FormField label="Narration">
                <Textarea value={form.narration} onChange={(e) => setForm((f) => ({ ...f, narration: e.target.value }))}
                  rows={2} disabled={readonly} placeholder="Payment description..." />
              </FormField>
            </div>
          </div>
        </div>

        {/* Sidebar — Outstanding Summary */}
        <div className="space-y-4">
          {outstanding && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Customer Outstanding</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Invoiced</span>
                  <AmountDisplay value={outstanding.total_invoiced} />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Paid</span>
                  <span className="text-green-600"><AmountDisplay value={outstanding.total_paid} /></span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                  <span>Outstanding</span>
                  <span className={outstanding.total_outstanding > 0 ? 'text-red-600' : ''}>
                    <AmountDisplay value={outstanding.total_outstanding} />
                  </span>
                </div>
                {outstanding.overdue_amount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Overdue</span>
                    <AmountDisplay value={outstanding.overdue_amount} />
                  </div>
                )}
                <div className="text-xs text-gray-400 pt-1">
                  {outstanding.invoice_count} invoice{outstanding.invoice_count !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          )}

          {invoiceInfo && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Linked Invoice</h4>
              <div className="space-y-2 text-sm">
                <div className="font-mono text-xs text-brand-700">{invoiceInfo.invoice_number}</div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoice Total</span>
                  <AmountDisplay value={invoiceInfo.grand_total} />
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Amount Due</span>
                  <span className={invoiceInfo.amount_due > 0 ? 'text-red-600' : ''}>
                    <AmountDisplay value={invoiceInfo.amount_due} />
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog open={deleteConfirm} title="Delete Receipt" message="Are you sure? This cannot be undone."
        variant="danger" confirmLabel="Delete" onConfirm={() => { setDeleteConfirm(false); handleDelete(); }} onCancel={() => setDeleteConfirm(false)} />
      <ConfirmDialog open={bounceConfirm} title="Mark as Bounced"
        message="This will reverse the payment and update the invoice outstanding amount."
        variant="danger" confirmLabel="Mark Bounced" onConfirm={() => { setBounceConfirm(false); handleAction('bounce'); }} onCancel={() => setBounceConfirm(false)} />
    </div>
  );
}