export const APP_NAME = 'Manufacturing ERP';
export const APP_VERSION = '1.0.0';

export const DEFAULT_API_PORT = 3001;
export const DEFAULT_DB_PORT = 5432;
export const DEFAULT_DISCOVERY_PORT = 41234;

export const LICENSE_TIERS = {
  STARTER: 'starter',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise',
} as const;

export const TIER_LIMITS = {
  starter: { maxUsers: 3, maxBranches: 1 },
  professional: { maxUsers: 10, maxBranches: 3 },
  enterprise: { maxUsers: 50, maxBranches: 10 },
} as const;

export const APP_MODES = {
  SERVER: 'server',
  CLIENT: 'client',
} as const;

export const DOCUMENT_TYPES = {
  QUOTATION: 'quotation',
  SALES_ORDER: 'sales_order',
  INVOICE: 'invoice',
  PURCHASE_ORDER: 'po',
  GRN: 'grn',
  WORK_ORDER: 'work_order',
} as const;

export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCED: 'synced',
  CONFLICT: 'conflict',
} as const;

export const ITEM_TYPES = {
  RAW_MATERIAL: 'raw_material',
  COMPONENT: 'component',
  CONSUMABLE: 'consumable',
  PACKING: 'packing',
} as const;

export const PRODUCT_TYPES = {
  FINISHED_GOODS: 'finished_goods',
  SEMI_FINISHED: 'semi_finished',
} as const;

export const COSTING_METHODS = {
  FIFO: 'fifo',
  WEIGHTED_AVG: 'weighted_avg',
  STANDARD: 'standard',
} as const;

export const ENTITY_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked',
} as const;

export const WAREHOUSE_TYPES = {
  MAIN: 'main',
  RAW_MATERIAL: 'raw_material',
  FINISHED_GOODS: 'finished_goods',
  SCRAP: 'scrap',
} as const;

export const VOUCHER_TYPES = {
  SALES: 'sales',
  PURCHASE: 'purchase',
  RECEIPT: 'receipt',
  PAYMENT: 'payment',
  JOURNAL: 'journal',
  CONTRA: 'contra',
} as const;

export const STOCK_TRANSACTION_TYPES = {
  PURCHASE: 'purchase',
  SALE: 'sale',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  PRODUCTION: 'production',
  CONSUMPTION: 'consumption',
  ADJUSTMENT: 'adjustment',
  RETURN_IN: 'return_in',
  RETURN_OUT: 'return_out',
  SCRAP: 'scrap',
  OPENING: 'opening',
} as const;

export const APPROVAL_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ESCALATED: 'escalated',
} as const;

export const WORK_ORDER_STATUSES = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  MATERIAL_ISSUED: 'material_issued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const;

export const SALES_ORDER_STATUSES = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  IN_PROGRESS: 'in_progress',
  DELIVERED: 'delivered',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const;

export const PURCHASE_ORDER_STATUSES = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  SENT: 'sent',
  PARTIALLY_RECEIVED: 'partially_received',
  RECEIVED: 'received',
  BILLED: 'billed',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const;

export const INVOICE_STATUSES = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  SENT: 'sent',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  CANCELLED: 'cancelled',
} as const;

export const BOM_STATUSES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  OBSOLETE: 'obsolete',
} as const;

export const PRIORITY_LEVELS = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;
