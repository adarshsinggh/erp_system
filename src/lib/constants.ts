// ─── Indian States for GST ───────────────────────────────────────
export const INDIAN_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh',
};

// ─── Status Configurations ───────────────────────────────────────
export type StatusColor = 'gray' | 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'orange' | 'pink';

export interface StatusConfig {
  label: string;
  color: StatusColor;
}

export const ENTITY_STATUSES: Record<string, StatusConfig> = {
  active: { label: 'Active', color: 'green' },
  inactive: { label: 'Inactive', color: 'gray' },
};

export const QUOTATION_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  sent: { label: 'Sent', color: 'blue' },
  accepted: { label: 'Accepted', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  expired: { label: 'Expired', color: 'orange' },
  converted: { label: 'Converted', color: 'purple' },
};

export const SALES_ORDER_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  confirmed: { label: 'Confirmed', color: 'blue' },
  in_progress: { label: 'In Progress', color: 'purple' },
  completed: { label: 'Completed', color: 'green' },
  closed: { label: 'Closed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const INVOICE_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  pending_approval: { label: 'Pending Approval', color: 'yellow' },
  approved: { label: 'Approved', color: 'blue' },
  partially_paid: { label: 'Partially Paid', color: 'orange' },
  paid: { label: 'Paid', color: 'green' },
  overdue: { label: 'Overdue', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'gray' },
};

export const PURCHASE_ORDER_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  sent: { label: 'Sent', color: 'purple' },
  partially_received: { label: 'Partially Received', color: 'orange' },
  received: { label: 'Received', color: 'green' },
  closed: { label: 'Closed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const WORK_ORDER_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  material_issued: { label: 'Material Issued', color: 'purple' },
  in_progress: { label: 'In Progress', color: 'orange' },
  completed: { label: 'Completed', color: 'green' },
  closed: { label: 'Closed', color: 'gray' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const SCRAP_REASONS: Record<string, StatusConfig> = {
  defective: { label: 'Defective', color: 'red' },
  damaged: { label: 'Damaged', color: 'orange' },
  expired: { label: 'Expired', color: 'yellow' },
  process_waste: { label: 'Process Waste', color: 'gray' },
};

export const DISPOSAL_METHODS: Record<string, StatusConfig> = {
  sell: { label: 'Sell', color: 'green' },
  recycle: { label: 'Recycle', color: 'blue' },
  discard: { label: 'Discard', color: 'gray' },
};

export const SCRAP_STATUSES: Record<string, StatusConfig> = {
  recorded: { label: 'Recorded', color: 'blue' },
  disposed: { label: 'Disposed', color: 'green' },
};

export const TRANSFER_STATUSES: Record<string, StatusConfig> = {
  draft: { label: 'Draft', color: 'gray' },
  approved: { label: 'Approved', color: 'blue' },
  in_transit: { label: 'In Transit', color: 'purple' },
  received: { label: 'Received', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'red' },
};

export const APPROVAL_STATUSES: Record<string, StatusConfig> = {
  not_started: { label: 'Not Started', color: 'gray' },
  in_progress: { label: 'In Progress', color: 'blue' },
  blocked: { label: 'Blocked', color: 'red' },
  completed: { label: 'Completed', color: 'green' },
  on_hold: { label: 'On Hold', color: 'yellow' },
};

// ─── Document Types ──────────────────────────────────────────────
export const DOCUMENT_TYPES = [
  'sales_quotation', 'sales_order', 'delivery_challan', 'sales_invoice',
  'credit_note', 'payment_receipt', 'purchase_requisition', 'purchase_order',
  'goods_receipt_note', 'vendor_bill', 'debit_note', 'vendor_payment',
  'stock_transfer', 'stock_adjustment', 'work_order', 'production_entry',
  'scrap_entry', 'journal_voucher',
] as const;

export type DocumentType = typeof DOCUMENT_TYPES[number];

// ─── Item Types ──────────────────────────────────────────────────
export const ITEM_TYPES = ['raw_material', 'component', 'consumable', 'packing'] as const;
export const PRODUCT_TYPES = ['finished', 'semi_finished'] as const;

export const ITEM_TYPE_COLORS: Record<string, string> = {
  raw_material: 'bg-blue-100 text-blue-700',
  component: 'bg-purple-100 text-purple-700',
  consumable: 'bg-orange-100 text-orange-700',
  packing: 'bg-green-100 text-green-700',
  finished: 'bg-emerald-100 text-emerald-700',
  semi_finished: 'bg-teal-100 text-teal-700',
};

// ─── Priority ────────────────────────────────────────────────────
export const PRIORITY_CONFIG: Record<string, StatusConfig> = {
  low: { label: 'Low', color: 'gray' },
  normal: { label: 'Normal', color: 'blue' },
  high: { label: 'High', color: 'orange' },
  urgent: { label: 'Urgent', color: 'red' },
};

// ─── Pagination Defaults ─────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];