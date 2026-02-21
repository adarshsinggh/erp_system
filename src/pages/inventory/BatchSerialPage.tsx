// src/pages/inventory/BatchSerialPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { batchSerialApi, StockBatch, BatchMovement, BatchDistribution, SerialTraceEntry, SerialNumberEntry } from '@/api/modules/batch-serial.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AmountDisplay } from '@/components/shared/AmountDisplay';
import { Select, Input, toast } from '@/components/shared/FormElements';
import { formatDate, formatDateTime, formatIndianNumber } from '@/lib/formatters';
import type { StatusConfig } from '@/lib/constants';
import { useDebounce } from '@/hooks';

const BATCH_STATUSES: Record<string, StatusConfig> = {
  active: { label: 'Active', color: 'green' },
  depleted: { label: 'Depleted', color: 'gray' },
  expired: { label: 'Expired', color: 'red' },
  quarantine: { label: 'Quarantine', color: 'orange' },
};

const BATCH_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'depleted', label: 'Depleted' },
  { value: 'expired', label: 'Expired' },
  { value: 'quarantine', label: 'Quarantine' },
];

export function BatchSerialPage() {
  const [activeTab, setActiveTab] = useState<'batches' | 'serial'>('batches');

  return (
    <div>
      <PageHeader
        title="Batch & Serial Tracking"
        subtitle="Monitor batch lifecycle and trace serial numbers"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('batches')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'batches' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Batches
        </button>
        <button
          onClick={() => setActiveTab('serial')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'serial' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Serial Numbers
        </button>
      </div>

      {activeTab === 'batches' ? <BatchesTab /> : <SerialTab />}
    </div>
  );
}

// ─── Batches Tab ────────────────────────────────────────────────

function BatchesTab() {
  const [data, setData] = useState<StockBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  const [expiringSoonCount, setExpiringSoonCount] = useState(0);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchHistory, setBatchHistory] = useState<BatchMovement[]>([]);
  const [batchDistribution, setBatchDistribution] = useState<BatchDistribution[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    batchSerialApi.getExpiringSoon(30).then((r) => setExpiringSoonCount(r.total || (r.data || []).length)).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await batchSerialApi.list({
        page, limit,
        search: debouncedSearch || undefined,
        batch_status: statusFilter || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  async function toggleExpand(batchId: string) {
    if (expandedBatch === batchId) { setExpandedBatch(null); return; }
    setExpandedBatch(batchId);
    setDetailLoading(true);
    try {
      const [histRes, distRes] = await Promise.all([
        batchSerialApi.getHistory(batchId),
        batchSerialApi.getDistribution(batchId),
      ]);
      // getHistory returns { data: { ...batch, movements: [...] } }
      const batchDetail = histRes.data as any;
      setBatchHistory(batchDetail?.movements || []);
      setBatchDistribution(distRes.data || []);
    } catch (err: any) { toast.error(err.message); }
    finally { setDetailLoading(false); }
  }

  async function changeStatus(batchId: string, newStatus: StockBatch['status']) {
    try {
      await batchSerialApi.changeStatus(batchId, newStatus);
      toast.success('Batch status updated');
      loadData();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div>
      {/* Expiry Alert */}
      {expiringSoonCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
          <span className="text-yellow-600 text-lg">⚠</span>
          <span className="text-sm text-yellow-800 font-medium">
            {expiringSoonCount} batch{expiringSoonCount > 1 ? 'es' : ''} expiring within 30 days
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search batch, item..." className="w-72" />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={BATCH_STATUS_OPTIONS}
          placeholder="All Statuses"
        />
      </div>

      {/* Batch Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium">Batch #</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium">Item</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-32">Vendor</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-24">Mfg Date</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-24">Expiry</th>
              <th className="text-right py-2.5 px-3 text-gray-500 font-medium w-20">Initial</th>
              <th className="text-right py-2.5 px-3 text-gray-500 font-medium w-20">Current</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-28">Status</th>
              <th className="text-right py-2.5 px-3 text-gray-500 font-medium w-24">Cost</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-32">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="py-3 px-3"><div className="skeleton h-4 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr><td colSpan={10} className="py-12 text-center text-gray-400">No batches found</td></tr>
            ) : (
              data.map((batch) => {
                const isExpired = batch.expiry_date && new Date(batch.expiry_date) < new Date();
                const isNearExpiry = batch.expiry_date && !isExpired &&
                  new Date(batch.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                return (
                  <React.Fragment key={batch.id}>
                    <tr className="border-b border-gray-100 hover:bg-gray-50/50 cursor-pointer" onClick={() => toggleExpand(batch.id)}>
                      <td className="py-2 px-3">
                        <span className="font-mono text-xs font-medium text-brand-700">
                          {expandedBatch === batch.id ? '▼' : '▶'} {batch.batch_number}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-mono text-xs text-gray-500">{batch.item_code}</span>
                        <span className="text-sm text-gray-700 ml-1">{batch.item_name}</span>
                      </td>
                      <td className="py-2 px-3 text-sm text-gray-600">{batch.vendor_name || '—'}</td>
                      <td className="py-2 px-3 text-xs">{formatDate(batch.manufacturing_date)}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs ${isExpired ? 'text-red-600 font-semibold' : isNearExpiry ? 'text-orange-600 font-medium' : ''}`}>
                          {formatDate(batch.expiry_date)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-xs text-gray-500">{formatIndianNumber(batch.initial_quantity, 2)}</td>
                      <td className="py-2 px-3 text-right text-sm font-semibold">{formatIndianNumber(batch.current_quantity, 2)}</td>
                      <td className="py-2 px-3"><StatusBadge status={batch.status} statusMap={BATCH_STATUSES} /></td>
                      <td className="py-2 px-3 text-right"><AmountDisplay value={batch.unit_cost} compact /></td>
                      <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={batch.status}
                          onChange={(e) => changeStatus(batch.id, e.target.value as StockBatch['status'])}
                          options={BATCH_STATUS_OPTIONS}
                          className="!text-xs !py-0.5 !h-7"
                        />
                      </td>
                    </tr>
                    {/* Expanded detail row */}
                    {expandedBatch === batch.id && (
                      <tr>
                        <td colSpan={10} className="bg-gray-50 px-6 py-4">
                          {detailLoading ? (
                            <div className="text-sm text-gray-400 animate-pulse">Loading details...</div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Distribution */}
                              <div>
                                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Warehouse Distribution</h4>
                                {batchDistribution.length === 0 ? (
                                  <p className="text-xs text-gray-400">No distribution data</p>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead><tr className="border-b border-gray-200"><th className="text-left py-1">Warehouse</th><th className="text-right py-1">Quantity</th></tr></thead>
                                    <tbody>
                                      {batchDistribution.map((d, i) => (
                                        <tr key={i} className="border-b border-gray-100">
                                          <td className="py-1 text-gray-700">{d.warehouse_name}</td>
                                          <td className="py-1 text-right font-medium">{formatIndianNumber(d.quantity, 2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                              {/* Movement History */}
                              <div>
                                <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Movement History</h4>
                                {batchHistory.length === 0 ? (
                                  <p className="text-xs text-gray-400">No movements recorded</p>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead><tr className="border-b border-gray-200">
                                        <th className="text-left py-1">Date</th><th className="text-left py-1">Type</th>
                                        <th className="text-left py-1">Dir</th><th className="text-right py-1">Qty</th>
                                        <th className="text-left py-1">Ref</th>
                                      </tr></thead>
                                      <tbody>
                                        {batchHistory.map((m, i) => (
                                          <tr key={i} className="border-b border-gray-100">
                                            <td className="py-1">{formatDate(m.transaction_date)}</td>
                                            <td className="py-1 text-gray-600">{m.transaction_type}</td>
                                            <td className="py-1">
                                              <span className={m.direction === 'in' ? 'text-green-600' : 'text-red-600'}>
                                                {m.direction === 'in' ? '↑ IN' : '↓ OUT'}
                                              </span>
                                            </td>
                                            <td className="py-1 text-right font-medium">{formatIndianNumber(m.quantity, 2)}</td>
                                            <td className="py-1 text-gray-500 font-mono">{m.reference_number || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(page + 1)} disabled={page * limit >= total}
                className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Serial Numbers Tab ─────────────────────────────────────────

function SerialTab() {
  const [subTab, setSubTab] = useState<'list' | 'lookup'>('list');

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setSubTab('list')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            subTab === 'list' ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'text-gray-500 hover:text-gray-700 border border-transparent'
          }`}
        >
          All Serials
        </button>
        <button
          onClick={() => setSubTab('lookup')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            subTab === 'lookup' ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'text-gray-500 hover:text-gray-700 border border-transparent'
          }`}
        >
          Trace Lookup
        </button>
      </div>

      {subTab === 'list' ? <SerialListView /> : <SerialLookupView />}
    </div>
  );
}

function SerialListView() {
  const [data, setData] = useState<SerialNumberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;
  const debouncedSearch = useDebounce(search);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await batchSerialApi.listSerials({
        page, limit,
        search: debouncedSearch || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const TYPE_COLORS: Record<string, string> = {
    grn_receipt: 'text-green-600', production_in: 'text-green-600',
    production_out: 'text-red-600', sales_dispatch: 'text-red-600',
    transfer_in: 'text-blue-600', transfer_out: 'text-orange-600',
    adjustment: 'text-purple-600', scrap: 'text-gray-600',
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by serial, item..." className="w-72" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium">Serial Number</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium">Item</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-32">Warehouse</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-32">Last Transaction</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-20">Dir</th>
              <th className="text-right py-2.5 px-3 text-gray-500 font-medium w-20">Qty</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-28">Reference</th>
              <th className="text-left py-2.5 px-3 text-gray-500 font-medium w-24">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="py-3 px-3"><div className="skeleton h-4 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400">No serial numbers found</td></tr>
            ) : (
              data.map((entry, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-2 px-3">
                    <span className="font-mono text-xs font-medium text-brand-700">{entry.serial_number}</span>
                  </td>
                  <td className="py-2 px-3">
                    <span className="font-mono text-xs text-gray-500">{entry.item_code}</span>
                    <span className="text-sm text-gray-700 ml-1">{entry.item_name}</span>
                  </td>
                  <td className="py-2 px-3 text-sm text-gray-600">{entry.warehouse_name}</td>
                  <td className="py-2 px-3">
                    <span className={`text-xs font-medium ${TYPE_COLORS[entry.last_transaction_type] || 'text-gray-600'}`}>
                      {entry.last_transaction_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-xs font-semibold ${entry.last_direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                      {entry.last_direction === 'in' ? '↑ IN' : '↓ OUT'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-xs font-medium">{formatIndianNumber(entry.last_quantity, 2)}</td>
                  <td className="py-2 px-3">
                    <span className="font-mono text-xs text-brand-600">{entry.reference_number || '—'}</span>
                  </td>
                  <td className="py-2 px-3 text-xs">{formatDate(entry.last_transaction_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-xs text-gray-500">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Prev</button>
              <button onClick={() => setPage(page + 1)} disabled={page * limit >= total}
                className="px-3 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SerialLookupView() {
  const [serialNumber, setSerialNumber] = useState('');
  const [results, setResults] = useState<SerialTraceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!serialNumber.trim()) { toast.error('Enter a serial number to search'); return; }
    setLoading(true);
    setSearched(true);
    try {
      const res = await batchSerialApi.serialSearch({ serial_number: serialNumber.trim() });
      setResults(res.data || []);
      if ((res.data || []).length === 0) toast.info('No records found for this serial number');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const TYPE_COLORS: Record<string, string> = {
    grn_receipt: 'text-green-600', production_in: 'text-green-600',
    production_out: 'text-red-600', sales_dispatch: 'text-red-600',
    transfer_in: 'text-blue-600', transfer_out: 'text-orange-600',
    adjustment: 'text-purple-600', scrap: 'text-gray-600',
  };

  return (
    <div>
      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Serial Number Lookup</h3>
        <p className="text-xs text-gray-500 mb-4">Enter a serial number to view its complete traceability chain.</p>
        <div className="flex items-center gap-3">
          <Input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Enter serial number..."
            className="w-80"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          />
          <button onClick={handleSearch} disabled={loading}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {results.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-gray-300 text-4xl mb-2">🔍</div>
              <p className="text-gray-500 text-sm">No traceability records found for &quot;{serialNumber}&quot;</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-700">
                  Traceability for serial: <span className="font-mono text-brand-700">{serialNumber}</span>
                </span>
                <span className="text-xs text-gray-500 ml-2">({results.length} record{results.length !== 1 ? 's' : ''})</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium w-28">Date</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium w-32">Transaction Type</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium w-20">Direction</th>
                    <th className="text-right py-2 px-3 text-gray-500 font-medium w-20">Qty</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium w-32">Warehouse</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium w-32">Reference #</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Narration</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((entry, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2 px-3 text-xs">{formatDate(entry.transaction_date)}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs font-medium ${TYPE_COLORS[entry.transaction_type] || 'text-gray-600'}`}>
                          {entry.transaction_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`text-xs font-semibold ${entry.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                          {entry.direction === 'in' ? '↑ IN' : '↓ OUT'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-xs font-medium">{formatIndianNumber(entry.quantity, 2)}</td>
                      <td className="py-2 px-3 text-xs text-gray-600">{entry.warehouse_name}</td>
                      <td className="py-2 px-3">
                        <span className="font-mono text-xs text-brand-600">{entry.reference_number || '—'}</span>
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-500">{entry.narration || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}