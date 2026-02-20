import React from 'react';

// ─── Column Definition ───────────────────────────────────────────
export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => React.ReactNode;
  className?: string;
}

// ─── Props ───────────────────────────────────────────────────────
interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyField?: string;
  // Sorting
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (column: string) => void;
  // Pagination
  total?: number;
  page?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  // Selection
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  // Row click
  onRowClick?: (row: T) => void;
  // State
  loading?: boolean;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
}

// ─── Sort Icon ───────────────────────────────────────────────────
function SortIcon({ active, order }: { active: boolean; order?: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <svg className="w-3.5 h-3.5 text-gray-300 ml-1" fill="currentColor" viewBox="0 0 20 20">
        <path d="M7 3l3-3 3 3H7zM7 17l3 3 3-3H7z" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 text-brand-600 ml-1" fill="currentColor" viewBox="0 0 20 20">
      {order === 'asc' ? (
        <path d="M7 10l3-3 3 3H7z" />
      ) : (
        <path d="M7 10l3 3 3-3H7z" />
      )}
    </svg>
  );
}

// ─── Skeleton Row ────────────────────────────────────────────────
function SkeletonRow({ columns }: { columns: number }) {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 rounded" style={{ width: `${60 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── DataTable ───────────────────────────────────────────────────
export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField = 'id',
  sortBy,
  sortOrder,
  onSort,
  total = 0,
  page = 1,
  limit = 25,
  onPageChange,
  selectable = false,
  selectedIds,
  onSelectionChange,
  onRowClick,
  loading = false,
  emptyMessage = 'No records found',
  emptyAction,
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / limit);
  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  const allSelected = data.length > 0 && data.every((row) => selectedIds?.has(String(row[keyField])));

  const handleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map((row) => String(row[keyField]))));
    }
  };

  const handleSelectRow = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${
                    col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''
                  } text-${col.align || 'left'}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable && <SortIcon active={sortBy === col.key} order={sortOrder} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} columns={columns.length + (selectable ? 1 : 0)} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-gray-500 text-sm">{emptyMessage}</p>
                    {emptyAction && (
                      <button
                        onClick={emptyAction.onClick}
                        className="text-sm font-medium text-brand-600 hover:text-brand-700"
                      >
                        {emptyAction.label} →
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const id = String(row[keyField]);
                const isSelected = selectedIds?.has(id);
                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(row)}
                    className={`border-b border-gray-100 transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                    } ${isSelected ? 'bg-brand-50' : ''}`}
                  >
                    {selectable && (
                      <td className="w-12 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected || false}
                          onChange={() => handleSelectRow(id)}
                          className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-${col.align || 'left'} ${col.className || ''}`}
                      >
                        {col.render ? col.render(row) : (row[col.key] as React.ReactNode) ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {total > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <span className="text-xs text-gray-500">
            Showing {startRecord}–{endRecord} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange?.(page - 1)}
              disabled={page <= 1}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            {generatePageNumbers(page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`dots-${i}`} className="px-2 text-gray-400 text-xs">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => onPageChange?.(p as number)}
                  className={`min-w-[28px] h-7 px-1.5 text-xs font-medium rounded transition-colors ${
                    p === page
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-600 hover:bg-white hover:text-gray-900'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => onPageChange?.(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page Number Generator ───────────────────────────────────────
function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | string)[] = [1];
  if (current > 3) pages.push('...');

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}
