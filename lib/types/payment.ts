export interface Order {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: "pending" | "processing" | "completed" | "failed";
  paymentId?: string;
  timestamp: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export const CANONICAL_PAYMENT_METHODS = [
  "cash",
  "card",
  "mobile",
  "mobile_money",
  "bank_transfer",
  "room_charge",
  "complimentary",
  "other",
  "guest-folio",
  "paid-at-order",
] as const;

export type CanonicalPaymentMethod = (typeof CANONICAL_PAYMENT_METHODS)[number];

export interface PaymentDetails {
  amount: number;
  method: CanonicalPaymentMethod;
  currency: string;
  cardDetails?: {
    last4: string;
    brand: string;
    expiryMonth: number;
    expiryYear: number;
  };
  mobileDetails?: {
    provider: string;
    phoneNumber: string;
    transactionRef: string;
  };
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  method: string;
  error?: string;
  timestamp: string;
}

export interface RefundRequest {
  id: string;
  orderId: string;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "completed";
  timestamp: string;
  paymentMethod?: string;
  transactionId?: string;
  authorizedBy?: string;
  approvedBy?: string;
  approvedAt?: Date;
  completedAt?: Date;
}

// Add to existing OrderItem interface
export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  status: "pending" | "preparing" | "ready" | "served";
}

// Transaction logging
export interface TransactionLog {
  id: string;
  type: "payment" | "refund" | "void";
  orderId: string;
  amount: number;
  status: string;
  timestamp: string;
  metadata: Record<string, unknown>;
  paymentMethod?: string;
  customerId?: string;
}
