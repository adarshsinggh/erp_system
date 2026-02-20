import React from 'react';
import { formatCurrency, formatCurrencyCompact } from '../../lib/formatters';

interface AmountDisplayProps {
  value: number | string | null | undefined;
  compact?: boolean;
  decimals?: number;
  className?: string;
  showSign?: boolean;
  colorCode?: boolean; // green for positive, red for negative
}

export function AmountDisplay({
  value,
  compact = false,
  decimals = 2,
  className = '',
  showSign = false,
  colorCode = false,
}: AmountDisplayProps) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const formatted = compact ? formatCurrencyCompact(value) : formatCurrency(value, decimals);

  let colorClass = '';
  if (colorCode && num !== null && num !== undefined && !isNaN(num)) {
    colorClass = num > 0 ? 'text-emerald-600' : num < 0 ? 'text-red-600' : '';
  }

  const sign = showSign && num !== null && num !== undefined && !isNaN(num) && num > 0 ? '+' : '';

  return (
    <span className={`font-tabular whitespace-nowrap ${colorClass} ${className}`}>
      {sign}{formatted}
    </span>
  );
}
