// src/pages/finance/LedgerPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  financeApi, ChartAccount, LedgerEntry, TrialBalanceRow,
  ProfitAndLossData, BalanceSheetData, OutstandingEntry, AccountType,
} from '@/api/modules/finance.api';
import { PageHeader } from '@/components/shared/PageHeader';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SearchInput } from '@/components/shared/SearchInput';
import { Select, Input, toast } from '@/components/shared/FormElements';
import { formatDate, formatCurrency, formatIndianNumber } from '@/lib/formatters';
import { ACCOUNT_TYPES, VOUCHER_TYPES } from '@/lib/constants';
import { useDebounce } from '@/hooks';

type TabId = 'account-ledger' | 'trial-balance' | 'profit-loss' | 'balance-sheet' | 'outstandings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'account-ledger', label: 'Account Ledger' },
  { id: 'trial-balance', label: 'Trial Balance' },
  { id: 'profit-loss', label: 'Profit & Loss' },
  { id: 'balance-sheet', label: 'Balance Sheet' },
  { id: 'outstandings', label: 'Outstandings' },
];

export function LedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'account-ledger';
  const initialAccountId = searchParams.get('account') || '';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
  }

  return (
    <div>
      <PageHeader
        title="Financial Ledger"
        subtitle="View account ledgers, trial balance, and financial statements"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'account-ledger' && <AccountLedgerTab initialAccountId={initialAccountId} />}
      {activeTab === 'trial-balance' && <TrialBalanceTab />}
      {activeTab === 'profit-loss' && <ProfitLossTab />}
      {activeTab === 'balance-sheet' && <BalanceSheetTab />}
      {activeTab === 'outstandings' && <OutstandingsTab />}
    </div>
  );
}

// ─── Account Ledger Tab ────────────────────────────────────────

function AccountLedgerTab({ initialAccountId }: { initialAccountId: string }) {
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState(initialAccountId);
  const [accountSearch, setAccountSearch] = useState('');
  const debouncedAccountSearch = useDebounce(accountSearch, 300);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Load accounts for dropdown
  useEffect(() => {
    financeApi.accounts.list({ limit: 500, search: debouncedAccountSearch || undefined })
      .then((res) => setAccounts(res.data || []))
      .catch(() => {});
  }, [debouncedAccountSearch]);

  // Load ledger
  const loadLedger = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      const res = await financeApi.ledger.accountLedger(selectedAccount, {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        page,
        limit,
      });
      setEntries(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, fromDate, toDate, page]);

  useEffect(() => {
    if (selectedAccount) loadLedger();
  }, [loadLedger]);

  useEffect(() => { setPage(1); }, [selectedAccount, fromDate, toDate]);

  // Totals
  const totals = useMemo(() => {
    let debit = 0, credit = 0;
    for (const e of entries) {
      debit += e.debit_amount || 0;
      credit += e.credit_amount || 0;
    }
    return { debit, credit, balance: debit - credit };
  }, [entries]);

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.account_code} — ${a.account_name}`,
  }));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
            <Select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              options={accountOptions}
              placeholder="Select an account..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </div>

      {!selectedAccount ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-sm text-gray-500">Select an account to view its ledger</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <div className="skeleton h-4 w-20 rounded" />
                  <div className="skeleton h-4 flex-1 rounded" />
                  <div className="skeleton h-4 w-24 rounded" />
                  <div className="skeleton h-4 w-24 rounded" />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">No entries found for this account</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Voucher #</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Narration</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Debit (₹)</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Credit (₹)</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDate(entry.voucher_date)}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs text-brand-700 font-medium">{entry.voucher_number}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={entry.voucher_type} statusMap={VOUCHER_TYPES} />
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">{entry.narration || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-tabular">
                          {entry.debit_amount > 0 ? <AmountDisplay value={entry.debit_amount} /> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-tabular">
                          {entry.credit_amount > 0 ? <AmountDisplay value={entry.credit_amount} /> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-tabular font-medium">
                          {entry.running_balance !== undefined ? <AmountDisplay value={entry.running_balance} /> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr className="font-semibold">
                      <td className="px-4 py-3" colSpan={4}>Totals</td>
                      <td className="px-4 py-3 text-right"><AmountDisplay value={totals.debit} /></td>
                      <td className="px-4 py-3 text-right"><AmountDisplay value={totals.credit} /></td>
                      <td className="px-4 py-3 text-right">
                        <AmountDisplay value={Math.abs(totals.balance)} />
                        <span className="ml-1 text-xs text-gray-500">{totals.balance >= 0 ? 'Dr' : 'Cr'}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {total > limit && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
                  <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                      className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
                    <button onClick={() => setPage((p) => p + 1)} disabled={page * limit >= total}
                      className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Trial Balance Tab ─────────────────────────────────────────

function TrialBalanceTab() {
  const [asOfDate, setAsOfDate] = useState('');
  const [data, setData] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadTrialBalance() {
    setLoading(true);
    try {
      const res = await financeApi.ledger.trialBalance({
        as_of_date: asOfDate || undefined,
      });
      setData(res.data || []);
      setLoaded(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTrialBalance(); }, []);

  const totals = useMemo(() => {
    let debit = 0, credit = 0;
    for (const row of data) {
      debit += row.debit_total || 0;
      credit += row.credit_total || 0;
    }
    return { debit, credit, diff: Math.abs(debit - credit), balanced: Math.abs(debit - credit) < 0.01 };
  }, [data]);

  // Group by account_type
  const grouped = useMemo(() => {
    const groups: Record<string, TrialBalanceRow[]> = {};
    for (const row of data) {
      if (!groups[row.account_type]) groups[row.account_type] = [];
      groups[row.account_type].push(row);
    }
    return groups;
  }, [data]);

  const typeOrder: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">As of Date</label>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <button onClick={loadTrialBalance} disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {loading ? 'Loading...' : 'Generate'}
          </button>
          {loaded && (
            <div className={`ml-auto px-3 py-1.5 rounded-lg text-sm font-medium ${
              totals.balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {totals.balanced ? '✓ Balanced' : `⚠ Difference: ${formatCurrency(totals.diff)}`}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4"><div className="skeleton h-4 flex-1 rounded" /></div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-500">
          {loaded ? 'No accounts with balances found' : 'Click "Generate" to view trial balance'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Account</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Group</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Debit (₹)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Credit (₹)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Balance</th>
                </tr>
              </thead>
              <tbody>
                {typeOrder.map((type) => {
                  const rows = grouped[type];
                  if (!rows?.length) return null;
                  const typeDebit = rows.reduce((s, r) => s + (r.debit_total || 0), 0);
                  const typeCredit = rows.reduce((s, r) => s + (r.credit_total || 0), 0);
                  return (
                    <React.Fragment key={type}>
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-2 font-semibold text-gray-700">
                          <StatusBadge status={type} statusMap={ACCOUNT_TYPES} size="md" />
                        </td>
                      </tr>
                      {rows.map((row) => (
                        <tr key={row.account_id} className="hover:bg-gray-50 border-b border-gray-50">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{row.account_code}</td>
                          <td className="px-4 py-2.5 text-gray-900">{row.account_name}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">{row.account_group}</td>
                          <td className="px-4 py-2.5 text-right font-tabular">
                            {row.debit_total > 0 ? <AmountDisplay value={row.debit_total} /> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-tabular">
                            {row.credit_total > 0 ? <AmountDisplay value={row.credit_total} /> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-tabular font-medium">
                            <AmountDisplay value={row.closing_balance} />
                            <span className="ml-1 text-xs text-gray-400">{row.closing_type === 'debit' ? 'Dr' : 'Cr'}</span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <td colSpan={3} className="px-4 py-2 text-right text-xs font-medium text-gray-500">Subtotal</td>
                        <td className="px-4 py-2 text-right font-tabular font-medium"><AmountDisplay value={typeDebit} /></td>
                        <td className="px-4 py-2 text-right font-tabular font-medium"><AmountDisplay value={typeCredit} /></td>
                        <td />
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                <tr className="font-bold">
                  <td colSpan={3} className="px-4 py-3 text-right">Grand Total</td>
                  <td className="px-4 py-3 text-right"><AmountDisplay value={totals.debit} /></td>
                  <td className="px-4 py-3 text-right"><AmountDisplay value={totals.credit} /></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profit & Loss Tab ─────────────────────────────────────────

function ProfitLossTab() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState<ProfitAndLossData | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadPL() {
    if (!fromDate || !toDate) {
      toast.error('Both From Date and To Date are required');
      return;
    }
    setLoading(true);
    try {
      const res = await financeApi.ledger.profitAndLoss({ from_date: fromDate, to_date: toDate });
      setData(res.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date *</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date *</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <button onClick={loadPL} disabled={loading || !fromDate || !toDate}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {loading ? 'Loading...' : 'Generate'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-4 rounded" />
          ))}
        </div>
      ) : !data ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-500">
          Select date range and click "Generate" to view Profit & Loss
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Income */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100">
              <h3 className="font-semibold text-emerald-800">Income</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {(data.income || []).map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="font-mono text-xs text-gray-400 mr-2">{item.account_code}</span>
                    <span className="text-sm text-gray-700">{item.account_name}</span>
                  </div>
                  <AmountDisplay value={item.amount} className="font-medium" />
                </div>
              ))}
              {(data.income || []).length === 0 && (
                <div className="px-4 py-4 text-sm text-gray-400 text-center">No income recorded</div>
              )}
            </div>
            <div className="bg-emerald-50 px-4 py-3 border-t border-emerald-100 flex justify-between font-semibold">
              <span>Total Income</span>
              <AmountDisplay value={data.total_income} />
            </div>
          </div>

          {/* Expenses */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-red-50 px-4 py-3 border-b border-red-100">
              <h3 className="font-semibold text-red-800">Expenses</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {(data.expenses || []).map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="font-mono text-xs text-gray-400 mr-2">{item.account_code}</span>
                    <span className="text-sm text-gray-700">{item.account_name}</span>
                  </div>
                  <AmountDisplay value={item.amount} className="font-medium" />
                </div>
              ))}
              {(data.expenses || []).length === 0 && (
                <div className="px-4 py-4 text-sm text-gray-400 text-center">No expenses recorded</div>
              )}
            </div>
            <div className="bg-red-50 px-4 py-3 border-t border-red-100 flex justify-between font-semibold">
              <span>Total Expenses</span>
              <AmountDisplay value={data.total_expense} />
            </div>
          </div>

          {/* Net Result */}
          <div className={`lg:col-span-2 rounded-xl border-2 p-4 flex items-center justify-between ${
            data.net_profit >= 0
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-red-300 bg-red-50'
          }`}>
            <span className="text-lg font-semibold">
              {data.net_profit >= 0 ? 'Net Profit' : 'Net Loss'}
            </span>
            <span className={`text-2xl font-bold ${data.net_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(Math.abs(data.net_profit))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Balance Sheet Tab ─────────────────────────────────────────

function BalanceSheetTab() {
  const [asOfDate, setAsOfDate] = useState('');
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadBS() {
    if (!asOfDate) {
      toast.error('As of Date is required');
      return;
    }
    setLoading(true);
    try {
      const res = await financeApi.ledger.balanceSheet({ as_of_date: asOfDate });
      setData(res.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isBalanced = data ? Math.abs(data.total_assets - (data.total_liabilities + data.total_equity)) < 0.01 : false;

  function renderSection(title: string, items: { account_code: string; account_name: string; amount: number }[], total: number, colorClass: string) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className={`px-4 py-3 border-b ${colorClass}`}>
          <h3 className="font-semibold">{title}</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <span className="font-mono text-xs text-gray-400 mr-2">{item.account_code}</span>
                <span className="text-sm text-gray-700">{item.account_name}</span>
              </div>
              <AmountDisplay value={item.amount} className="font-medium" />
            </div>
          ))}
          {items.length === 0 && <div className="px-4 py-4 text-sm text-gray-400 text-center">No entries</div>}
        </div>
        <div className={`px-4 py-3 border-t flex justify-between font-semibold ${colorClass}`}>
          <span>Total {title}</span>
          <AmountDisplay value={total} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">As of Date *</label>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <button onClick={loadBS} disabled={loading || !asOfDate}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {loading ? 'Loading...' : 'Generate'}
          </button>
          {data && (
            <div className={`ml-auto px-3 py-1.5 rounded-lg text-sm font-medium ${
              isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {isBalanced ? '✓ Balanced' : '⚠ Mismatch!'}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-4 rounded" />)}
        </div>
      ) : !data ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-sm text-gray-500">
          Select a date and click "Generate" to view Balance Sheet
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderSection('Assets', data.assets || [], data.total_assets, 'bg-blue-50 border-blue-100 text-blue-800')}
            <div className="space-y-4">
              {renderSection('Liabilities', data.liabilities || [], data.total_liabilities, 'bg-orange-50 border-orange-100 text-orange-800')}
              {renderSection('Equity', data.equity || [], data.total_equity, 'bg-purple-50 border-purple-100 text-purple-800')}
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex items-center justify-between text-sm">
            <span className="text-gray-600">Assets: <strong>{formatCurrency(data.total_assets)}</strong></span>
            <span className="text-gray-400">=</span>
            <span className="text-gray-600">
              Liabilities + Equity: <strong>{formatCurrency(data.total_liabilities + data.total_equity)}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Outstandings Tab ──────────────────────────────────────────

function OutstandingsTab() {
  const [subTab, setSubTab] = useState<'receivables' | 'payables'>('receivables');
  const [receivables, setReceivables] = useState<OutstandingEntry[]>([]);
  const [payables, setPayables] = useState<OutstandingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [recRes, payRes] = await Promise.all([
          financeApi.ledger.outstandingReceivables(),
          financeApi.ledger.outstandingPayables(),
        ]);
        setReceivables(recRes.data || []);
        setPayables(payRes.data || []);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalReceivable = receivables.reduce((s, e) => s + (e.amount_due || 0), 0);
  const totalPayable = payables.reduce((s, e) => s + (e.amount_due || 0), 0);

  const summaryCards = [
    { label: 'Total Receivable', value: totalReceivable, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
    { label: 'Total Payable', value: totalPayable, color: 'bg-red-50 border-red-200 text-red-700' },
    { label: 'Net Position', value: totalReceivable - totalPayable, color: totalReceivable >= totalPayable ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-orange-50 border-orange-200 text-orange-700' },
  ];

  const currentData = subTab === 'receivables' ? receivables : payables;
  const partyLabel = subTab === 'receivables' ? 'Customer' : 'Vendor';

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <div key={card.label} className={`rounded-xl border p-4 ${card.color}`}>
            <div className="text-xs font-medium opacity-70 mb-1">{card.label}</div>
            <div className="text-xl font-bold">{formatCurrency(card.value)}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setSubTab('receivables')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            subTab === 'receivables' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Receivables ({receivables.length})
        </button>
        <button
          onClick={() => setSubTab('payables')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            subTab === 'payables' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Payables ({payables.length})
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4"><div className="skeleton h-4 flex-1 rounded" /></div>
            ))}
          </div>
        ) : currentData.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            No outstanding {subTab}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{partyLabel}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Document #</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Amount (₹)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Paid (₹)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Due (₹)</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Due Date</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentData.map((entry, i) => {
                  const isOverdue = entry.days_overdue !== undefined && entry.days_overdue > 0;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{entry.party_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-brand-700">{entry.document_number}</td>
                      <td className="px-4 py-2.5 text-right"><AmountDisplay value={entry.amount} /></td>
                      <td className="px-4 py-2.5 text-right text-green-600"><AmountDisplay value={entry.amount_paid} /></td>
                      <td className="px-4 py-2.5 text-right font-medium text-red-600"><AmountDisplay value={entry.amount_due} /></td>
                      <td className="px-4 py-2.5 text-gray-600">{entry.due_date ? formatDate(entry.due_date) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        {isOverdue ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-50 text-red-700">
                            {entry.days_overdue}d
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}