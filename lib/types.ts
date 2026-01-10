export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "ghanaian" | "continental" | "beverages" | "desserts" | "sides";
  barcode?: string;
  inStock: boolean;
  image?: string; // Add image field for product images
}

export interface OrderItem extends MenuItem {
  quantity: number;
  status?: "pending" | "preparing" | "ready" | "served"; // Item-level status
  prepTime?: number; // Estimated preparation time in minutes
  notes?: string; // Item-specific notes
  orderId?: string; // Unique order ID for this specific product
  orderNumber?: string; // Unique order number for this specific product
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: "ingredient" | "beverage" | "supply";
  quantity: string;
  unit: string;
  reorderLevel: string;
  cost: string;
  supplier: string;
  lastUpdated?: string;
}

export interface SalesData {
  id: string;
  orderNumber: string;
  orderId?: string;
  date: string;
  items: OrderItem[];
  total: number;
  orderType: string;
  tableNumber?: string;
  customerName?: string;
  customerRefused?: boolean;
  paymentMethod: string;
  type?: "sale" | "refund";
}

export interface RefundRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerRefused?: boolean;
  originalAmount: number;
  refundAmount: number;
  paymentMethod: string;
  reason: string;
  authorizedBy: string;
  additionalNotes?: string;
  status: "pending" | "approved" | "rejected" | "completed";
  requestedBy: string;
  requestedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  completedAt?: Date;
  refundMethod?: string;
  transactionId?: string;
}

export interface RefundSettings {
  enabled: boolean;
  maxManagerRefund: number;
  requireApproval: boolean;
  approvalThreshold: number;
  allowedPaymentMethods: string[];
  requiredFields: string[];
  autoApproveSmallAmounts: boolean;
  smallAmountThreshold: number;
  timeLimit: number;
}

export interface RefundPolicy {
  timeLimit: number; // hours
  partialRefunds: boolean;
  exchangeOnly: boolean;
  restockingFee: number;
  documentationRequired: boolean;
}

export interface ReceiptData {
  orderNumber: string;
  date: string;
  time: string;
  items: {
    name: string;
    quantity: number;
    price: number;
    total: number;
    barcode?: string;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  customerName?: string;
  customerRefused?: boolean;
  tableNumber?: string;
  orderType: string;
  orderId?: string;
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
}

// Placeholder types for thermal printer test
export interface ThermalPrinterStatus {
  isConnected: boolean;
  isPrinting: boolean;
  lastPrinted: string | null;
  lastPrintedAt: string | null;
  error: string | null;
  paperStatus: string;
  temperature: number | null;
  printHeadStatus: string;
}

export interface PrintJob {
  id?: string;
  content: string;
  status?: string;
}

export interface ThermalPrinterConfig {
  enabled: boolean;
  port?: string;
  baudRate?: number;
}
