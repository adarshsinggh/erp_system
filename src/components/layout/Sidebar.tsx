import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '../../stores/uiStore';

// ─── Navigation Config ───────────────────────────────────────────
interface NavItem {
  label: string;
  path: string;
  icon: string;
}

interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Sales', icon: 'receipt',
    items: [
      { label: 'Quotations', path: '/sales/quotations', icon: 'file-text' },
      { label: 'Sales Orders', path: '/sales/orders', icon: 'shopping-cart' },
      { label: 'Delivery Challans', path: '/sales/challans', icon: 'truck' },
      { label: 'Invoices', path: '/sales/invoices', icon: 'file-invoice' },
      { label: 'Credit Notes', path: '/sales/credit-notes', icon: 'file-minus' },
      { label: 'Payments', path: '/sales/payments', icon: 'credit-card' },
    ],
  },
  {
    label: 'Purchase', icon: 'package',
    items: [
      { label: 'Requisitions', path: '/purchase/requisitions', icon: 'clipboard' },
      { label: 'Purchase Orders', path: '/purchase/orders', icon: 'shopping-bag' },
      { label: 'Goods Receipt', path: '/purchase/grn', icon: 'download' },
      { label: 'Vendor Bills', path: '/purchase/bills', icon: 'file-text' },
      { label: 'Debit Notes', path: '/purchase/debit-notes', icon: 'file-minus' },
      { label: 'Payments', path: '/purchase/payments', icon: 'credit-card' },
    ],
  },
  {
    label: 'Inventory', icon: 'box',
    items: [
      { label: 'Stock Summary', path: '/inventory/stock', icon: 'bar-chart' },
      { label: 'Stock Ledger', path: '/inventory/stock-ledger', icon: 'book-open' },
      { label: 'Transfers', path: '/inventory/transfers', icon: 'repeat' },
      { label: 'Adjustments', path: '/inventory/adjustments', icon: 'sliders' },
      { label: 'Batch & Serial', path: '/inventory/batch-serial', icon: 'hash' },
    ],
  },
  {
    label: 'Manufacturing', icon: 'settings',
    items: [
      { label: 'Work Orders', path: '/manufacturing/work-orders', icon: 'tool' },
      { label: 'Production', path: '/manufacturing/production', icon: 'activity' },
      { label: 'Scrap', path: '/manufacturing/scrap', icon: 'trash-2' },
    ],
  },
  {
    label: 'Finance', icon: 'dollar-sign',
    items: [
      { label: 'Chart of Accounts', path: '/finance/accounts', icon: 'list' },
      { label: 'Ledger', path: '/finance/ledger', icon: 'book-open' },
      { label: 'Bank Accounts', path: '/finance/banks', icon: 'landmark' },
      { label: 'Reconciliation', path: '/finance/reconciliation', icon: 'check-circle' },
    ],
  },
  {
    label: 'Masters', icon: 'database',
    items: [
      { label: 'Customers', path: '/masters/customers', icon: 'users' },
      { label: 'Vendors', path: '/masters/vendors', icon: 'truck' },
      { label: 'Items', path: '/masters/items', icon: 'package' },
      { label: 'Products', path: '/masters/products', icon: 'box' },
      { label: 'Bill of Materials', path: '/masters/boms', icon: 'layers' },
    ],
  },
  {
    label: 'Reports', icon: 'pie-chart',
    items: [
      { label: 'Report Viewer', path: '/reports/viewer', icon: 'file-text' },
      { label: 'GST Reports', path: '/reports/gst', icon: 'percent' },
      { label: 'Insights', path: '/reports/insights', icon: 'trending-up' },
    ],
  },
  {
    label: 'System', icon: 'settings',
    items: [
      { label: 'Alert Rules', path: '/system/alert-rules', icon: 'bell' },
      { label: 'Notifications', path: '/system/notifications', icon: 'inbox' },
      { label: 'Backups', path: '/system/backups', icon: 'database' },
    ],
  },
];

const NAV_BOTTOM: NavItem[] = [
  { label: 'Approvals', path: '/approvals', icon: 'check-square' },
  { label: 'Settings', path: '/settings', icon: 'settings' },
];

// ─── Simple Icon Component (SVG paths) ──────────────────────────
function NavIcon({ name, className = 'w-4 h-4' }: { name: string; className?: string }) {
  // Using simple generic icons; replace with lucide-react later
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      {iconPaths[name] || <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

const iconPaths: Record<string, React.ReactNode> = {
  'home': <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />,
  'receipt': <path d="M9 5H7a2 2 0 00-2 2v12l4-3 4 3V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />,
  'package': <><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></>,
  'box': <><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></>,
  'settings': <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></>,
  'dollar-sign': <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
  'database': <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></>,
  'pie-chart': <><path d="M21.21 15.89A10 10 0 118 2.83" /><path d="M22 12A10 10 0 0012 2v10z" /></>,
  'check-square': <><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></>,
  'chevron-right': <polyline points="9 18 15 12 9 6" />,
  'chevron-down': <polyline points="6 9 12 15 18 9" />,
  'menu': <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>,
  'bell': <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />,
  'inbox': <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" /></>,
};

// ─── Sidebar Component ──────────────────────────────────────────
export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(NAV_GROUPS.filter((g) => g.items.some((i) => location.pathname.startsWith(i.path))).map((g) => g.label))
  );

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-nav-bg text-nav-text flex flex-col z-30 transition-all duration-200 ${
        sidebarCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo / Brand */}
      <div className="flex items-center h-14 px-4 border-b border-white/10 flex-shrink-0">
        {!sidebarCollapsed && (
          <span className="text-sm font-bold text-white tracking-wide">Manufacturing ERP</span>
        )}
        <button
          onClick={toggleSidebar}
          className={`p-1.5 text-nav-text hover:text-white hover:bg-nav-hover rounded-lg transition-colors ${
            sidebarCollapsed ? 'mx-auto' : 'ml-auto'
          }`}
        >
          <NavIcon name="menu" />
        </button>
      </div>

      {/* Dashboard Link */}
      <div className="px-2 mt-3 mb-1">
        <button
          onClick={() => navigate('/')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            location.pathname === '/' ? 'bg-nav-active text-nav-text-active' : 'hover:bg-nav-hover'
          }`}
        >
          <NavIcon name="home" />
          {!sidebarCollapsed && <span>Dashboard</span>}
        </button>
      </div>

      {/* Scrollable Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {NAV_GROUPS.map((group) => {
          const isExpanded = expandedGroups.has(group.label);
          const hasActive = group.items.some((i) => isActive(i.path));

          return (
            <div key={group.label}>
              <button
                onClick={() => sidebarCollapsed ? undefined : toggleGroup(group.label)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  hasActive ? 'text-nav-text-active bg-nav-hover' : 'hover:bg-nav-hover'
                }`}
              >
                <NavIcon name={group.icon} />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left">{group.label}</span>
                    <NavIcon
                      name={isExpanded ? 'chevron-down' : 'chevron-right'}
                      className="w-3.5 h-3.5 text-gray-500"
                    />
                  </>
                )}
              </button>

              {/* Sub-items */}
              {!sidebarCollapsed && isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                  {group.items.map((item) => (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
                        isActive(item.path)
                          ? 'text-white bg-brand-600/30 font-medium'
                          : 'text-nav-text hover:text-nav-text-active hover:bg-nav-hover'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom Links */}
      <div className="px-2 py-3 border-t border-white/10 space-y-0.5 flex-shrink-0">
        {NAV_BOTTOM.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive(item.path) ? 'bg-nav-active text-nav-text-active' : 'hover:bg-nav-hover'
            }`}
          >
            <NavIcon name={item.icon} />
            {!sidebarCollapsed && <span>{item.label}</span>}
          </button>
        ))}
      </div>
    </aside>
  );
}