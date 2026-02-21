import dayjs from 'dayjs';

// ─── Indian Number Formatting ────────────────────────────────────
// Indian system: 1,23,456.78 (not 123,456.78)
export function formatIndianNumber(value: number | string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';

  const isNegative = num < 0;
  const abs = Math.abs(num);
  const [intPart, decPart] = abs.toFixed(decimals).split('.');

  // Indian grouping: last 3, then groups of 2
  let formatted = '';
  if (intPart.length <= 3) {
    formatted = intPart;
  } else {
    const last3 = intPart.slice(-3);
    const remaining = intPart.slice(0, -3);
    const groups: string[] = [];
    let i = remaining.length;
    while (i > 0) {
      const start = Math.max(0, i - 2);
      groups.unshift(remaining.slice(start, i));
      i = start;
    }
    formatted = groups.join(',') + ',' + last3;
  }

  const result = decimals > 0 ? `${formatted}.${decPart}` : formatted;
  return isNegative ? `-${result}` : result;
}

export function formatCurrency(value: number | string | null | undefined, decimals = 2): string {
  const formatted = formatIndianNumber(value, decimals);
  if (formatted === '—') return formatted;
  return `₹${formatted}`;
}

// Compact format: ₹1.2L, ₹85K, ₹12.5Cr
export function formatCurrencyCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';

  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

// ─── Date Formatting ─────────────────────────────────────────────

/** Extract YYYY-MM-DD from any date representation without timezone shift */
export function toDateString(value: string | Date | null | undefined): string {
  if (!value) return '';
  const s = typeof value === 'string' ? value : value.toISOString();
  return s.substring(0, 10);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  // Parse as local date to avoid timezone shift on date-only values
  const dateStr = typeof value === 'string' ? value : value.toISOString();
  const ymd = dateStr.substring(0, 10); // YYYY-MM-DD
  return dayjs(ymd).format('DD MMM YYYY');
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format('DD MMM YYYY, hh:mm A');
}

export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format('DD/MM/YY');
}

export function formatRelativeDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = dayjs(value);
  const now = dayjs();
  const diff = now.diff(d, 'day');

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`;
  return d.format('DD MMM YYYY');
}

// ─── Percentage Formatting ───────────────────────────────────────
export function formatPercent(value: any, decimals = 1): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return '—';
  return `${num.toFixed(decimals)}%`;
}

// ─── Quantity Formatting ─────────────────────────────────────────
export function formatQty(value: number | null | undefined, uom?: string, decimals = 2): string {
  if (value === null || value === undefined) return '—';
  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(decimals);
  return uom ? `${formatted} ${uom}` : formatted;
}

// ─── GSTIN Formatting ────────────────────────────────────────────
export function formatGSTIN(gstin: string | null | undefined): string {
  if (!gstin) return '—';
  // Format: 22-AAAAA0000A-1Z5
  if (gstin.length === 15) {
    return `${gstin.slice(0, 2)}-${gstin.slice(2, 12)}-${gstin.slice(12)}`;
  }
  return gstin;
}

// ─── Truncate ────────────────────────────────────────────────────
export function truncate(str: string | null | undefined, maxLength = 40): string {
  if (!str) return '—';
  return str.length > maxLength ? str.slice(0, maxLength) + '…' : str;
}
