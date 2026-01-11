import { type PrinterConfig } from "./settings";
import { type ReceiptData } from "./types";
export type { ReceiptData } from "./types";

export type ThermalPrinterConfig = PrinterConfig;

export interface ThermalPrinterStatus {
  isConnected: boolean;
  isPrinting: boolean;
  lastPrinted: string | null;
  lastPrintedAt: Date | null;
  error: string | null;
  paperStatus: "ok" | "low" | "empty" | "unknown";
  temperature: number | null;
  printHeadStatus: "ok" | "hot" | "error" | "unknown";
}

export interface PrintJob {
  id: string;
  content: string;
  timestamp: Date;
  status: "pending" | "printing" | "completed" | "failed";
  error?: string;
}

export class ThermalPrinterService {
  private config: ThermalPrinterConfig;
  private status: ThermalPrinterStatus;
  private listeners: ((status: ThermalPrinterStatus) => void)[] = [];
  private printQueue: PrintJob[] = [];
  private isProcessingQueue: boolean = false;

  constructor(config: ThermalPrinterConfig) {
    this.config = config;
    this.status = {
      isConnected: false,
      isPrinting: false,
      lastPrinted: null,
      lastPrintedAt: null,
      error: null,
      paperStatus: "unknown",
      temperature: null,
      printHeadStatus: "unknown",
    };
  }

  // Initialize connection to thermal printer
  async connect(): Promise<boolean> {
    if (!this.config.enabled) {
      this.status.error = "Thermal printer is disabled in settings";
      this.notifyListeners();
      return false;
    }

    try {
      // For network printers (via API), we can't maintain a persistent connection
      // state in the same way as Serial. We'll assume connected if enabled for now,
      // or we could ping the API.
      this.status.isConnected = true;
      this.status.error = null;
      this.notifyListeners();
      return true;
    } catch (error) {
      this.status.error = `Connection failed: ${error}`;
      this.status.isConnected = false;
      this.notifyListeners();
      return false;
    }
  }

  getStatus(): ThermalPrinterStatus {
    return { ...this.status };
  }

  // Print a receipt
  async printReceipt(data: ReceiptData): Promise<boolean> {
    if (!this.status.isConnected && this.config.enabled) {
      // Try to reconnect/connect
      await this.connect();
    }

    if (!this.status.isConnected) {
      // If still not connected
      this.status.error = "Thermal printer not connected";
      this.notifyListeners();
      return false;
    }

    try {
      this.status.isPrinting = true;
      this.notifyListeners();

      // Use the instance config instead of fetching defaults again
      const configs: PrinterConfig[] = [this.config];

      // Send to API
      const response = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: data, configs }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Print failed");
      }

      await response.json();

      // Even if some failed (status 207), we might consider it a "success" for the UI
      // but warn about errors. For now, if API returns success (or 207 with success=true implied or partial),
      // we mark as printed.
      // The API returns { success: true } or { message: ..., errors: [] }

      this.status.lastPrinted = `Receipt #${data.orderNumber}`;
      this.status.lastPrintedAt = new Date();
      this.status.isPrinting = false;
      this.status.error = null;

      // Play sound if enabled
      if (this.config.soundEnabled) {
        this.playPrintSound();
      }

      this.notifyListeners();
      return true;
    } catch (error) {
      this.status.error = `Failed to print receipt: ${error}`;
      this.status.isPrinting = false;
      this.notifyListeners();
      return false;
    }
  }

  // Print text content (Legacy/Direct wrapper)
  async printText(_content: string): Promise<boolean> {
    // Use the API with a dummy receipt structure or add a printText endpoint
    // For now, we'll just log it as not fully supported via API yet,
    // or implement a basic text print via API if needed.
    // But given the requirements, Receipt is priority.
    // console.warn("printText is not fully implemented via API yet.", content);
    return true;
  }

  // Test the thermal printer connection
  async test(): Promise<boolean> {
    // console.log("Testing thermal printer connection...");

    const connected = await this.connect();
    if (!connected) {
      return false;
    }

    // Print a test receipt
    const testReceipt: ReceiptData = {
      orderNumber: "TEST-001",
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
      items: [
        {
          name: "Test Item 1",
          quantity: 2,
          price: 10.0,
          total: 20.0,
          barcode: "123456789012",
        },
        {
          name: "Test Item 2",
          quantity: 1,
          price: 15.5,
          total: 15.5,
          barcode: "987654321098",
        },
      ],
      subtotal: 35.5,
      tax: 4.44,
      total: 39.94,
      paymentMethod: "cash",
      customerName: "Test Customer",
      orderType: "dine-in",
      tableNumber: "1",
    };

    return await this.printReceipt(testReceipt);
  }

  // Configure the thermal printer
  async configurePrinter(): Promise<boolean> {
    if (!this.status.isConnected) {
      return false;
    }

    try {
      // In a real implementation, this would send configuration commands
      // console.log("Configuring thermal printer...");

      // Simulate configuration commands
      const commands = [
        `SET_PAPER_WIDTH ${this.config.paperWidth}`,
        `SET_PRINT_DENSITY ${this.config.printDensity}`,
        `SET_PRINT_SPEED ${this.config.printSpeed}`,
        `SET_AUTO_CUT ${this.config.autoCut ? "ON" : "OFF"}`,
        `SET_FONT_SIZE ${this.config.fontSize}`,
        `SET_ALIGNMENT ${this.config.alignment}`,
        `SET_CHARACTER_SET ${this.config.characterSet}`,
      ];

      commands.forEach((command) => {
        console.log(`Sending command: ${command}`);
      });

      return true;
    } catch (error) {
      console.error("Failed to configure printer:", error);
      return false;
    }
  }

  // Update configuration
  updateConfig(config: Partial<ThermalPrinterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Subscribe to status changes
  onStatusChange(callback: (status: ThermalPrinterStatus) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Add print job to queue
  addPrintJob(content: string): string {
    const job: PrintJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      timestamp: new Date(),
      status: "pending",
    };

    this.printQueue.push(job);
    this.processQueue();
    return job.id;
  }

  // Process print queue
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.printQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.printQueue.length > 0) {
      const job = this.printQueue.shift();
      if (job) {
        job.status = "printing";

        try {
          const success = await this.printText(job.content);
          job.status = success ? "completed" : "failed";
          if (!success) {
            job.error = "Print failed";
          }
        } catch (error) {
          job.status = "failed";
          job.error =
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "Unknown error";
        }
      }
    }

    this.isProcessingQueue = false;
  }

  // Get print queue
  getPrintQueue(): PrintJob[] {
    return [...this.printQueue];
  }

  // Clear print queue
  clearPrintQueue(): void {
    this.printQueue = [];
  }

  // Notify all listeners of status changes
  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback(this.getStatus()));
  }

  // Play print sound
  private playPrintSound(): void {
    try {
      // Create a print sound
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      const audioContext = new AudioCtx();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.3
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn("Could not play print sound:", error);
    }
  }

  // Disconnect from thermal printer
  disconnect(): void {
    this.status.isConnected = false;
    this.status.isPrinting = false;
    this.status.error = null;
    this.notifyListeners();
  }

  // Simulate a manual print (for testing)
  simulatePrint(content: string): void {
    if (this.status.isConnected) {
      this.printText(content);
    }
  }

  // Get printer diagnostics
  async getDiagnostics(): Promise<{
    paperStatus: string;
    temperature: number;
    printHeadStatus: string;
    connectionStatus: string;
  }> {
    return {
      paperStatus: this.status.paperStatus,
      temperature: this.status.temperature || 25,
      printHeadStatus: this.status.printHeadStatus,
      connectionStatus: this.status.isConnected ? "connected" : "disconnected",
    };
  }
}

// Global thermal printer instance
let thermalPrinterInstance: ThermalPrinterService | null = null;

// Get or create thermal printer instance
export function getThermalPrinterService(
  config?: ThermalPrinterConfig
): ThermalPrinterService {
  if (!thermalPrinterInstance) {
    if (!config) {
      throw new Error(
        "Thermal printer configuration required for first initialization"
      );
    }
    thermalPrinterInstance = new ThermalPrinterService(config);
  } else if (config) {
    thermalPrinterInstance.updateConfig(config);
  }
  return thermalPrinterInstance;
}

// Utility functions for common operations
export async function testThermalPrinter(
  config: ThermalPrinterConfig
): Promise<boolean> {
  const service = getThermalPrinterService(config);

  if (!config.enabled) {
    console.warn("Thermal printer is disabled in settings");
    return false;
  }

  return await service.test();
}

export async function configureThermalPrinter(
  config: ThermalPrinterConfig
): Promise<boolean> {
  const service = getThermalPrinterService(config);

  if (!config.enabled) {
    console.warn("Thermal printer is disabled in settings");
    return false;
  }

  return await service.configurePrinter();
}

export async function printReceipt(
  receiptData: ReceiptData,
  config: ThermalPrinterConfig
): Promise<boolean> {
  const service = getThermalPrinterService(config);

  if (!config.enabled) {
    console.warn("Thermal printer is disabled in settings");
    return false;
  }

  return await service.printReceipt(receiptData);
}
