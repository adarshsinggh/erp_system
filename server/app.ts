// =============================================================
// File: server/app.ts
// Description: Fastify server bootstrap with all route
//              registrations. Updated to include Phase 10
//              Approval Workflow routes (Step 41).
// =============================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import dotenv from 'dotenv';
import { initializeDb, closeDb } from './database/connection';
import { healthRoutes } from './routes/health';
import { companyRoutes } from './routes/company';
import { authRoutes } from './routes/auth';
import { customerRoutes } from './routes/customers';
import { vendorRoutes } from './routes/vendors';
import { itemRoutes } from './routes/items';
import { productRoutes } from './routes/products';
import { bomRoutes } from './routes/boms';
import { mastersRoutes } from './routes/masters';
import { salesQuotationRoutes } from './routes/sales-quotations';
import { salesOrderRoutes } from './routes/sales-orders';
import { deliveryChallanRoutes } from './routes/delivery-challans';
import { salesInvoiceRoutes } from './routes/sales-invoices';
import { creditNoteRoutes } from './routes/credit-notes';
import { paymentReceiptRoutes } from './routes/payment-receipts';
// Phase 7: Inventory Management
import { inventoryRoutes } from './routes/inventory';
import { stockTransferRoutes } from './routes/stock-transfers';
import { stockAdjustmentRoutes } from './routes/stock-adjustments';
import { batchSerialRoutes } from './routes/batch-serial';
// Phase 8: Manufacturing
import { manufacturingRoutes } from './routes/manufacturing';
// Phase 9: Financial & Accounting
import { financeRoutes } from './routes/finance';
// Phase 10: Approval Workflow
import { approvalWorkflowRoutes } from './routes/approval-workflow';
// Phase 11: Smart Reorder & Automation
import { reorderRoutes } from './routes/reorder';
// Phase 12: Alerts, Notifications & Insights
import { alertsNotificationsRoutes } from './routes/alerts-notifications';
// Phase 13: Reporting Engine
import { reportRoutes } from './routes/reports';
// Phase 14: Audit, Compliance & Data Protection
import { auditComplianceRoutes } from './routes/audit-compliance';
// Phase 15: Sync & Multi-Device
import { syncRoutes } from './routes/sync';
// Phase 6: Purchase Management
import { purchaseOrderRoutes } from './routes/purchase-orders';
// Phase 16: UI/UX Polish — Dashboard & Shortcuts
import { dashboardRoutes } from './routes/dashboard';

dotenv.config();

const PORT = parseInt(process.env.API_PORT || '3001', 10);
const HOST = process.env.API_HOST || '0.0.0.0';

export async function buildServer() {
  const server = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Plugins
  await server.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
  await server.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
});
  await server.register(sensible);

  // Initialize database
  await initializeDb();

  // Register routes
  await server.register(healthRoutes, { prefix: '/api' });
  await server.register(companyRoutes, { prefix: '/api' });
  await server.register(authRoutes, { prefix: '/api' });
  await server.register(customerRoutes, { prefix: '/api' });
  await server.register(vendorRoutes, { prefix: '/api' });
  await server.register(itemRoutes, { prefix: '/api' });
  await server.register(productRoutes, { prefix: '/api' });
  await server.register(bomRoutes, { prefix: '/api' });
  await server.register(mastersRoutes, { prefix: '/api' });
  // Phase 5: Sales Management
  await server.register(salesQuotationRoutes, { prefix: '/api' });
  await server.register(salesOrderRoutes, { prefix: '/api' });
  await server.register(deliveryChallanRoutes, { prefix: '/api' });
  await server.register(salesInvoiceRoutes, { prefix: '/api' });
  await server.register(creditNoteRoutes, { prefix: '/api' });
  await server.register(paymentReceiptRoutes, { prefix: '/api' });
  // Phase 6: Purchase Management
  await server.register(purchaseOrderRoutes, { prefix: '/api' });
  // Phase 7: Inventory Management
  await server.register(inventoryRoutes, { prefix: '/api' });
  await server.register(stockTransferRoutes, { prefix: '/api' });
  await server.register(stockAdjustmentRoutes, { prefix: '/api' });
  await server.register(batchSerialRoutes, { prefix: '/api' });
  // Phase 8: Manufacturing
  await server.register(manufacturingRoutes, { prefix: '/api' });
  // Phase 9: Financial & Accounting
  await server.register(financeRoutes, { prefix: '/api' });
  // Phase 10: Approval Workflow
  await server.register(approvalWorkflowRoutes, { prefix: '/api' });
  // Phase 11: Smart Reorder & Automation
  await server.register(reorderRoutes, { prefix: '/api' });
  // Phase 12: Alerts, Notifications & Insights
  await server.register(alertsNotificationsRoutes, { prefix: '/api' });
  // Phase 13: Reporting Engine
  await server.register(reportRoutes, { prefix: '/api' });
  // Phase 14: Audit, Compliance & Data Protection
  await server.register(auditComplianceRoutes, { prefix: '/api' });
  // Phase 15: Sync & Multi-Device
  await server.register(syncRoutes, { prefix: '/api' });
  // Phase 16: UI/UX Polish — Dashboard & Shortcuts
  await server.register(dashboardRoutes, { prefix: '/api' });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Server] Shutting down...');
    await server.close();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

// Start server when run directly
async function start() {
  try {
    const server = await buildServer();
    await server.listen({ port: PORT, host: HOST });
    console.log(`[Server] Manufacturing ERP API running on http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();