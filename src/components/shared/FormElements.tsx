import React, { useState } from 'react';

// ─── FormField ───────────────────────────────────────────────────
interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, error, required, hint, className = '', children }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ─── Input (styled) ──────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function Input({ error, className = '', ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 text-sm bg-white border rounded-lg transition-shadow
        placeholder:text-gray-400
        focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
        disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
        ${error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300'}
        ${className}`}
    />
  );
}

// ─── Select (styled) ─────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ error, options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 text-sm bg-white border rounded-lg transition-shadow appearance-none
        focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
        disabled:bg-gray-50 disabled:text-gray-500
        ${error ? 'border-red-300' : 'border-gray-300'}
        ${className}`}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ─── Textarea (styled) ───────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function Textarea({ error, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 text-sm bg-white border rounded-lg transition-shadow resize-none
        placeholder:text-gray-400
        focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
        disabled:bg-gray-50
        ${error ? 'border-red-300' : 'border-gray-300'}
        ${className}`}
    />
  );
}

// ─── ConfirmDialog ───────────────────────────────────────────────
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-fade-in">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${
              variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: React.ReactNode;
  message: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {icon || (
        <svg className="w-16 h-16 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      )}
      <p className="text-gray-500 text-sm mb-3">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

// ─── LoadingSkeleton ─────────────────────────────────────────────
interface LoadingSkeletonProps {
  rows?: number;
  columns?: number;
}

export function LoadingSkeleton({ rows = 5, columns = 4 }: LoadingSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="skeleton h-4 rounded flex-1"
              style={{ animationDelay: `${(r * columns + c) * 50}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Toast (simple) ──────────────────────────────────────────────
// Using a simple approach; can be replaced with sonner later
type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

let toastId = 0;
const listeners: Set<(toasts: ToastItem[]) => void> = new Set();
let toasts: ToastItem[] = [];

function notifyListeners() {
  listeners.forEach((fn) => fn([...toasts]));
}

export const toast = {
  success: (message: string) => addToast('success', message),
  error: (message: string) => addToast('error', message),
  info: (message: string) => addToast('info', message),
};

function addToast(type: ToastType, message: string) {
  const id = ++toastId;
  toasts = [...toasts, { id, type, message }];
  notifyListeners();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, 4000);
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  React.useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);

  if (items.length === 0) return null;

  const iconMap: Record<ToastType, { bg: string; icon: string }> = {
    success: { bg: 'bg-emerald-50 border-emerald-200', icon: '✓' },
    error: { bg: 'bg-red-50 border-red-200', icon: '✕' },
    info: { bg: 'bg-blue-50 border-blue-200', icon: 'i' },
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {items.map((t) => (
        <div key={t.id} className={`px-4 py-3 rounded-lg border shadow-lg text-sm animate-slide-in ${iconMap[t.type].bg}`}>
          <span className="font-medium mr-2">{iconMap[t.type].icon}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
