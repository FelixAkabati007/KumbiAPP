export interface CashDrawerConfig {
  enabled: boolean;
  port: string;
  baudRate: number;
  autoOpen: boolean;
  requireConfirmation: boolean;
  soundEnabled: boolean;
}

export interface CashDrawerStatus {
  isConnected: boolean;
  isOpen: boolean;
  lastOpened: Date | null;
  error: string | null;
}

export class CashDrawerService {
  private config: CashDrawerConfig;
  private status: CashDrawerStatus;
  private port: unknown | null = null; // SerialPort instance
  private listeners: ((status: CashDrawerStatus) => void)[] = [];

  constructor(config: CashDrawerConfig) {
    this.config = config;
    this.status = {
      isConnected: false,
      isOpen: false,
      lastOpened: null,
      error: null,
    };
  }

  // Initialize connection to cash drawer
  async connect(): Promise<boolean> {
    if (!this.config.enabled) {
      this.status.error = "Cash drawer is disabled in settings";
      this.notifyListeners();
      return false;
    }

    try {
      // In a real implementation, this would use a library like 'serialport'
      // For now, we'll simulate the connection
      console.log(
        `Connecting to cash drawer on ${this.config.port} at ${this.config.baudRate} baud`,
      );

      // Simulate connection delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      this.status.isConnected = true;
      this.status.error = null;
      this.notifyListeners();

      return true;
    } catch (error) {
      this.status.error = `Failed to connect: ${error}`;
      this.notifyListeners();
      return false;
    }
  }

  // Open the cash drawer
  async open(): Promise<boolean> {
    if (!this.status.isConnected) {
      this.status.error = "Cash drawer not connected";
      this.notifyListeners();
      return false;
    }

    try {
      // Send open command to cash drawer
      // Common commands: ESC p (0) (0) (0) or ESC p (0) (0) (0) (0)
      const openCommand = Buffer.from([0x1b, 0x70, 0x00, 0x00, 0x00]);

      // In a real implementation, this would send the command via serial port
      console.log("Sending cash drawer open command:", openCommand);

      // Simulate opening delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      this.status.isOpen = true;
      this.status.lastOpened = new Date();
      this.status.error = null;

      // Play sound if enabled
      if (this.config.soundEnabled) {
        this.playOpenSound();
      }

      this.notifyListeners();
      return true;
    } catch (error) {
      this.status.error = `Failed to open drawer: ${error}`;
      this.notifyListeners();
      return false;
    }
  }

  // Close the cash drawer (if it has a sensor)
  async close(): Promise<boolean> {
    if (!this.status.isConnected) {
      return false;
    }

    try {
      // Simulate closing delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      this.status.isOpen = false;
      this.status.error = null;
      this.notifyListeners();
      return true;
    } catch (error) {
      this.status.error = `Failed to close drawer: ${error}`;
      this.notifyListeners();
      return false;
    }
  }

  // Test the cash drawer connection
  async test(): Promise<boolean> {
    console.log("Testing cash drawer connection...");

    const connected = await this.connect();
    if (!connected) {
      return false;
    }

    // Test opening
    const opened = await this.open();
    if (!opened) {
      return false;
    }

    // Wait a moment then close
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await this.close();

    return true;
  }

  // Get current status
  getStatus(): CashDrawerStatus {
    return { ...this.status };
  }

  // Update configuration
  updateConfig(config: Partial<CashDrawerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Subscribe to status changes
  onStatusChange(callback: (status: CashDrawerStatus) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Notify all listeners of status changes
  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback(this.getStatus()));
  }

  // Play opening sound
  private playOpenSound(): void {
    try {
      // Create a simple beep sound
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

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2,
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.warn("Could not play cash drawer sound:", error);
    }
  }

  // Disconnect from cash drawer
  disconnect(): void {
    this.status.isConnected = false;
    this.status.isOpen = false;
    this.status.error = null;
    this.notifyListeners();
  }
}

// Global cash drawer instance
let cashDrawerInstance: CashDrawerService | null = null;

// Get or create cash drawer instance
export function getCashDrawerService(
  config?: CashDrawerConfig,
): CashDrawerService {
  if (!cashDrawerInstance) {
    if (!config) {
      throw new Error(
        "Cash drawer configuration required for first initialization",
      );
    }
    cashDrawerInstance = new CashDrawerService(config);
  } else if (config) {
    cashDrawerInstance.updateConfig(config);
  }
  return cashDrawerInstance;
}

// Utility functions for common operations
export async function openCashDrawer(
  config: CashDrawerConfig,
): Promise<boolean> {
  const service = getCashDrawerService(config);

  if (!config.enabled) {
    console.warn("Cash drawer is disabled in settings");
    return false;
  }

  if (config.requireConfirmation) {
    // In a real app, you might show a confirmation dialog here
    const confirmed = window.confirm("Open cash drawer?");
    if (!confirmed) {
      return false;
    }
  }

  return await service.open();
}

export async function testCashDrawer(
  config: CashDrawerConfig,
): Promise<boolean> {
  const service = getCashDrawerService(config);
  return await service.test();
}
