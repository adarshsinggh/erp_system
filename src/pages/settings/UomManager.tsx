// src/pages/settings/UomManager.tsx
import React, { useState, useEffect } from 'react';
import { mastersApi, UnitOfMeasurement, UomConversion } from '@/api/modules/masters.api';
import { DataTable, ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField, Input, Select, toast } from '@/components/shared/FormElements';
import { SearchInput } from '@/components/shared/SearchInput';
import { useDebounce } from '@/hooks';

export function UomManager() {
  const [uoms, setUoms] = useState<UnitOfMeasurement[]>([]);
  const [conversions, setConversions] = useState<UomConversion[]>([]);
  const [loadingUoms, setLoadingUoms] = useState(true);
  const [loadingConv, setLoadingConv] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const [showNewUom, setShowNewUom] = useState(false);
  const [newUom, setNewUom] = useState({ name: '', symbol: '', base_unit: '', conversion_factor: '' });
  const [uomErrors, setUomErrors] = useState<Record<string, string>>({});
  const [savingUom, setSavingUom] = useState(false);

  const [showNewConv, setShowNewConv] = useState(false);
  const [newConv, setNewConv] = useState({ from_uom_id: '', to_uom_id: '', conversion_factor: '' });
  const [convErrors, setConvErrors] = useState<Record<string, string>>({});
  const [savingConv, setSavingConv] = useState(false);

  useEffect(() => {
    loadUoms();
    loadConversions();
  }, []);

  async function loadUoms() {
    setLoadingUoms(true);
    try {
      const res = await mastersApi.listUoms();
      setUoms(res.data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingUoms(false);
    }
  }

  async function loadConversions() {
    setLoadingConv(true);
    try {
      const res = await mastersApi.listConversions();
      setConversions(res.data || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingConv(false);
    }
  }

  async function handleCreateUom() {
    const errs: Record<string, string> = {};
    if (!newUom.name.trim()) errs.name = 'Name is required';
    if (!newUom.symbol.trim()) errs.symbol = 'Symbol is required';
    setUomErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSavingUom(true);
    try {
      const payload: Partial<UnitOfMeasurement> = {
        name: newUom.name,
        symbol: newUom.symbol,
        base_unit: newUom.base_unit || undefined,
        conversion_factor: newUom.conversion_factor ? parseFloat(newUom.conversion_factor) : undefined,
      };
      await mastersApi.createUom(payload);
      toast.success('Unit of measurement created');
      setNewUom({ name: '', symbol: '', base_unit: '', conversion_factor: '' });
      setShowNewUom(false);
      loadUoms();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingUom(false);
    }
  }

  async function handleCreateConversion() {
    const errs: Record<string, string> = {};
    if (!newConv.from_uom_id) errs.from_uom_id = 'Select source UOM';
    if (!newConv.to_uom_id) errs.to_uom_id = 'Select target UOM';
    if (newConv.from_uom_id === newConv.to_uom_id) errs.to_uom_id = 'Cannot convert to same unit';
    const factor = parseFloat(newConv.conversion_factor);
    if (isNaN(factor) || factor <= 0) errs.conversion_factor = 'Factor must be positive';
    setConvErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSavingConv(true);
    try {
      await mastersApi.createConversion({
        from_uom_id: newConv.from_uom_id,
        to_uom_id: newConv.to_uom_id,
        conversion_factor: factor,
      });
      toast.success('Conversion added');
      setNewConv({ from_uom_id: '', to_uom_id: '', conversion_factor: '' });
      setShowNewConv(false);
      loadConversions();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingConv(false);
    }
  }

  const filteredUoms = debouncedSearch
    ? uoms.filter((u) =>
        u.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        u.symbol.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : uoms;

  const uomColumns: ColumnDef<UnitOfMeasurement>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
    { key: 'symbol', header: 'Symbol', render: (row) => <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{row.symbol}</span> },
    { key: 'base_unit', header: 'Base Unit' },
    { key: 'conversion_factor', header: 'Factor', align: 'right', render: (row) => row.conversion_factor ? String(row.conversion_factor) : '—' },
  ];

  const uomOptions = uoms.map((u) => ({ value: u.id, label: `${u.name} (${u.symbol})` }));

  const getUomName = (id: string) => {
    const u = uoms.find((u) => u.id === id);
    return u ? `${u.name} (${u.symbol})` : id;
  };

  return (
    <div>
      <PageHeader
        title="Units of Measurement"
        subtitle="Manage UOMs and their conversions"
      />

      {/* UOM List Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search units..." className="w-72" />
          <button
            onClick={() => setShowNewUom(!showNewUom)}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
          >
            {showNewUom ? 'Cancel' : 'Add UOM'}
          </button>
        </div>

        {showNewUom && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <FormField label="Name" required error={uomErrors.name}>
                <Input
                  value={newUom.name}
                  onChange={(e) => setNewUom((p) => ({ ...p, name: e.target.value }))}
                  error={!!uomErrors.name}
                  placeholder="e.g. Kilogram"
                  autoFocus
                />
              </FormField>
              <FormField label="Symbol" required error={uomErrors.symbol}>
                <Input
                  value={newUom.symbol}
                  onChange={(e) => setNewUom((p) => ({ ...p, symbol: e.target.value }))}
                  error={!!uomErrors.symbol}
                  placeholder="e.g. kg"
                />
              </FormField>
              <FormField label="Base Unit">
                <Input
                  value={newUom.base_unit}
                  onChange={(e) => setNewUom((p) => ({ ...p, base_unit: e.target.value }))}
                  placeholder="e.g. gram"
                />
              </FormField>
              <FormField label="Factor">
                <Input
                  type="number"
                  value={newUom.conversion_factor}
                  onChange={(e) => setNewUom((p) => ({ ...p, conversion_factor: e.target.value }))}
                  placeholder="e.g. 1000"
                  min={0}
                  step={0.001}
                />
              </FormField>
              <button
                onClick={handleCreateUom}
                disabled={savingUom}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 h-[38px]"
              >
                {savingUom ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        <DataTable
          columns={uomColumns}
          data={filteredUoms}
          loading={loadingUoms}
          total={filteredUoms.length}
          emptyMessage="No units of measurement yet"
          emptyAction={{ label: 'Add your first UOM', onClick: () => setShowNewUom(true) }}
        />
      </div>

      {/* Conversions Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">UOM Conversions</h2>
          <button
            onClick={() => setShowNewConv(!showNewConv)}
            disabled={uoms.length < 2}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {showNewConv ? 'Cancel' : 'Add Conversion'}
          </button>
        </div>

        {showNewConv && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <FormField label="From UOM" required error={convErrors.from_uom_id}>
                <Select
                  value={newConv.from_uom_id}
                  onChange={(e) => setNewConv((p) => ({ ...p, from_uom_id: e.target.value }))}
                  options={uomOptions}
                  placeholder="Select source"
                  error={!!convErrors.from_uom_id}
                />
              </FormField>
              <FormField label="To UOM" required error={convErrors.to_uom_id}>
                <Select
                  value={newConv.to_uom_id}
                  onChange={(e) => setNewConv((p) => ({ ...p, to_uom_id: e.target.value }))}
                  options={uomOptions}
                  placeholder="Select target"
                  error={!!convErrors.to_uom_id}
                />
              </FormField>
              <FormField label="Conversion Factor" required error={convErrors.conversion_factor}>
                <Input
                  type="number"
                  value={newConv.conversion_factor}
                  onChange={(e) => setNewConv((p) => ({ ...p, conversion_factor: e.target.value }))}
                  error={!!convErrors.conversion_factor}
                  placeholder="e.g. 1000"
                  min={0}
                  step={0.0001}
                />
              </FormField>
              <button
                onClick={handleCreateConversion}
                disabled={savingConv}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 h-[38px]"
              >
                {savingConv ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {loadingConv ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton h-10 rounded" />
              ))}
            </div>
          ) : conversions.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-gray-500 mb-2">No UOM conversions defined</p>
              {uoms.length >= 2 && (
                <button
                  onClick={() => setShowNewConv(true)}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  Add your first conversion →
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">From</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-16">→</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">To</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Factor</th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.from_uom_name || getUomName(c.from_uom_id)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400">→</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.to_uom_name || getUomName(c.to_uom_id)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{c.conversion_factor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}