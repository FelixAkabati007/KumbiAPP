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
      this.status.isConnected = false;
      this.status.error = "Cash drawer is disabled in settings";
      this.notifyListeners();
      return false;
    }

    try {
      this.status.isConnected = true;
      this.status.error = null;
      this.notifyListeners();
      return true;
    } catch (error) {
      this.status.isConnected = false;
      this.status.error = `Failed to connect: ${error}`;
      this.notifyListeners();
      return false;
    }
  }

  // Open the cash drawer via printer kick (RJ11/RJ12 ESC p pulse) or PrintBridge
  async open(): Promise<boolean> {
    if (!this.config.enabled) {
      this.status.error = "Cash drawer is disabled in settings";
      this.notifyListeners();
      return false;
    }

    try {
      if (typeof window !== "undefined") {
        const response = await fetch("/api/hardware/cash-drawer/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ port: this.config.port }),
        });

        if (!response.ok) {
          const result = await response.json().catch(() => null);
          console.warn("Cash drawer open response:", result);
        }
      }

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

  // Close the cash drawer (if sensor or auto-reset)
  async close(): Promise<boolean> {
    this.status.isOpen = false;
    this.status.error = null;
    this.notifyListeners();
    return true;
  }

  // Test the cash drawer connection
  async test(): Promise<boolean> {
    const connected = await this.connect();
    if (!connected) return false;

    const opened = await this.open();
    if (!opened) return false;

    // Reset drawer state after 1.5 seconds
    setTimeout(() => {
      this.close();
    }, 1500);

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
        audioContext.currentTime + 0.2
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
  config?: CashDrawerConfig
): CashDrawerService {
  if (!cashDrawerInstance) {
    if (!config) {
      throw new Error(
        "Cash drawer configuration required for first initialization"
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
  config: CashDrawerConfig
): Promise<boolean> {
  const service = getCashDrawerService(config);

  if (!config.enabled) {
    console.warn("Cash drawer is disabled in settings");
    return false;
  }

  if (config.requireConfirmation && typeof window !== "undefined") {
    const confirmed = window.confirm("Open cash drawer?");
    if (!confirmed) {
      return false;
    }
  }

  return await service.open();
}

export async function testCashDrawer(
  config: CashDrawerConfig
): Promise<boolean> {
  const service = getCashDrawerService(config);
  return await service.test();
}
