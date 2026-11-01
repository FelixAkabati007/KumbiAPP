export interface BarcodeScannerConfig {
  enabled: boolean;
  port: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  autoFocus: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  suffix: string;
  prefix: string;
  timeout: number;
}

export interface BarcodeScannerStatus {
  isConnected: boolean;
  isScanning: boolean;
  lastScanned: string | null;
  lastScannedAt: Date | null;
  error: string | null;
  batteryLevel?: number;
  signalStrength?: number;
}

export interface BarcodeData {
  code: string;
  type: string;
  timestamp: Date;
  rawData: string;
}

export class BarcodeScannerService {
  private config: BarcodeScannerConfig;
  private status: BarcodeScannerStatus;
  private listeners: ((status: BarcodeScannerStatus) => void)[] = [];
  private dataListeners: ((data: BarcodeData) => void)[] = [];
  private keyboardBuffer: string = "";
  private lastKeyTime: number = 0;
  private keyboardListenerAttached: boolean = false;

  constructor(config: BarcodeScannerConfig) {
    this.config = config;
    this.status = {
      isConnected: false,
      isScanning: false,
      lastScanned: null,
      lastScannedAt: null,
      error: null,
    };
  }

  // Initialize connection to barcode scanner
  async connect(): Promise<boolean> {
    if (!this.config.enabled) {
      this.status.error = "Barcode scanner is disabled in settings";
      this.notifyListeners();
      return false;
    }

    try {
      this.status.isConnected = true;
      this.status.error = null;
      this.notifyListeners();

      // Start listening for keyboard wedge / HID events
      this.startDataListener();

      return true;
    } catch (error) {
      this.status.error = `Failed to connect: ${error}`;
      this.notifyListeners();
      return false;
    }
  }

  // Start listening for barcode scanner hardware keystroke bursts (USB/Bluetooth HID wedge)
  private startDataListener(): void {
    if (typeof window === "undefined" || this.keyboardListenerAttached) return;
    this.keyboardListenerAttached = true;

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      // Ignore if modifier keys are pressed
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      const interval = now - this.lastKeyTime;
      this.lastKeyTime = now;

      if (e.key === "Enter") {
        if (this.keyboardBuffer.length >= 3) {
          const scanned = this.keyboardBuffer;
          this.keyboardBuffer = "";
          this.processBarcodeData(scanned);
        } else {
          this.keyboardBuffer = "";
        }
        return;
      }

      // Characters arriving rapidly (< 75ms) are characteristic of a hardware scanner
      if (e.key.length === 1) {
        if (interval > 250) {
          this.keyboardBuffer = e.key;
        } else {
          this.keyboardBuffer += e.key;
        }
      }
    });
  }

  // Process incoming barcode data
  processBarcodeData(rawData: string): void {
    try {
      let processedData = rawData.trim();
      if (this.config.prefix && processedData.startsWith(this.config.prefix)) {
        processedData = processedData.substring(this.config.prefix.length);
      }
      if (this.config.suffix && processedData.endsWith(this.config.suffix)) {
        processedData = processedData.substring(
          0,
          processedData.length - this.config.suffix.length
        );
      }

      const barcodeType = this.determineBarcodeType(processedData);

      const barcodeData: BarcodeData = {
        code: processedData,
        type: barcodeType,
        timestamp: new Date(),
        rawData: rawData,
      };

      // Update status
      this.status.lastScanned = processedData;
      this.status.lastScannedAt = new Date();
      this.status.isScanning = true;
      this.notifyListeners();

      // Play sound if enabled
      if (this.config.soundEnabled) {
        this.playScanSound();
      }

      // Vibrate if enabled
      if (this.config.vibrationEnabled) {
        this.vibrate();
      }

      // Notify data listeners
      this.notifyDataListeners(barcodeData);

      // Reset scanning status after brief indication
      setTimeout(() => {
        this.status.isScanning = false;
        this.notifyListeners();
      }, 400);
    } catch (error) {
      console.error("Error processing barcode data:", error);
      this.status.error = `Failed to process barcode data: ${error}`;
      this.notifyListeners();
    }
  }

  // Determine barcode type based on data
  private determineBarcodeType(data: string): string {
    if (data.length === 12 && /^\d+$/.test(data)) {
      return "UPC-A";
    } else if (data.length === 13 && /^\d+$/.test(data)) {
      return "EAN-13";
    } else if (data.length === 8 && /^\d+$/.test(data)) {
      return "EAN-8";
    } else if (data.length === 14 && /^\d+$/.test(data)) {
      return "GTIN-14";
    } else if (/^[0-9A-Z\-.$/+% ]+$/i.test(data)) {
      return "Code 128 / Code 39";
    } else {
      return "QR / 2D Matrix";
    }
  }

  // Test the barcode scanner connection
  async test(): Promise<boolean> {
    const connected = await this.connect();
    return connected;
  }

  // Send configuration commands to scanner
  async configureScanner(): Promise<boolean> {
    return this.status.isConnected;
  }

  // Get current status
  getStatus(): BarcodeScannerStatus {
    return { ...this.status };
  }

  // Update configuration
  updateConfig(config: Partial<BarcodeScannerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Subscribe to status changes
  onStatusChange(callback: (status: BarcodeScannerStatus) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Subscribe to barcode data
  onBarcodeData(callback: (data: BarcodeData) => void): () => void {
    this.dataListeners.push(callback);
    return () => {
      const index = this.dataListeners.indexOf(callback);
      if (index > -1) {
        this.dataListeners.splice(index, 1);
      }
    };
  }

  // Notify all listeners of status changes
  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback(this.getStatus()));
  }

  // Notify all listeners of barcode data
  private notifyDataListeners(data: BarcodeData): void {
    this.dataListeners.forEach((callback) => callback(data));
  }

  // Play scan sound
  private playScanSound(): void {
    try {
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

      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.warn("Could not play scan sound:", error);
    }
  }

  // Vibrate device (if supported)
  private vibrate(): void {
    try {
      if ("vibrate" in navigator) {
        navigator.vibrate(100);
      }
    } catch (error) {
      console.warn("Could not vibrate device:", error);
    }
  }

  // Disconnect from barcode scanner
  disconnect(): void {
    this.status.isConnected = false;
    this.status.isScanning = false;
    this.status.error = null;
    this.notifyListeners();
  }

  // Simulate a manual scan (for testing)
  simulateScan(barcode: string): void {
    if (this.status.isConnected) {
      this.processBarcodeData(barcode);
    }
  }
}

// Global barcode scanner instance
let barcodeScannerInstance: BarcodeScannerService | null = null;

// Get or create barcode scanner instance
export function getBarcodeScannerService(
  config?: BarcodeScannerConfig
): BarcodeScannerService {
  if (!barcodeScannerInstance) {
    if (!config) {
      throw new Error(
        "Barcode scanner configuration required for first initialization"
      );
    }
    barcodeScannerInstance = new BarcodeScannerService(config);
  } else if (config) {
    barcodeScannerInstance.updateConfig(config);
  }
  return barcodeScannerInstance;
}

// Utility functions for common operations
export async function testBarcodeScanner(
  config: BarcodeScannerConfig
): Promise<boolean> {
  const service = getBarcodeScannerService(config);

  if (!config.enabled) {
    console.warn("Barcode scanner is disabled in settings");
    return false;
  }

  return await service.test();
}

export async function configureBarcodeScanner(
  config: BarcodeScannerConfig
): Promise<boolean> {
  const service = getBarcodeScannerService(config);

  if (!config.enabled) {
    console.warn("Barcode scanner is disabled in settings");
    return false;
  }

  return await service.configureScanner();
}
