// src/pages/finance/BankAccountForm.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { financeApi, BankAccount } from '@/api/modules/finance.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { FormField, Input, Select, toast, ConfirmDialog } from '@/components/shared/FormElements';
import { useKeyboardShortcuts, useFormDirty } from '@/hooks';

const BANK_TYPE_OPTIONS = [
  { value: 'current', label: 'Current Account' },
  { value: 'savings', label: 'Savings Account' },
  { value: 'od', label: 'Overdraft (OD)' },
  { value: 'cc', label: 'Cash Credit (CC)' },
];

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function BankAccountForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Extra detail for edit
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [ledgerAccountId, setLedgerAccountId] = useState<string | null>(null);

  const [form, setForm] = useState({
    account_name: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    branch_name: '',
    account_type: 'current',
    opening_balance: '',
    is_default: false,
  });

  useFormDirty(dirty);

  useEffect(() => {
    if (isEdit && id) loadBankAccount(id);
  }, [id]);

  async function loadBankAccount(bankId: string) {
    setLoading(true);
    try {
      const res = await financeApi.banks.getById(bankId);
      const b = res.data;
      setForm({
        account_name: b.account_name || '',
        bank_name: b.bank_name || '',
        account_number: b.account_number || '',
        ifsc_code: b.ifsc_code || '',
        branch_name: b.branch_name || '',
        account_type: b.account_type || 'current',
        opening_balance: b.opening_balance ? String(b.opening_balance) : '',
        is_default: b.is_default || false,
      });
      setCurrentBalance(b.current_balance ?? null);
      setLedgerAccountId(b.ledger_account_id ?? null);
    } catch (err: any) {
      toast.error(err.message);
      navigate('/finance/banks');
    } finally {
      setLoading(false);
    }
  }

  useKeyboardShortcuts({
    'ctrl+enter': () => handleSave(),
    'escape': () => navigate('/finance/banks'),
  });

  function updateField(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.account_name.trim()) errs.account_name = 'Account name is required';
    if (!form.bank_name.trim()) errs.bank_name = 'Bank name is required';
    if (!form.account_number.trim()) errs.account_number = 'Account number is required';
    if (!form.account_type) errs.account_type = 'Account type is required';
    if (form.ifsc_code && !IFSC_PATTERN.test(form.ifsc_code.toUpperCase())) {
      errs.ifsc_code = 'Invalid IFSC code (format: ABCD0123456)';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        account_name: form.account_name.trim(),
        bank_name: form.bank_name.trim(),
        account_number: form.account_number.trim(),
        ifsc_code: form.ifsc_code ? form.ifsc_code.toUpperCase().trim() : undefined,
        branch_name: form.branch_name.trim() || undefined,
        account_type: form.account_type as 'current' | 'savings' | 'od' | 'cc',
        opening_balance: form.opening_balance ? parseFloat(form.opening_balance) : 0,
        is_default: form.is_default,
      };

      if (isEdit) {
        await financeApi.banks.update(id!, payload);
        toast.success('Bank account updated');
      } else {
        await financeApi.banks.create(payload);
        toast.success('Bank account created');
      }
      navigate('/finance/banks');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await financeApi.banks.delete(id!);
      toast.success('Bank account deleted');
      navigate('/finance/banks');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title={isEdit ? 'Edit Bank Account' : 'New Bank Account'} onBack={() => navigate('/finance/banks')} />
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-2xl">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const pageActions: { label: string; variant: 'primary' | 'secondary' | 'danger'; onClick: () => void; shortcut?: string; disabled?: boolean }[] = [
    { label: 'Cancel', variant: 'secondary', onClick: () => navigate('/finance/banks') },
  ];
  if (isEdit) {
    pageActions.push({ label: 'Delete', variant: 'danger', onClick: () => setShowDeleteConfirm(true) });
  }
  pageActions.push({
    label: saving ? 'Saving...' : 'Save',
    variant: 'primary',
    onClick: handleSave,
    shortcut: 'Ctrl+Enter',
    disabled: saving,
  });

  return (
    <div>
      <PageHeader
        title={isEdit ? `Edit Bank Account — ${form.account_name}` : 'New Bank Account'}
        onBack={() => navigate('/finance/banks')}
        actions={pageActions}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Account Display Name" required error={errors.account_name}>
            <Input
              value={form.account_name}
              onChange={(e) => updateField('account_name', e.target.value)}
              error={!!errors.account_name}
              placeholder="e.g. HDFC Current Account"
              autoFocus
            />
          </FormField>
          <FormField label="Bank Name" required error={errors.bank_name}>
            <Input
              value={form.bank_name}
              onChange={(e) => updateField('bank_name', e.target.value)}
              error={!!errors.bank_name}
              placeholder="e.g. HDFC Bank"
            />
          </FormField>
          <FormField label="Account Number" required error={errors.account_number}>
            <Input
              value={form.account_number}
              onChange={(e) => updateField('account_number', e.target.value)}
              error={!!errors.account_number}
              placeholder="Full account number"
              className="font-mono"
            />
          </FormField>
          <FormField label="IFSC Code" error={errors.ifsc_code} hint="Format: ABCD0123456">
            <Input
              value={form.ifsc_code}
              onChange={(e) => updateField('ifsc_code', e.target.value.toUpperCase())}
              error={!!errors.ifsc_code}
              placeholder="e.g. HDFC0001234"
              className="font-mono"
              maxLength={11}
            />
          </FormField>
          <FormField label="Bank Branch">
            <Input
              value={form.branch_name}
              onChange={(e) => updateField('branch_name', e.target.value)}
              placeholder="e.g. Varanasi Main Branch"
            />
          </FormField>
          <FormField label="Account Type" required error={errors.account_type}>
            <Select
              value={form.account_type}
              onChange={(e) => updateField('account_type', e.target.value)}
              options={BANK_TYPE_OPTIONS}
              error={!!errors.account_type}
            />
          </FormField>
          <FormField label="Opening Balance" hint="Balance as of start of financial year">
            <Input
              type="number"
              value={form.opening_balance}
              onChange={(e) => updateField('opening_balance', e.target.value)}
              placeholder="0.00"
            />
          </FormField>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => updateField('is_default', e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-gray-700">Set as default bank account</span>
            </label>
          </div>
        </div>

        {/* Edit-mode details */}
        {isEdit && (currentBalance !== null || ledgerAccountId) && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-500 mb-3">Account Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentBalance !== null && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Current Balance (from Ledger)</div>
                  <div className="text-lg font-bold text-gray-900"><AmountDisplay value={currentBalance} /></div>
                </div>
              )}
              {ledgerAccountId && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">Linked COA Account</div>
                  <button
                    onClick={() => navigate(`/finance/ledger?account=${ledgerAccountId}`)}
                    className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                  >
                    View Ledger →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Bank Account"
        message="Are you sure you want to delete this bank account? This action cannot be undone. Deletion will fail if there are existing transactions."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}