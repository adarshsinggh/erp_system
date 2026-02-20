// src/config/routes.tsx
import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { useAuthStore } from '../stores/authStore';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LazyPage({ component: Component }: { component: React.LazyExoticComponent<React.ComponentType> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Component />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="skeleton h-4 w-72 rounded" />
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 mt-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-4 flex-1 rounded" />
            <div className="skeleton h-4 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <svg className="w-16 h-16 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
          d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
      <h2 className="text-lg font-semibold text-gray-400">Coming Soon</h2>
      <p className="text-sm text-gray-400 mt-1">This module is under construction.</p>
    </div>
  );
}

// ─── Lazy Imports ───────────────────────────────────────────────
const LoginPage = lazy(() => import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));

// Settings (Step 2A)
const CompanyProfile = lazy(() => import('../pages/settings/CompanyProfile').then((m) => ({ default: m.CompanyProfile })));
const BranchesList = lazy(() => import('../pages/settings/BranchesList').then((m) => ({ default: m.BranchesList })));
const BranchForm = lazy(() => import('../pages/settings/BranchForm').then((m) => ({ default: m.BranchForm })));
const WarehousesList = lazy(() => import('../pages/settings/WarehousesList').then((m) => ({ default: m.WarehousesList })));
const WarehouseForm = lazy(() => import('../pages/settings/WarehouseForm').then((m) => ({ default: m.WarehouseForm })));
const UsersList = lazy(() => import('../pages/settings/UsersList').then((m) => ({ default: m.UsersList })));
const UserForm = lazy(() => import('../pages/settings/UserForm').then((m) => ({ default: m.UserForm })));
const RolesPermissions = lazy(() => import('../pages/settings/RolesPermissions').then((m) => ({ default: m.RolesPermissions })));
const TaxMastersList = lazy(() => import('../pages/settings/TaxMastersList').then((m) => ({ default: m.TaxMastersList })));
const TaxMasterForm = lazy(() => import('../pages/settings/TaxMasterForm').then((m) => ({ default: m.TaxMasterForm })));
const UomManager = lazy(() => import('../pages/settings/UomManager').then((m) => ({ default: m.UomManager })));
const CategoryTree = lazy(() => import('../pages/settings/CategoryTree').then((m) => ({ default: m.CategoryTree })));
const DocumentSequences = lazy(() => import('../pages/settings/DocumentSequences').then((m) => ({ default: m.DocumentSequences })));

// Masters (Step 2B)
const CustomersList = lazy(() => import('../pages/masters/CustomersList').then((m) => ({ default: m.CustomersList })));
const CustomerForm = lazy(() => import('../pages/masters/CustomerForm').then((m) => ({ default: m.CustomerForm })));
const VendorsList = lazy(() => import('../pages/masters/VendorsList').then((m) => ({ default: m.VendorsList })));
const VendorForm = lazy(() => import('../pages/masters/VendorForm').then((m) => ({ default: m.VendorForm })));
const ItemsList = lazy(() => import('../pages/masters/ItemsList').then((m) => ({ default: m.ItemsList })));
const ItemForm = lazy(() => import('../pages/masters/ItemForm').then((m) => ({ default: m.ItemForm })));
const ProductsList = lazy(() => import('../pages/masters/ProductsList').then((m) => ({ default: m.ProductsList })));
const ProductForm = lazy(() => import('../pages/masters/ProductForm').then((m) => ({ default: m.ProductForm })));
const BomsList = lazy(() => import('../pages/masters/BomsList').then((m) => ({ default: m.BomsList })));
const BomBuilder = lazy(() => import('../pages/masters/BomBuilder').then((m) => ({ default: m.BomBuilder })));

// Sales (Step 2C)
const QuotationsList = lazy(() => import('../pages/sales/QuotationsList').then((m) => ({ default: m.QuotationsList })));
const QuotationForm = lazy(() => import('../pages/sales/QuotationForm').then((m) => ({ default: m.QuotationForm })));
const SalesOrdersList = lazy(() => import('../pages/sales/SalesOrdersList').then((m) => ({ default: m.SalesOrdersList })));
const SalesOrderForm = lazy(() => import('../pages/sales/SalesOrderForm').then((m) => ({ default: m.SalesOrderForm })));
const DeliveryChallansList = lazy(() => import('../pages/sales/DeliveryChallansList').then((m) => ({ default: m.DeliveryChallansList })));
const DeliveryChallanForm = lazy(() => import('../pages/sales/DeliveryChallanForm').then((m) => ({ default: m.DeliveryChallanForm })));
const SalesInvoicesList = lazy(() => import('../pages/sales/SalesInvoicesList').then((m) => ({ default: m.SalesInvoicesList })));
const SalesInvoiceForm = lazy(() => import('../pages/sales/SalesInvoiceForm').then((m) => ({ default: m.SalesInvoiceForm })));
const CreditNotesList = lazy(() => import('../pages/sales/CreditNotesList').then((m) => ({ default: m.CreditNotesList })));
const CreditNoteForm = lazy(() => import('../pages/sales/CreditNoteForm').then((m) => ({ default: m.CreditNoteForm })));
const PaymentReceiptsList = lazy(() => import('../pages/sales/PaymentReceiptsList').then((m) => ({ default: m.PaymentReceiptsList })));
const PaymentReceiptForm = lazy(() => import('../pages/sales/PaymentReceiptForm').then((m) => ({ default: m.PaymentReceiptForm })));

// Helper to generate CRUD routes for a module
function crudRoutes(base: string) {
  return [
    { path: base, element: <ComingSoon /> },
    { path: `${base}/new`, element: <ComingSoon /> },
    { path: `${base}/:id`, element: <ComingSoon /> },
  ];
}

export const router = createBrowserRouter([
  { path: '/login', element: <LazyPage component={LoginPage} /> },
  {
    path: '/',
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <LazyPage component={DashboardPage} /> },

      // ─── Settings (2A) ──────────────────────────────────────
      { path: 'settings', element: <Navigate to="/settings/company" replace /> },
      { path: 'settings/company', element: <LazyPage component={CompanyProfile} /> },
      { path: 'settings/branches', element: <LazyPage component={BranchesList} /> },
      { path: 'settings/branches/new', element: <LazyPage component={BranchForm} /> },
      { path: 'settings/branches/:id', element: <LazyPage component={BranchForm} /> },
      { path: 'settings/warehouses', element: <LazyPage component={WarehousesList} /> },
      { path: 'settings/warehouses/new', element: <LazyPage component={WarehouseForm} /> },
      { path: 'settings/warehouses/:id', element: <LazyPage component={WarehouseForm} /> },
      { path: 'settings/users', element: <LazyPage component={UsersList} /> },
      { path: 'settings/users/new', element: <LazyPage component={UserForm} /> },
      { path: 'settings/users/:id', element: <LazyPage component={UserForm} /> },
      { path: 'settings/roles', element: <LazyPage component={RolesPermissions} /> },
      { path: 'settings/taxes', element: <LazyPage component={TaxMastersList} /> },
      { path: 'settings/taxes/new', element: <LazyPage component={TaxMasterForm} /> },
      { path: 'settings/taxes/:id', element: <LazyPage component={TaxMasterForm} /> },
      { path: 'settings/uom', element: <LazyPage component={UomManager} /> },
      { path: 'settings/categories', element: <LazyPage component={CategoryTree} /> },
      { path: 'settings/sequences', element: <LazyPage component={DocumentSequences} /> },

      // ─── Masters (2B) ───────────────────────────────────────
      { path: 'masters/customers', element: <LazyPage component={CustomersList} /> },
      { path: 'masters/customers/new', element: <LazyPage component={CustomerForm} /> },
      { path: 'masters/customers/:id', element: <LazyPage component={CustomerForm} /> },
      { path: 'masters/vendors', element: <LazyPage component={VendorsList} /> },
      { path: 'masters/vendors/new', element: <LazyPage component={VendorForm} /> },
      { path: 'masters/vendors/:id', element: <LazyPage component={VendorForm} /> },
      { path: 'masters/items', element: <LazyPage component={ItemsList} /> },
      { path: 'masters/items/new', element: <LazyPage component={ItemForm} /> },
      { path: 'masters/items/:id', element: <LazyPage component={ItemForm} /> },
      { path: 'masters/products', element: <LazyPage component={ProductsList} /> },
      { path: 'masters/products/new', element: <LazyPage component={ProductForm} /> },
      { path: 'masters/products/:id', element: <LazyPage component={ProductForm} /> },
      { path: 'masters/boms', element: <LazyPage component={BomsList} /> },
      { path: 'masters/boms/new', element: <LazyPage component={BomBuilder} /> },
      { path: 'masters/boms/:id', element: <LazyPage component={BomBuilder} /> },

      // ─── Sales (2C) ─────────────────────────────────────────
      { path: 'sales/quotations', element: <LazyPage component={QuotationsList} /> },
      { path: 'sales/quotations/new', element: <LazyPage component={QuotationForm} /> },
      { path: 'sales/quotations/:id', element: <LazyPage component={QuotationForm} /> },
      { path: 'sales/orders', element: <LazyPage component={SalesOrdersList} /> },
      { path: 'sales/orders/new', element: <LazyPage component={SalesOrderForm} /> },
      { path: 'sales/orders/:id', element: <LazyPage component={SalesOrderForm} /> },
      { path: 'sales/challans', element: <LazyPage component={DeliveryChallansList} /> },
      { path: 'sales/challans/new', element: <LazyPage component={DeliveryChallanForm} /> },
      { path: 'sales/challans/:id', element: <LazyPage component={DeliveryChallanForm} /> },
      { path: 'sales/invoices', element: <LazyPage component={SalesInvoicesList} /> },
      { path: 'sales/invoices/new', element: <LazyPage component={SalesInvoiceForm} /> },
      { path: 'sales/invoices/:id', element: <LazyPage component={SalesInvoiceForm} /> },
      { path: 'sales/credit-notes', element: <LazyPage component={CreditNotesList} /> },
      { path: 'sales/credit-notes/new', element: <LazyPage component={CreditNoteForm} /> },
      { path: 'sales/credit-notes/:id', element: <LazyPage component={CreditNoteForm} /> },
      { path: 'sales/payments', element: <LazyPage component={PaymentReceiptsList} /> },
      { path: 'sales/payments/new', element: <LazyPage component={PaymentReceiptForm} /> },
      { path: 'sales/payments/:id', element: <LazyPage component={PaymentReceiptForm} /> },

      // ─── Purchase (2D) ──────────────────────────────────────
      ...crudRoutes('purchase/requisitions'),
      ...crudRoutes('purchase/orders'),
      ...crudRoutes('purchase/grn'),
      ...crudRoutes('purchase/bills'),
      ...crudRoutes('purchase/debit-notes'),
      ...crudRoutes('purchase/payments'),

      // ─── Inventory (2E) ─────────────────────────────────────
      { path: 'inventory/stock', element: <ComingSoon /> },
      ...crudRoutes('inventory/transfers'),
      ...crudRoutes('inventory/adjustments'),
      { path: 'inventory/batch-serial', element: <ComingSoon /> },

      // ─── Manufacturing (2F) ─────────────────────────────────
      ...crudRoutes('manufacturing/work-orders'),
      ...crudRoutes('manufacturing/production'),
      ...crudRoutes('manufacturing/scrap'),

      // ─── Finance (2G) ───────────────────────────────────────
      { path: 'finance/accounts', element: <ComingSoon /> },
      { path: 'finance/ledger', element: <ComingSoon /> },
      ...crudRoutes('finance/banks'),
      { path: 'finance/reconciliation', element: <ComingSoon /> },

      // ─── Approvals (2H) ─────────────────────────────────────
      { path: 'approvals', element: <ComingSoon /> },
      { path: 'approvals/matrix', element: <ComingSoon /> },

      // ─── Reports (2I) ───────────────────────────────────────
      { path: 'reports/viewer', element: <ComingSoon /> },
      { path: 'reports/gst', element: <ComingSoon /> },
      { path: 'reports/insights', element: <ComingSoon /> },

      // ─── System (2J) ────────────────────────────────────────
      ...crudRoutes('system/alert-rules'),
      { path: 'system/notifications', element: <ComingSoon /> },
      { path: 'system/backups', element: <ComingSoon /> },
      { path: 'system/shortcuts', element: <ComingSoon /> },

      // ─── Catch-all ──────────────────────────────────────────
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);