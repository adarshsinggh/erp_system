import { useState, useEffect, useCallback, useRef } from 'react';

// ─── useDebounce ─────────────────────────────────────────────────
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ─── usePagination ───────────────────────────────────────────────
export interface PaginationState {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  search: string;
}

export function usePagination(defaults?: Partial<PaginationState>) {
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 25,
    sortBy: defaults?.sortBy || 'created_at',
    sortOrder: defaults?.sortOrder || 'desc',
    search: '',
    ...defaults,
  });

  const setPage = useCallback((page: number) => setPagination((p) => ({ ...p, page })), []);
  const setLimit = useCallback((limit: number) => setPagination((p) => ({ ...p, limit, page: 1 })), []);
  const setSearch = useCallback((search: string) => setPagination((p) => ({ ...p, search, page: 1 })), []);
  const toggleSort = useCallback((column: string) => {
    setPagination((p) => ({
      ...p,
      sortBy: column,
      sortOrder: p.sortBy === column && p.sortOrder === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  }, []);

  return { ...pagination, setPage, setLimit, setSearch, toggleSort, setPagination };
}

// ─── useKeyboardShortcuts ────────────────────────────────────────
type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true) {
  // Use ref to avoid effect re-running on every render when shortcuts object is inline
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Build key string: ctrl+shift+k
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('ctrl');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(e.key.toLowerCase());
      const combo = parts.join('+');

      const action = shortcutsRef.current[combo];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        action(e);
      }
    };

    window.addEventListener('keydown', handler, true); // Use capture phase
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled]);
}

// ─── useFormDirty ────────────────────────────────────────────────
export function useFormDirty(isDirty: boolean) {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

// ─── useClickOutside ─────────────────────────────────────────────
export function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

// ─── useLocalStorage ─────────────────────────────────────────────
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [stored, setStored] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setValue = useCallback((value: T) => {
    setStored(value);
    localStorage.setItem(key, JSON.stringify(value));
  }, [key]);

  return [stored, setValue];
}
