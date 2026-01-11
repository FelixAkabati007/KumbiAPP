import { getSettings } from "./settings";
import { getCashDrawerService } from "./cash-drawer";
import { getBarcodeScannerService } from "./barcode-scanner";
import { getThermalPrinterService } from "./thermal-printer";
import { getRefundService } from "./refund-service";
import { playNotificationSound } from "./notifications";
import { addSaleData } from "./data";
import { transactionLogger } from "./services/transaction-logger";
import type { OrderItem, MenuItem } from "./types";
import type { AppSettings } from "./settings";

export interface SystemStatus {
  cashDrawer: {
    isConnected: boolean;
    isOpen: boolean;
    error: string | null;
  };
  barcodeScanner: {
    isConnected: boolean;
    isScanning: boolean;
    error: string | null;
  };
  thermalPrinter: {
    isConnected: boolean;
    isPrinting: boolean;
    paperStatus: string;
    error: string | null;
  };
  refunds: {
    isEnabled: boolean;
    pendingRequests: number;
  };
  overall: {
    isHealthy: boolean;
    lastHealthCheck: Date;
    errors: string[];
  };
}

export interface IntegrationEvent {
  type:
    | "hardware_connected"
    | "hardware_disconnected"
    | "payment_processed"
    | "barcode_scanned"
    | "receipt_printed"
    | "refund_requested"
    | "refund_pending"
    | "error";
  source:
    | "cash_drawer"
    | "barcode_scanner"
    | "thermal_printer"
    | "refund_service"
    | "system";
  data: unknown;
  timestamp: Date;
}

class IntegrationService {
  private settings: AppSettings;
  private status: SystemStatus;
  private eventListeners: ((event: IntegrationEvent) => void)[] = [];
  private statusListeners: ((status: SystemStatus) => void)[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor() {
    this.settings = getSettings();
    this.status = this.initializeStatus();
  }

  private initializeStatus(): SystemStatus {
    return {
      cashDrawer: {
        isConnected: false,
        isOpen: false,
        error: null,
      },
      barcodeScanner: {
        isConnected: false,
        isScanning: false,
        error: null,
      },
      thermalPrinter: {
        isConnected: false,
        isPrinting: false,
        paperStatus: "unknown",
        error: null,
      },
      refunds: {
        isEnabled: this.settings.system.refunds.enabled,
        pendingRequests: 0,
      },
      overall: {
        isHealthy: false,
        lastHealthCheck: new Date(),
        errors: [],
      },
    };
  }

  // Initialize all hardware services
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // console.log("Initializing POS system integration...");

      // Initialize cash drawer
      if (this.settings.system.cashDrawer.enabled) {
        await this.initializeCashDrawer();
      }

      // Initialize barcode scanner
      if (this.settings.system.barcodeScanner.enabled) {
        await this.initializeBarcodeScanner();
      }

      // Initialize thermal printer
      if (this.settings.system.thermalPrinter.enabled) {
        await this.initializeThermalPrinter();
      }

      // Initialize refund service
      if (this.settings.system.refunds.enabled) {
        this.initializeRefundService();
      }

      // Start health monitoring
      this.startHealthMonitoring();

      this.isInitialized = true;
      this.emitEvent({
        type: "hardware_connected",
        source: "system",
        data: { message: "All hardware services initialized" },
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to initialize integration service:", error);
      this.emitEvent({
        type: "error",
        source: "system",
        data: { error: message },
        timestamp: new Date(),
      });
      return false;
    }
  }

  private async initializeCashDrawer(): Promise<void> {
    try {
      const cashDrawerService = getCashDrawerService(
        this.settings.system.cashDrawer
      );

      // Subscribe to status changes
      cashDrawerService.onStatusChange((status) => {
        this.status.cashDrawer = {
          isConnected: status.isConnected,
          isOpen: status.isOpen,
          error: status.error,
        };
        this.updateOverallStatus();
        this.notifyStatusListeners();
      });

      // Connect to cash drawer
      const connected = await cashDrawerService.connect();
      if (connected) {
        this.emitEvent({
          type: "hardware_connected",
          source: "cash_drawer",
          data: { port: this.settings.system.cashDrawer.port },
          timestamp: new Date(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to initialize cash drawer:", error);
      this.status.cashDrawer.error = message;
    }
  }

  private async initializeBarcodeScanner(): Promise<void> {
    try {
      const barcodeService = getBarcodeScannerService(
        this.settings.system.barcodeScanner
      );

      // Subscribe to status changes
      barcodeService.onStatusChange((status) => {
        this.status.barcodeScanner = {
          isConnected: status.isConnected,
          isScanning: status.isScanning,
          error: status.error,
        };
        this.updateOverallStatus();
        this.notifyStatusListeners();
      });

      // Subscribe to barcode data
      barcodeService.onBarcodeData((data) => {
        this.emitEvent({
          type: "barcode_scanned",
          source: "barcode_scanner",
          data: data,
          timestamp: new Date(),
        });
      });

      // Connect to barcode scanner
      const connected = await barcodeService.connect();
      if (connected) {
        this.emitEvent({
          type: "hardware_connected",
          source: "barcode_scanner",
          data: { port: this.settings.system.barcodeScanner.port },
          timestamp: new Date(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to initialize barcode scanner:", error);
      this.status.barcodeScanner.error = message;
    }
  }

  private async initializeThermalPrinter(): Promise<void> {
    try {
      const printerService = getThermalPrinterService(
        this.settings.system.thermalPrinter
      );

      // Subscribe to status changes
      printerService.onStatusChange((status) => {
        this.status.thermalPrinter = {
          isConnected: status.isConnected,
          isPrinting: status.isPrinting,
          paperStatus: status.paperStatus,
          error: status.error,
        };
        this.updateOverallStatus();
        this.notifyStatusListeners();
      });

      // Connect to thermal printer
      const connected = await printerService.connect();
      if (connected) {
        this.emitEvent({
          type: "hardware_connected",
          source: "thermal_printer",
          data: { port: this.settings.system.thermalPrinter.port },
          timestamp: new Date(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to initialize thermal printer:", error);
      this.status.thermalPrinter.error = message;
    }
  }

  private initializeRefundService(): void {
    try {
      const refundService = getRefundService();

      // Update pending requests count
      const updatePendingCount = async () => {
        try {
          const pending = await refundService.getRefundsByStatus("pending");
          this.status.refunds.pendingRequests = pending.length;
          this.notifyStatusListeners();
        } catch {
          // swallow transient network errors
          this.status.refunds.pendingRequests = 0;
        }
      };

      // Initial count
      updatePendingCount();

      // Set up periodic updates
      setInterval(() => {
        updatePendingCount();
      }, 30000); // Update every 30 seconds
    } catch (error) {
      console.error("Failed to initialize refund service:", error);
    }
  }

  // Process payment with integrated hardware
  async processPayment(paymentData: {
    amount: number;
    method: string;
    orderNumber: string;
    orderId?: string;
    items: OrderItem[];
    customerName?: string;
    customerRefused?: boolean;
    orderType?: string;
    tableNumber?: string;
  }): Promise<boolean> {
    try {
      // Log transaction attempt for all payment methods
      // Open cash drawer if cash payment and enabled
      if (
        paymentData.method === "cash" &&
        this.settings.system.cashDrawer.enabled
      ) {
        const cashDrawerService = getCashDrawerService();
        await cashDrawerService.open();
      }

      // Print receipt if thermal printer is enabled
      if (this.settings.system.thermalPrinter.enabled) {
        // Fetch fresh settings to ensure business details are up to date
        // Note: In a class method, we might want to update this.settings or just fetch for this operation
        // For now, we'll try to use the existing settings but ideally we should refresh them.
        // Since getSettings() is sync and might return defaults, let's try to see if we can get better data.
        // However, this.settings is initialized in constructor.

        const printerService = getThermalPrinterService();
        await printerService.printReceipt({
          orderNumber: paymentData.orderNumber,
          // include sale-level id for traceability
          orderId: paymentData.orderId,
          date: new Date().toLocaleDateString(),
          time: new Date().toLocaleTimeString(),
          items: paymentData.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
            barcode: item.barcode,
          })),
          subtotal: paymentData.amount,
          tax: paymentData.amount * (this.settings.system.taxRate / 100),
          total: paymentData.amount,
          paymentMethod: paymentData.method,
          customerName: paymentData.customerRefused
            ? ""
            : paymentData.customerName || "",
          customerRefused: !!paymentData.customerRefused,
          orderType: "dine-in",
          tableNumber: "",
          businessName:
            this.settings.account.restaurantName ||
            this.settings.businessName ||
            "KHH RESTAURANT",
          businessAddress:
            this.settings.account.address || this.settings.businessAddress,
          businessPhone:
            this.settings.account.phone || this.settings.businessPhone,
          businessEmail:
            this.settings.account.email || this.settings.businessEmail,
        });
      }

      // Play notification sound
      if (this.settings.notifications.soundEnabled) {
        playNotificationSound();
      }

      this.emitEvent({
        type: "payment_processed",
        source: "system",
        data: paymentData,
        timestamp: new Date(),
      });

      // Archive to sales data
      // This already logs to the transaction log API via addSaleData -> /api/transactions/log
      addSaleData({
        id: `sale-${paymentData.orderNumber}`,
        orderNumber: paymentData.orderNumber,
        orderId: paymentData.orderId,
        date: new Date().toISOString(),
        items: paymentData.items,
        total: paymentData.amount,
        orderType: paymentData.orderType || "dine-in",
        tableNumber: paymentData.tableNumber || "",
        customerName: paymentData.customerRefused
          ? ""
          : paymentData.customerName || "",
        customerRefused: !!paymentData.customerRefused,
        paymentMethod: paymentData.method,
      });

      // transactionLogger.logTransaction call removed to prevent double logging
      // as addSaleData already handles the persistence to the same table.

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to process payment:", error);

      // Log failure to transaction log
      await transactionLogger.logTransaction({
        id: `FAIL-${paymentData.orderNumber}-${Date.now()}`,
        type: "payment",
        orderId: paymentData.orderNumber,
        amount: paymentData.amount,
        status: "failed",
        timestamp: new Date().toISOString(),
        metadata: {
          error: message,
          provider: paymentData.method,
        },
        paymentMethod: paymentData.method,
        customerId: paymentData.customerName,
      });

      this.emitEvent({
        type: "error",
        source: "system",
        data: { error: message, context: "payment_processing" },
        timestamp: new Date(),
      });
      return false;
    }
  }

  // Process barcode scan with integrated lookup
  async processBarcodeScan(barcode: string): Promise<MenuItem | null> {
    try {
      // In a real implementation, this would look up the barcode in the menu/inventory
      const menuItem = this.findMenuItemByBarcode(barcode);

      if (menuItem) {
        this.emitEvent({
          type: "barcode_scanned",
          source: "barcode_scanner",
          data: { barcode, menuItem },
          timestamp: new Date(),
        });

        return menuItem;
      } else {
        console.warn(`Barcode not found: ${barcode}`);
        return null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to process barcode scan:", error);
      this.emitEvent({
        type: "error",
        source: "barcode_scanner",
        data: { error: message, barcode },
        timestamp: new Date(),
      });
      return null;
    }
  }

  // Process refund with integrated validation
  async processRefund(refundData: {
    orderNumber: string;
    amount: number;
    reason: string;
    paymentMethod: string;
    requestedBy: string;
  }): Promise<boolean> {
    try {
      const refundService = getRefundService();

      // Create a complete refund request object
      const refundRequest = {
        orderId: `order_${refundData.orderNumber}`, // Generate orderId from orderNumber
        orderNumber: refundData.orderNumber,
        customerName: "Customer", // Default value - should be passed from caller
        originalAmount: refundData.amount,
        refundAmount: refundData.amount,
        paymentMethod: refundData.paymentMethod,
        reason: refundData.reason,
        authorizedBy: refundData.requestedBy, // Use requestedBy as authorizedBy for now
        requestedBy: refundData.requestedBy,
      };

      const result = await refundService.createRefundRequest(refundRequest);

      if (result.status === "approved" || result.status === "completed") {
        this.emitEvent({
          type: "refund_requested",
          source: "refund_service",
          data: result,
          timestamp: new Date(),
        });
        return true;
      } else {
        this.emitEvent({
          type: "refund_pending",
          source: "refund_service",
          data: result,
          timestamp: new Date(),
        });
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to process refund:", error);
      this.emitEvent({
        type: "error",
        source: "refund_service",
        data: { error: message, refundData },
        timestamp: new Date(),
      });
      return false;
    }
  }

  // Health monitoring
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 60000); // Check every minute
  }

  private async performHealthCheck(): Promise<void> {
    const errors: string[] = [];

    // Check cash drawer
    if (
      this.settings.system.cashDrawer.enabled &&
      this.status.cashDrawer.error
    ) {
      errors.push(`Cash drawer: ${this.status.cashDrawer.error}`);
    }

    // Check barcode scanner
    if (
      this.settings.system.barcodeScanner.enabled &&
      this.status.barcodeScanner.error
    ) {
      errors.push(`Barcode scanner: ${this.status.barcodeScanner.error}`);
    }

    // Check thermal printer
    if (
      this.settings.system.thermalPrinter.enabled &&
      this.status.thermalPrinter.error
    ) {
      errors.push(`Thermal printer: ${this.status.thermalPrinter.error}`);
    }

    // Check paper status
    if (
      this.settings.system.thermalPrinter.enabled &&
      this.status.thermalPrinter.paperStatus === "empty"
    ) {
      errors.push("Thermal printer: Paper empty");
    }

    this.status.overall.errors = errors;
    this.status.overall.isHealthy = errors.length === 0;
    this.status.overall.lastHealthCheck = new Date();

    this.notifyStatusListeners();

    // Emit health check event
    this.emitEvent({
      type: errors.length > 0 ? "error" : "hardware_connected",
      source: "system",
      data: {
        isHealthy: this.status.overall.isHealthy,
        errors: errors,
        healthCheck: true,
      },
      timestamp: new Date(),
    });
  }

  private updateOverallStatus(): void {
    const errors: string[] = [];

    if (this.status.cashDrawer.error) errors.push(this.status.cashDrawer.error);
    if (this.status.barcodeScanner.error)
      errors.push(this.status.barcodeScanner.error);
    if (this.status.thermalPrinter.error)
      errors.push(this.status.thermalPrinter.error);

    this.status.overall.errors = errors;
    this.status.overall.isHealthy = errors.length === 0;
  }

  // Event handling
  private emitEvent(event: IntegrationEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("Error in event listener:", error);
      }
    });
  }

  onEvent(callback: (event: IntegrationEvent) => void): () => void {
    this.eventListeners.push(callback);
    return () => {
      const index = this.eventListeners.indexOf(callback);
      if (index > -1) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  onStatusChange(callback: (status: SystemStatus) => void): () => void {
    this.statusListeners.push(callback);
    return () => {
      const index = this.statusListeners.indexOf(callback);
      if (index > -1) {
        this.statusListeners.splice(index, 1);
      }
    };
  }

  private notifyStatusListeners(): void {
    this.statusListeners.forEach((listener) => {
      try {
        listener(this.status);
      } catch (error) {
        console.error("Error in status listener:", error);
      }
    });
  }

  // Utility methods
  getStatus(): SystemStatus {
    return { ...this.status };
  }

  isHealthy(): boolean {
    return this.status.overall.isHealthy;
  }

  // Mock method for finding menu items by barcode
  private findMenuItemByBarcode(barcode: string): MenuItem | undefined {
    // In a real implementation, this would query the menu/inventory database
    const mockMenuItems: MenuItem[] = [
      {
        id: "gh-001",
        name: "Jollof Rice with Chicken",
        description:
          "Traditional Ghanaian jollof rice served with grilled chicken",
        price: 25.0,
        category: "ghanaian",
        barcode: "049000028911",
        inStock: true,
      },
      {
        id: "bev-001",
        name: "Coca Cola",
        description: "Refreshing cola beverage",
        price: 5.0,
        category: "beverages",
        barcode: "049000028912",
        inStock: true,
      },
      {
        id: "cont-001",
        name: "Grilled Chicken Breast",
        description: "Tender grilled chicken breast with herbs",
        price: 35.0,
        category: "continental",
        barcode: "049000028913",
        inStock: true,
      },
    ];

    return mockMenuItems.find((item) => item.barcode === barcode);
  }

  // Cleanup
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.eventListeners = [];
    this.statusListeners = [];
    this.isInitialized = false;
  }
}

// Global integration service instance
let integrationServiceInstance: IntegrationService | null = null;

// Get or create integration service instance
export function getIntegrationService(): IntegrationService {
  if (!integrationServiceInstance) {
    integrationServiceInstance = new IntegrationService();
  }
  return integrationServiceInstance;
}

// Initialize the integration service
export async function initializeIntegrationService(): Promise<boolean> {
  const service = getIntegrationService();
  return await service.initialize();
}

// Utility functions for common operations
export async function processPaymentWithIntegration(paymentData: {
  amount: number;
  method: string;
  orderNumber: string;
  orderId?: string;
  items: OrderItem[];
  customerName?: string;
  customerRefused?: boolean;
  orderType?: string;
  tableNumber?: string;
}): Promise<boolean> {
  const service = getIntegrationService();
  return await service.processPayment(paymentData);
}

export async function processBarcodeWithIntegration(
  barcode: string
): Promise<MenuItem | null> {
  const service = getIntegrationService();
  return await service.processBarcodeScan(barcode);
}

export async function processRefundWithIntegration(refundData: {
  orderNumber: string;
  amount: number;
  reason: string;
  paymentMethod: string;
  requestedBy: string;
}): Promise<boolean> {
  const service = getIntegrationService();
  return await service.processRefund(refundData);
}

export function getSystemStatus(): SystemStatus {
  const service = getIntegrationService();
  return service.getStatus();
}

export function subscribeToSystemEvents(
  callback: (event: IntegrationEvent) => void
): () => void {
  const service = getIntegrationService();
  return service.onEvent(callback);
}

export function subscribeToSystemStatus(
  callback: (status: SystemStatus) => void
): () => void {
  const service = getIntegrationService();
  return service.onStatusChange(callback);
}
