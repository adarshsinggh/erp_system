// src/config/routes.tsx
import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { useAuthStore } from '../stores/authStore';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, token } = useAuthStore();
  if (!isAuthenticated || !token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Retry wrapper for lazy imports — handles Vite chunk fetch failures
function lazyRetry(factory: () => Promise<any>, retries = 2): React.LazyExoticComponent<React.ComponentType> {
  return lazy(() =>
    factory().catch((err: any) => {
      if (retries > 0) {
        return new Promise<any>((resolve) => setTimeout(resolve, 500)).then(() => lazyRetry(factory, retries - 1) as any);
      }
      // Final failure — force reload to get fresh chunks
      if (!sessionStorage.getItem('chunk_reload')) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
      }
      throw err;
    })
  );
}

class LazyErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
          <p className="text-sm text-gray-600 mb-4">Something went wrong loading this page.</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-4 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LazyPage({ component: Component }: { component: React.LazyExoticComponent<React.ComponentType> }) {
  return (
    <LazyErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>
        <Component />
      </Suspense>
    </LazyErrorBoundary>
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

// ─── Lazy Imports (all use lazyRetry for chunk-failure resilience) ─
const LoginPage = lazyRetry(() => import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazyRetry(() => import('../pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const NotFoundPage = lazyRetry(() => import('../pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

// Settings (Step 2A)
const CompanyProfile = lazyRetry(() => import('../pages/settings/CompanyProfile').then((m) => ({ default: m.CompanyProfile })));
const BranchesList = lazyRetry(() => import('../pages/settings/BranchesList').then((m) => ({ default: m.BranchesList })));
const BranchForm = lazyRetry(() => import('../pages/settings/BranchForm').then((m) => ({ default: m.BranchForm })));
const WarehousesList = lazyRetry(() => import('../pages/settings/WarehousesList').then((m) => ({ default: m.WarehousesList })));
const WarehouseForm = lazyRetry(() => import('../pages/settings/WarehouseForm').then((m) => ({ default: m.WarehouseForm })));
const UsersList = lazyRetry(() => import('../pages/settings/UsersList').then((m) => ({ default: m.UsersList })));
const UserForm = lazyRetry(() => import('../pages/settings/UserForm').then((m) => ({ default: m.UserForm })));
const RolesPermissions = lazyRetry(() => import('../pages/settings/RolesPermissions').then((m) => ({ default: m.RolesPermissions })));
const TaxMastersList = lazyRetry(() => import('../pages/settings/TaxMastersList').then((m) => ({ default: m.TaxMastersList })));
const TaxMasterForm = lazyRetry(() => import('../pages/settings/TaxMasterForm').then((m) => ({ default: m.TaxMasterForm })));
const UomManager = lazyRetry(() => import('../pages/settings/UomManager').then((m) => ({ default: m.UomManager })));
const CategoryTree = lazyRetry(() => import('../pages/settings/CategoryTree').then((m) => ({ default: m.CategoryTree })));
const DocumentSequences = lazyRetry(() => import('../pages/settings/DocumentSequences').then((m) => ({ default: m.DocumentSequences })));

// Masters (Step 2B)
const CustomersList = lazyRetry(() => import('../pages/masters/CustomersList').then((m) => ({ default: m.CustomersList })));
const CustomerForm = lazyRetry(() => import('../pages/masters/CustomerForm').then((m) => ({ default: m.CustomerForm })));
const VendorsList = lazyRetry(() => import('../pages/masters/VendorsList').then((m) => ({ default: m.VendorsList })));
const VendorForm = lazyRetry(() => import('../pages/masters/VendorForm').then((m) => ({ default: m.VendorForm })));
const ItemsList = lazyRetry(() => import('../pages/masters/ItemsList').then((m) => ({ default: m.ItemsList })));
const ItemForm = lazyRetry(() => import('../pages/masters/ItemForm').then((m) => ({ default: m.ItemForm })));
const ProductsList = lazyRetry(() => import('../pages/masters/ProductsList').then((m) => ({ default: m.ProductsList })));
const ProductForm = lazyRetry(() => import('../pages/masters/ProductForm').then((m) => ({ default: m.ProductForm })));
const BomsList = lazyRetry(() => import('../pages/masters/BomsList').then((m) => ({ default: m.BomsList })));
const BomBuilder = lazyRetry(() => import('../pages/masters/BomBuilder').then((m) => ({ default: m.BomBuilder })));

// Sales (Step 2C)
const QuotationsList = lazyRetry(() => import('../pages/sales/QuotationsList').then((m) => ({ default: m.QuotationsList })));
const QuotationForm = lazyRetry(() => import('../pages/sales/QuotationForm').then((m) => ({ default: m.QuotationForm })));
const SalesOrdersList = lazyRetry(() => import('../pages/sales/SalesOrdersList').then((m) => ({ default: m.SalesOrdersList })));
const SalesOrderForm = lazyRetry(() => import('../pages/sales/SalesOrderForm').then((m) => ({ default: m.SalesOrderForm })));
const DeliveryChallansList = lazyRetry(() => import('../pages/sales/DeliveryChallansList').then((m) => ({ default: m.DeliveryChallansList })));
const DeliveryChallanForm = lazyRetry(() => import('../pages/sales/DeliveryChallanForm').then((m) => ({ default: m.DeliveryChallanForm })));
const SalesInvoicesList = lazyRetry(() => import('../pages/sales/SalesInvoicesList').then((m) => ({ default: m.SalesInvoicesList })));
const SalesInvoiceForm = lazyRetry(() => import('../pages/sales/SalesInvoiceForm').then((m) => ({ default: m.SalesInvoiceForm })));
const CreditNotesList = lazyRetry(() => import('../pages/sales/CreditNotesList').then((m) => ({ default: m.CreditNotesList })));
const CreditNoteForm = lazyRetry(() => import('../pages/sales/CreditNoteForm').then((m) => ({ default: m.CreditNoteForm })));
const PaymentReceiptsList = lazyRetry(() => import('../pages/sales/PaymentReceiptsList').then((m) => ({ default: m.PaymentReceiptsList })));
const PaymentReceiptForm = lazyRetry(() => import('../pages/sales/PaymentReceiptForm').then((m) => ({ default: m.PaymentReceiptForm })));

// Purchase (Step 2D)
const PurchaseRequisitionsList = lazyRetry(() => import('../pages/purchase/PurchaseRequisitionsList').then((m) => ({ default: m.PurchaseRequisitionsList })));
const PurchaseRequisitionForm = lazyRetry(() => import('../pages/purchase/PurchaseRequisitionForm').then((m) => ({ default: m.PurchaseRequisitionForm })));
const PurchaseOrdersList = lazyRetry(() => import('../pages/purchase/PurchaseOrdersList').then((m) => ({ default: m.PurchaseOrdersList })));
const PurchaseOrderForm = lazyRetry(() => import('../pages/purchase/PurchaseOrderForm').then((m) => ({ default: m.PurchaseOrderForm })));
const GoodsReceiptNotesList = lazyRetry(() => import('../pages/purchase/GoodsReceiptNotesList').then((m) => ({ default: m.GoodsReceiptNotesList })));
const GoodsReceiptNoteForm = lazyRetry(() => import('../pages/purchase/GoodsReceiptNoteForm').then((m) => ({ default: m.GoodsReceiptNoteForm })));
const VendorBillsList = lazyRetry(() => import('../pages/purchase/VendorBillsList').then((m) => ({ default: m.VendorBillsList })));
const VendorBillForm = lazyRetry(() => import('../pages/purchase/VendorBillForm').then((m) => ({ default: m.VendorBillForm })));
const DebitNotesList = lazyRetry(() => import('../pages/purchase/DebitNotesList').then((m) => ({ default: m.DebitNotesList })));
const DebitNoteForm = lazyRetry(() => import('../pages/purchase/DebitNoteForm').then((m) => ({ default: m.DebitNoteForm })));
const VendorPaymentsList = lazyRetry(() => import('../pages/purchase/VendorPaymentsList').then((m) => ({ default: m.VendorPaymentsList })));
const VendorPaymentForm = lazyRetry(() => import('../pages/purchase/VendorPaymentForm').then((m) => ({ default: m.VendorPaymentForm })));

// Inventory (Step 2E)
const StockSummaryPage = lazyRetry(() => import('../pages/inventory/StockSummaryPage').then((m) => ({ default: m.StockSummaryPage })));
const StockLedgerPage = lazyRetry(() => import('../pages/inventory/StockLedgerPage').then((m) => ({ default: m.StockLedgerPage })));
const StockTransfersList = lazyRetry(() => import('../pages/inventory/StockTransfersList').then((m) => ({ default: m.StockTransfersList })));
const StockTransferForm = lazyRetry(() => import('../pages/inventory/StockTransferForm').then((m) => ({ default: m.StockTransferForm })));
const StockAdjustmentsList = lazyRetry(() => import('../pages/inventory/StockAdjustmentsList').then((m) => ({ default: m.StockAdjustmentsList })));
const StockAdjustmentForm = lazyRetry(() => import('../pages/inventory/StockAdjustmentForm').then((m) => ({ default: m.StockAdjustmentForm })));
const BatchSerialPage = lazyRetry(() => import('../pages/inventory/BatchSerialPage').then((m) => ({ default: m.BatchSerialPage })));

// Manufacturing (Step 2F)
const WorkOrdersList = lazyRetry(() => import('../pages/manufacturing/WorkOrdersList').then((m) => ({ default: m.WorkOrdersList })));
const WorkOrderForm = lazyRetry(() => import('../pages/manufacturing/WorkOrderForm').then((m) => ({ default: m.WorkOrderForm })));
const ProductionEntriesList = lazyRetry(() => import('../pages/manufacturing/ProductionEntriesList').then((m) => ({ default: m.ProductionEntriesList })));
const ProductionEntryForm = lazyRetry(() => import('../pages/manufacturing/ProductionEntryForm').then((m) => ({ default: m.ProductionEntryForm })));
const ScrapEntriesList = lazyRetry(() => import('../pages/manufacturing/ScrapEntriesList').then((m) => ({ default: m.ScrapEntriesList })));
const ScrapEntryForm = lazyRetry(() => import('../pages/manufacturing/ScrapEntryForm').then((m) => ({ default: m.ScrapEntryForm })));

// Finance (Step 2G)
const ChartOfAccountsPage = lazyRetry(() => import('../pages/finance/ChartOfAccountsPage').then((m) => ({ default: m.ChartOfAccountsPage })));
const LedgerPage = lazyRetry(() => import('../pages/finance/LedgerPage').then((m) => ({ default: m.LedgerPage })));
const BankAccountsList = lazyRetry(() => import('../pages/finance/BankAccountsList').then((m) => ({ default: m.BankAccountsList })));
const BankAccountForm = lazyRetry(() => import('../pages/finance/BankAccountForm').then((m) => ({ default: m.BankAccountForm })));
const ReconciliationPage = lazyRetry(() => import('../pages/finance/ReconciliationPage').then((m) => ({ default: m.ReconciliationPage })));

// Approvals (Step 2H)
const ApprovalsPage = lazyRetry(() => import('../pages/approvals/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })));
const ApprovalMatrixPage = lazyRetry(() => import('../pages/approvals/ApprovalMatrixPage').then((m) => ({ default: m.ApprovalMatrixPage })));

// Reports (Step 2K)
const ReportViewerPage = lazyRetry(() => import('../pages/reports/ReportViewerPage').then((m) => ({ default: m.ReportViewerPage })));
const GSTReportsPage = lazyRetry(() => import('../pages/reports/GSTReportsPage').then((m) => ({ default: m.GSTReportsPage })));
const InsightsPage = lazyRetry(() => import('../pages/reports/InsightsPage').then((m) => ({ default: m.InsightsPage })));

// System (Step 2J)
const AlertRulesList = lazyRetry(() => import('../pages/system/AlertRulesList').then((m) => ({ default: m.AlertRulesList })));
const AlertRuleForm = lazyRetry(() => import('../pages/system/AlertRuleForm').then((m) => ({ default: m.AlertRuleForm })));
const NotificationsPage = lazyRetry(() => import('../pages/system/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const BackupsPage = lazyRetry(() => import('../pages/system/BackupsPage').then((m) => ({ default: m.BackupsPage })));


function DeliveryChallanRedirect() {
  const { id } = useParams();
  return <Navigate to={`/sales/challans/${id}`} replace />;
}

function LogoutRoute() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  React.useEffect(() => { clearAuth(); }, []);
  return <Navigate to="/login" replace />;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LazyPage component={LoginPage} /> },
  { path: '/logout', element: <LogoutRoute /> },
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
      { path: 'sales/delivery-challans', element: <Navigate to="/sales/challans" replace /> },
      { path: 'sales/delivery-challans/:id', element: <DeliveryChallanRedirect /> },
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
      { path: 'purchase/requisitions', element: <LazyPage component={PurchaseRequisitionsList} /> },
      { path: 'purchase/requisitions/new', element: <LazyPage component={PurchaseRequisitionForm} /> },
      { path: 'purchase/requisitions/:id', element: <LazyPage component={PurchaseRequisitionForm} /> },
      { path: 'purchase/orders', element: <LazyPage component={PurchaseOrdersList} /> },
      { path: 'purchase/orders/new', element: <LazyPage component={PurchaseOrderForm} /> },
      { path: 'purchase/orders/:id', element: <LazyPage component={PurchaseOrderForm} /> },
      { path: 'purchase/grn', element: <LazyPage component={GoodsReceiptNotesList} /> },
      { path: 'purchase/grn/new', element: <LazyPage component={GoodsReceiptNoteForm} /> },
      { path: 'purchase/grn/:id', element: <LazyPage component={GoodsReceiptNoteForm} /> },
      { path: 'purchase/bills', element: <LazyPage component={VendorBillsList} /> },
      { path: 'purchase/bills/new', element: <LazyPage component={VendorBillForm} /> },
      { path: 'purchase/bills/:id', element: <LazyPage component={VendorBillForm} /> },
      { path: 'purchase/debit-notes', element: <LazyPage component={DebitNotesList} /> },
      { path: 'purchase/debit-notes/new', element: <LazyPage component={DebitNoteForm} /> },
      { path: 'purchase/debit-notes/:id', element: <LazyPage component={DebitNoteForm} /> },
      { path: 'purchase/payments', element: <LazyPage component={VendorPaymentsList} /> },
      { path: 'purchase/payments/new', element: <LazyPage component={VendorPaymentForm} /> },
      { path: 'purchase/payments/:id', element: <LazyPage component={VendorPaymentForm} /> },

      // ─── Inventory (2E) ─────────────────────────────────────
      { path: 'inventory/stock', element: <LazyPage component={StockSummaryPage} /> },
      { path: 'inventory/stock-ledger', element: <LazyPage component={StockLedgerPage} /> },
      { path: 'inventory/transfers', element: <LazyPage component={StockTransfersList} /> },
      { path: 'inventory/transfers/new', element: <LazyPage component={StockTransferForm} /> },
      { path: 'inventory/transfers/:id', element: <LazyPage component={StockTransferForm} /> },
      { path: 'inventory/adjustments', element: <LazyPage component={StockAdjustmentsList} /> },
      { path: 'inventory/adjustments/new', element: <LazyPage component={StockAdjustmentForm} /> },
      { path: 'inventory/adjustments/:id', element: <LazyPage component={StockAdjustmentForm} /> },
      { path: 'inventory/batch-serial', element: <LazyPage component={BatchSerialPage} /> },

      // ─── Manufacturing (2F) ─────────────────────────────────
      { path: 'manufacturing/work-orders', element: <LazyPage component={WorkOrdersList} /> },
      { path: 'manufacturing/work-orders/new', element: <LazyPage component={WorkOrderForm} /> },
      { path: 'manufacturing/work-orders/:id', element: <LazyPage component={WorkOrderForm} /> },
      { path: 'manufacturing/production', element: <LazyPage component={ProductionEntriesList} /> },
      { path: 'manufacturing/production/new', element: <LazyPage component={ProductionEntryForm} /> },
      { path: 'manufacturing/production/:id', element: <LazyPage component={ProductionEntryForm} /> },
      { path: 'manufacturing/scrap', element: <LazyPage component={ScrapEntriesList} /> },
      { path: 'manufacturing/scrap/new', element: <LazyPage component={ScrapEntryForm} /> },
      { path: 'manufacturing/scrap/:id', element: <LazyPage component={ScrapEntryForm} /> },

      // ─── Finance (2G) ───────────────────────────────────────
      { path: 'finance/accounts', element: <LazyPage component={ChartOfAccountsPage} /> },
      { path: 'finance/ledger', element: <LazyPage component={LedgerPage} /> },
      { path: 'finance/banks', element: <LazyPage component={BankAccountsList} /> },
      { path: 'finance/banks/new', element: <LazyPage component={BankAccountForm} /> },
      { path: 'finance/banks/:id', element: <LazyPage component={BankAccountForm} /> },
      { path: 'finance/reconciliation', element: <LazyPage component={ReconciliationPage} /> },

      // ─── Approvals (2H) ─────────────────────────────────────
      { path: 'approvals', element: <LazyPage component={ApprovalsPage} /> },
      { path: 'approvals/matrix', element: <LazyPage component={ApprovalMatrixPage} /> },

      // ─── Reports (2K) ───────────────────────────────────────
      { path: 'reports/viewer', element: <LazyPage component={ReportViewerPage} /> },
      { path: 'reports/gst', element: <LazyPage component={GSTReportsPage} /> },
      { path: 'reports/insights', element: <LazyPage component={InsightsPage} /> },

      // ─── System (2J) ────────────────────────────────────────
      { path: 'system/alert-rules', element: <LazyPage component={AlertRulesList} /> },
      { path: 'system/alert-rules/new', element: <LazyPage component={AlertRuleForm} /> },
      { path: 'system/alert-rules/:id', element: <LazyPage component={AlertRuleForm} /> },
      { path: 'system/notifications', element: <LazyPage component={NotificationsPage} /> },
      { path: 'system/backups', element: <LazyPage component={BackupsPage} /> },

      // ─── Catch-all ──────────────────────────────────────────
      { path: '*', element: <LazyPage component={NotFoundPage} /> },
    ],
  },
]);