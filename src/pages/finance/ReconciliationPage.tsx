// src/pages/finance/ReconciliationPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  financeApi, BankAccount, ReconciliationEntry, ReconciliationSummary, LedgerEntry,
} from '@/api/modules/finance.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, Input, Textarea, toast, ConfirmDialog } from '@/components/shared/FormElements';
import { formatDate, formatCurrency } from '@/lib/formatters';

function SummaryCard({ label, value, color, isCount }: { label: string; value: number | string; color: string; isCount?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="text-xs font-medium opacity-70 mb-0.5">{label}</div>
      <div className="text-lg font-bold">
        {isCount ? value : formatCurrency(typeof value === 'string' ? parseFloat(value) : value)}
      </div>
    </div>
  );
}

export function ReconciliationPage() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [selectedBank, setSelectedBank] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [statementEntries, setStatementEntries] = useState<ReconciliationEntry[]>([]);
  const [statementFilter, setStatementFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);

  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
  const [unmatchConfirm, setUnmatchConfirm] = useState<string | null>(null);

  const [showAddEntry, setShowAddEntry] = useState(false);
  const [addForm, setAddForm] = useState({ date: today, reference: '', description: '', amount: '' });
  const [addSaving, setAddSaving] = useState(false);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    financeApi.banks.list({ limit: 100 })
      .then((res) => setBankAccounts(res.data || []))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedBankId) return;
    setLoading(true);
    try {
      const bank = bankAccounts.find((b) => b.id === selectedBankId);
      setSelectedBank(bank || null);

      const [summaryRes, statementsRes] = await Promise.all([
        financeApi.reconciliation.summary(selectedBankId),
        financeApi.reconciliation.listEntries(selectedBankId, {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          is_matched: statementFilter === 'all' ? undefined : statementFilter === 'matched',
          limit: 200,
        }),
      ]);
      setSummary(summaryRes.data);
      setStatementEntries(statementsRes.data || []);

      if (bank?.ledger_account_id) {
        const ledgerRes = await financeApi.ledger.accountLedger(bank.ledger_account_id, {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          limit: 200,
        });
        setLedgerEntries(ledgerRes.data || []);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedBankId, fromDate, toDate, statementFilter, bankAccounts]);

  useEffect(() => { if (selectedBankId) loadData(); }, [loadData]);

  useEffect(() => {
    setSelectedStatementId(null);
    setSelectedLedgerId(null);
  }, [selectedBankId]);

  async function handleMatch() {
    if (!selectedStatementId || !selectedLedgerId) return;
    try {
      await financeApi.reconciliation.match(selectedStatementId, { ledger_entry_id: selectedLedgerId });
      toast.success('Entries matched');
      setSelectedStatementId(null);
      setSelectedLedgerId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleUnmatch(id: string) {
    try {
      await financeApi.reconciliation.unmatch(id);
      toast.success('Entry unmatched');
      setUnmatchConfirm(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleAddEntry() {
    if (!addForm.date || !addForm.amount) {
      toast.error('Date and amount are required');
      return;
    }
    setAddSaving(true);
    try {
      await financeApi.reconciliation.createEntry({
        bank_account_id: selectedBankId,
        statement_date: addForm.date,
        statement_reference: addForm.reference || undefined,
        statement_description: addForm.description || undefined,
        statement_amount: parseFloat(addForm.amount),
      });
      toast.success('Entry added');
      setShowAddEntry(false);
      setAddForm({ date: today, reference: '', description: '', amount: '' });
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddSaving(false);
    }
  }

  async function handleBulkImport() {
    if (!bulkText.trim()) { toast.error('Enter CSV data to import'); return; }
    setBulkSaving(true);
    try {
      const lines = bulkText.trim().split('\n').filter((l) => l.trim());
      const entries = lines.map((line) => {
        const parts = line.split(',').map((p) => p.trim());
        return {
          statement_date: parts[0],
          statement_reference: parts[1] || undefined,
          statement_description: parts[2] || undefined,
          statement_amount: parseFloat(parts[3] || '0'),
        };
      });
      await financeApi.reconciliation.bulkImport({ bank_account_id: selectedBankId, entries });
      toast.success(`${entries.length} entries imported`);
      setShowBulkImport(false);
      setBulkText('');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBulkSaving(false);
    }
  }

  const bankOptions = bankAccounts.map((b) => ({ value: b.id, label: `${b.account_name} — ${b.bank_name}` }));

  return (
    <div>
      <PageHeader title="Bank Reconciliation" subtitle="Match bank statement entries with book entries" />

      {/* Bank Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
            <Select value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)} options={bankOptions} placeholder="Select a bank account..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </div>

      {!selectedBankId ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <p className="text-sm text-gray-500">Select a bank account to begin reconciliation</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <SummaryCard label="Book Balance" value={summary.book_balance} color="bg-blue-50 border-blue-200 text-blue-700" />
              <SummaryCard label="Statement Balance" value={summary.statement_balance} color="bg-purple-50 border-purple-200 text-purple-700" />
              <SummaryCard label="Matched" value={String(summary.matched_count ?? 0)} isCount color="bg-emerald-50 border-emerald-200 text-emerald-700" />
              <SummaryCard label="Unmatched" value={String(summary.unmatched_count ?? 0)} isCount color="bg-orange-50 border-orange-200 text-orange-700" />
              <SummaryCard label="Difference" value={summary.difference}
                color={Math.abs(summary.difference) < 0.01 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'} />
            </div>
          )}

          {/* Match bar */}
          {selectedStatementId && selectedLedgerId && (
            <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-brand-700 font-medium">Ready to match selected entries</span>
              <div className="flex gap-2">
                <button onClick={() => { setSelectedStatementId(null); setSelectedLedgerId(null); }}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={handleMatch}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700">
                  Match Entries
                </button>
              </div>
            </div>
          )}

          {/* Two-Panel Layout */}
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[0, 1].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="skeleton h-4 rounded" />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Panel: Bank Statement */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-700 text-sm">Bank Statement Entries</h3>
                  <div className="flex items-center gap-2">
                    <select
                      value={statementFilter}
                      onChange={(e) => setStatementFilter(e.target.value as any)}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:ring-brand-500 focus:border-brand-500"
                    >
                      <option value="all">All</option>
                      <option value="matched">Matched</option>
                      <option value="unmatched">Unmatched</option>
                    </select>
                    <button onClick={() => setShowAddEntry(true)}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700">+ Add</button>
                    <button onClick={() => setShowBulkImport(true)}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700">Import</button>
                  </div>
                </div>
                <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-100">
                  {statementEntries.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">No statement entries</div>
                  ) : (
                    statementEntries.map((entry) => {
                      const isSelected = selectedStatementId === entry.id;
                      const isPositive = entry.statement_amount >= 0;
                      return (
                        <div
                          key={entry.id}
                          onClick={() => {
                            if (entry.is_matched) {
                              setUnmatchConfirm(entry.id);
                            } else {
                              setSelectedStatementId(isSelected ? null : entry.id);
                            }
                          }}
                          className={`px-4 py-2.5 cursor-pointer transition-colors ${
                            entry.is_matched
                              ? 'bg-emerald-50/50 hover:bg-emerald-50'
                              : isSelected
                                ? 'bg-brand-50 ring-1 ring-brand-300'
                                : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">{formatDate(entry.statement_date)}</span>
                                {entry.statement_reference && (
                                  <span className="font-mono text-xs text-gray-400">{entry.statement_reference}</span>
                                )}
                                {entry.is_matched && (
                                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              {entry.statement_description && (
                                <div className="text-sm text-gray-600 truncate mt-0.5">{entry.statement_description}</div>
                              )}
                            </div>
                            <span className={`font-tabular font-medium text-sm ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                              {isPositive ? '+' : ''}{formatCurrency(entry.statement_amount)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Panel: Book Entries (Ledger) */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-700 text-sm">Book Entries (Ledger)</h3>
                </div>
                <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-100">
                  {ledgerEntries.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">No ledger entries for this period</div>
                  ) : (
                    ledgerEntries.map((entry) => {
                      const isSelected = selectedLedgerId === entry.id;
                      const net = (entry.debit_amount || 0) - (entry.credit_amount || 0);
                      const canSelect = !!selectedStatementId;
                      return (
                        <div
                          key={entry.id}
                          onClick={() => {
                            if (!canSelect) return;
                            setSelectedLedgerId(isSelected ? null : entry.id);
                          }}
                          className={`px-4 py-2.5 transition-colors ${
                            canSelect ? 'cursor-pointer' : 'cursor-default'
                          } ${isSelected ? 'bg-brand-50 ring-1 ring-brand-300' : canSelect ? 'hover:bg-gray-50' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">{formatDate(entry.voucher_date)}</span>
                                <span className="font-mono text-xs text-brand-600">{entry.voucher_number}</span>
                              </div>
                              {entry.narration && (
                                <div className="text-sm text-gray-600 truncate mt-0.5">{entry.narration}</div>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              {entry.debit_amount > 0 && (
                                <div className="text-sm font-tabular text-emerald-600">
                                  <AmountDisplay value={entry.debit_amount} /> <span className="text-xs text-gray-400">Dr</span>
                                </div>
                              )}
                              {entry.credit_amount > 0 && (
                                <div className="text-sm font-tabular text-red-600">
                                  <AmountDisplay value={entry.credit_amount} /> <span className="text-xs text-gray-400">Cr</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {!selectedStatementId && ledgerEntries.length > 0 && (
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400 text-center">
                    Select a statement entry first, then click a ledger entry to match
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add Entry Modal */}
      {showAddEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowAddEntry(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Statement Entry</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <Input type="date" value={addForm.date} onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                <Input value={addForm.reference} onChange={(e) => setAddForm((f) => ({ ...f, reference: e.target.value }))} placeholder="e.g. CHQ#123" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Input value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} placeholder="Payment description" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount * (positive=credit, negative=debit)</label>
                <Input type="number" value={addForm.amount} onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowAddEntry(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddEntry} disabled={addSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {addSaving ? 'Adding...' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowBulkImport(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Bulk Import Statement Entries</h3>
            <p className="text-sm text-gray-500 mb-4">Paste CSV data: date,reference,description,amount (one entry per line)</p>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              placeholder={`2025-01-15,CHQ#001,Payment from ABC Corp,25000\n2025-01-16,NEFT,Vendor payment,-15000`}
              className="font-mono text-xs"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowBulkImport(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleBulkImport} disabled={bulkSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {bulkSaving ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!unmatchConfirm}
        title="Unmatch Entry"
        message="Are you sure you want to unmatch this entry? The statement and ledger entries will become unlinked."
        variant="danger"
        confirmLabel="Unmatch"
        onConfirm={() => unmatchConfirm && handleUnmatch(unmatchConfirm)}
        onCancel={() => setUnmatchConfirm(null)}
      />
    </div>
  );
}