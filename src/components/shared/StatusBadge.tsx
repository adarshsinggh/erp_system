import React from 'react';
import type { StatusColor, StatusConfig } from '../../lib/constants';

interface StatusBadgeProps {
  status: string;
  statusMap?: Record<string, StatusConfig>;
  size?: 'sm' | 'md';
}

const colorClasses: Record<StatusColor, string> = {
  gray: 'bg-gray-100 text-gray-700',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  yellow: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  purple: 'bg-purple-50 text-purple-700',
  orange: 'bg-orange-50 text-orange-700',
  pink: 'bg-pink-50 text-pink-700',
};

const dotClasses: Record<StatusColor, string> = {
  gray: 'bg-gray-400',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  yellow: 'bg-amber-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
};

export function StatusBadge({ status, statusMap, size = 'sm' }: StatusBadgeProps) {
  const config = statusMap?.[status];
  const label = config?.label || status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const color: StatusColor = config?.color || 'gray';

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full ${sizeClasses} ${colorClasses[color]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClasses[color]}`} />
      {label}
    </span>
  );
}
