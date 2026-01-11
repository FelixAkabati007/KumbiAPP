import type {
  PaymentDetails,
  Order,
  Customer,
  PaymentResult,
  OrderItem,
} from "../types/payment";
import type { SalesData, InventoryItem, ReceiptData } from "../types";
import {
  getThermalPrinterService,
  ThermalPrinterService,
} from "../thermal-printer";
import { getSettings, type AppSettings } from "../settings";
// Inventory and order persistence are implemented via local helpers for now
import {
  addSaleData,
  getInventoryItems,
  updateInventoryItem,
  getOrderNumber,
} from "../data";

import { offlineQueue } from "./offline-queue";

import { inventoryManager } from "./inventory-manager";

export class PaymentService {
  private printer: ThermalPrinterService;

  constructor() {
    // Initialize with current settings
    const settings = getSettings();
    this.printer = getThermalPrinterService(settings.system.thermalPrinter);
  }

  async processPayment(
    order: Order,
    paymentDetails: PaymentDetails,
    customer: Customer,
    settings?: AppSettings
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    // const transaction = { id: `txn-${Date.now()}` } as { id: string };

    // Update printer service if settings are provided
    if (settings?.system?.thermalPrinter) {
      this.printer = getThermalPrinterService(settings.system.thermalPrinter);
    }

    try {
      // 1. Validate payment details
      await this.validatePaymentDetails(paymentDetails);

      // Prepare order items for logging
      const saleItems = (order.items || []).map((it) => {
        const pi = it as unknown as {
          description?: string;
          price?: number;
          category?: string;
          barcode?: string;
          inStock?: boolean;
          quantity?: number;
          status?: string;
        };

        const status =
          (pi.status as
            | "pending"
            | "preparing"
            | "ready"
            | "served"
            | undefined) ?? "pending";

        return {
          id: it.id,
          name: it.name,
          description: pi.description ?? "",
          price: pi.price ?? 0,
          category:
            (pi.category as
              | "ghanaian"
              | "continental"
              | "beverages"
              | "desserts"
              | "sides") ?? "beverages",
          barcode: pi.barcode,
          inStock: pi.inStock ?? true,
          quantity: pi.quantity ?? 1,
          status,
          subtotal: (pi.price ?? 0) * (pi.quantity ?? 1),
        };
      });

      const orderNumber = order.orderNumber ?? getOrderNumber();

      // 2. Process payment transaction
      const paymentResult = await this.executePayment(
        paymentDetails,
        customer,
        saleItems,
        orderNumber
      );

      if (!paymentResult.success) {
        throw new Error(`Payment failed: ${paymentResult.error}`);
      }

      // 3. Store order data (fallback to in-memory/local helpers)
      const orderData: Order = {
        ...order,
        id: order.id ?? `order-${Date.now()}`,
        orderNumber: orderNumber,
        paymentId: paymentResult.transactionId,
        status: "completed",
        timestamp: new Date().toISOString(),
      };

      try {
        // Record sales data for reporting
        const sale: SalesData = {
          id: orderData.id,
          orderNumber: orderData.orderNumber,
          date: new Date().toISOString(),
          items: saleItems,
          total: orderData.total ?? orderData.subtotal ?? 0,
          orderType: "sale",
          customerName: customer?.name,
          paymentMethod:
            (paymentResult as PaymentResult).method || paymentDetails.method,
        };

        addSaleData(sale);
      } catch (err) {
        throw new Error(`Failed to save order data: ${String(err)}`);
      }

      // 4. Update inventory
      const inventoryUpdateResult = await this.updateInventoryFromOrder(
        order.items,
        orderData.id
      );
      if (!inventoryUpdateResult.success) {
        throw new Error(
          `Failed to update inventory: ${inventoryUpdateResult.error}`
        );
      }

      // 5. Print receipt
      const receiptData: ReceiptData = {
        orderNumber: orderData.orderNumber,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        items: orderData.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
        })),
        subtotal: orderData.subtotal,
        tax: orderData.tax,
        total: orderData.total,
        paymentMethod: (paymentResult as PaymentResult).method,
        customerName: customer?.name,
        orderType: "sale", // Default to "sale" since Order type doesn't have it explicitly
        // tableNumber: order.tableNumber, // Not present in Order type currently
        businessName:
          settings?.account?.restaurantName ||
          settings?.businessName ||
          "Kumbisaly Heritage Restaurant",
        businessAddress:
          settings?.account?.address ||
          settings?.businessAddress ||
          "Offinso - Abofour, Ashanti, Ghana.",
        businessPhone:
          settings?.account?.phone || settings?.businessPhone || "0535975442",
        businessEmail:
          settings?.account?.email ||
          settings?.businessEmail ||
          "info.kumbisalyheritagehotel@gmail.com",
      };

      const success = await this.printer.printReceipt(receiptData);

      if (!success) {
        // Log but don't fail the transaction - receipt can be reprinted later
        console.error(`Receipt printing failed`);
      }

      // Mock commit
      // console.log(`[Mock] Committing transaction: ${transaction.id}`);

      return {
        success: true,
        transactionId: paymentResult.transactionId,
      };
    } catch (error) {
      // Mock rollback
      // console.log(`[Mock] Rolling back transaction: ${transaction.id}`);

      console.error("Payment process failed:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Payment processing failed",
      };
    }
  }

  private async validatePaymentDetails(
    details: PaymentDetails
  ): Promise<boolean> {
    // Implement comprehensive payment validation
    const requiredFields: Array<keyof PaymentDetails> = [
      "amount",
      "method",
      "currency",
    ];
    const missingFields = requiredFields.filter((field) => !details[field]);

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required payment fields: ${missingFields.join(", ")}`
      );
    }

    // Validate amount format and range
    if (details.amount <= 0 || isNaN(details.amount)) {
      throw new Error("Invalid payment amount");
    }

    // Add additional validation rules as needed
    return true;
  }

  private async executePayment(
    details: PaymentDetails,
    customer?: Customer,
    items?: OrderItem[],
    orderNumber?: string
  ): Promise<PaymentResult> {
    // 1. Handle Cash Payments
    if (details.method === "cash") {
      const transactionId = `TXN-CASH-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
      const logData = {
        id: transactionId,
        amount: details.amount,
        status: "success",
        paymentMethod: "cash",
        customerId: customer?.id,
        metadata: {
          customer_name: customer?.name || "Guest",
          items: items || [],
          orderNumber: orderNumber || "Unknown",
          orderType: "dine-in", // Default
        },
        timestamp: new Date().toISOString(),
      };

      // Log cash transaction to DB
      try {
        await fetch("/api/transactions/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logData),
        });
      } catch (e) {
        console.error("Failed to log cash transaction, queuing for retry", e);
        await offlineQueue.enqueue("/api/transactions/log", "POST", logData);
      }

      return {
        success: true,
        transactionId,
        method: "cash",
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Handle Non-Cash Payments (Card/Mobile) - Logged to Neon for syncing
    if (details.method === "mobile" || details.method === "card") {
      const transactionId = `TXN-${details.method.toUpperCase()}-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 5)
        .toUpperCase()}`;
      const logData = {
        id: transactionId,
        amount: details.amount,
        status: "success",
        paymentMethod: details.method,
        customerId: customer?.id,
        metadata: {
          customer_name: customer?.name || "Guest",
          items: items || [],
          orderNumber: orderNumber || "Unknown",
          orderType: "dine-in",
          provider: details.method,
        },
        timestamp: new Date().toISOString(),
      };

      // Log transaction to DB
      try {
        await fetch("/api/transactions/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logData),
        });
      } catch (e) {
        console.error(
          `Failed to log ${details.method} transaction, queuing for retry`,
          e
        );
        await offlineQueue.enqueue("/api/transactions/log", "POST", logData);
      }

      return {
        success: true,
        transactionId,
        method: details.method,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: false,
      error: `Unsupported payment method: ${details.method}`,
      method: details.method,
      timestamp: new Date().toISOString(),
    };
  }

  private async pollTransactionStatus(): Promise<PaymentResult> {
    return {
      success: false,
      error: "Polling is disabled",
      method: "unknown",
      timestamp: new Date().toISOString(),
    };
  }

  // Simple inventory decrementer: find inventory items by name and reduce quantity
  private async updateInventoryFromOrder(
    items: OrderItem[],
    orderId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const ENABLE_RECIPE_DEDUCTION = true; // Feature flag

      if (ENABLE_RECIPE_DEDUCTION && orderId) {
        // Map OrderItem to InventoryDeductionItem
        const deductionItems = items.map((i) => ({
          menu_item_id: i.id,
          item_name: i.name,
          quantity: i.quantity,
        }));

        await inventoryManager.deductIngredientsForOrder(
          orderId,
          deductionItems
        );
        return { success: true };
      }

      const inventory: InventoryItem[] = await getInventoryItems();

      for (const ordered of items) {
        // Try match by name; fall back to skip if not found
        const invItem = inventory.find(
          (i) => i.name === ordered.name || i.id === ordered.id
        );
        if (!invItem) continue;

        // inventory quantity in this project is stored as string in many places
        const currentQty = parseFloat(String(invItem.quantity)) || 0;
        const reduceBy = Number(ordered.quantity) || 0;
        const newQty = String(Math.max(0, currentQty - reduceBy));

        if (newQty !== String(currentQty)) {
          await updateInventoryItem({
            ...invItem,
            quantity: newQty,
          });
        }
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
