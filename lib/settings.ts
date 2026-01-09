export interface PrinterConfig {
  enabled: boolean;
  interfaceType: "tcp" | "serial" | "usb";
  ip?: string;
  port: string | number;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  paperWidth: number;
  printDensity: number;
  printSpeed: number;
  autoCut: boolean;
  soundEnabled: boolean;
  includeLogo: boolean;
  includeBarcode: boolean;
  includeFooter: boolean;
  fontSize: string;
  alignment: string;
  characterSet: string;
  footerText?: string;
  name?: string;
}

export interface AppSettings {
  theme: string;
  notifications: {
    orderAlerts: boolean;
    lowStockAlerts: boolean;
    paymentAlerts: boolean;
    soundEnabled: boolean;
    emailNotifications: boolean;
  };
  account: {
    restaurantName: string;
    ownerName: string;
    email: string;
    phone: string;
    address: string;
    logo: string;
  };
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  system: {
    autoBackup: boolean;
    receiptPrinter: string;
    taxRate: number;
    currency: string;
    language: string;
    compactMode?: boolean;
    animations?: boolean;
    cashDrawer: {
      enabled: boolean;
      port: string;
      baudRate: number;
      autoOpen: boolean;
      requireConfirmation: boolean;
      soundEnabled: boolean;
    };
    barcodeScanner: {
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
    };
    thermalPrinter: PrinterConfig;
    secondaryPrinter?: PrinterConfig;
    refunds: {
      enabled: boolean;
      maxManagerRefund: number;
      requireApproval: boolean;
      approvalThreshold: number;
      allowedPaymentMethods: string[];
      autoApproveSmallAmounts: boolean;
      smallAmountThreshold: number;
      timeLimit: number;
      partialRefunds: boolean;
      restockingFee: number;
    };
  };
  security: {
    requireLogin: boolean;
    sessionTimeout: number;
    twoFactorAuth: boolean;
  };
}

const defaultSettings: AppSettings = {
  theme: "system",
  notifications: {
    orderAlerts: true,
    lowStockAlerts: true,
    paymentAlerts: true,
    soundEnabled: true,
    emailNotifications: false,
  },
  account: {
    restaurantName: "Kumbisaly Heritage Restaurant",
    ownerName: "",
    email: "",
    phone: "",
    address: "Offinso - Abofour, Ashanti, Ghana.",
    logo: "",
  },
  businessName: "",
  businessAddress: "Offinso - Abofour, Ashanti, Ghana.",
  businessPhone: "0535975442",
  businessEmail: "info.kumbisalyheritagehotel@gmail.com",
  system: {
    autoBackup: true,
    receiptPrinter: "Thermal Printer",
    taxRate: 12.5,
    currency: "GHS",
    language: "en",
    compactMode: false,
    animations: true,
    cashDrawer: {
      enabled: false,
      port: "COM1",
      baudRate: 9600,
      autoOpen: true,
      requireConfirmation: false,
      soundEnabled: true,
    },
    barcodeScanner: {
      enabled: false,
      port: "COM2",
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoFocus: true,
      soundEnabled: true,
      vibrationEnabled: false,
      suffix: "\r\n",
      prefix: "",
      timeout: 1000,
    },
    thermalPrinter: {
      enabled: false,
      interfaceType: "tcp",
      ip: "192.168.1.200",
      port: 9100,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      paperWidth: 58,
      printDensity: 8,
      printSpeed: 10,
      autoCut: true,
      soundEnabled: true,
      includeLogo: true,
      includeBarcode: true,
      includeFooter: true,
      fontSize: "12",
      alignment: "center",
      characterSet: "1252",
      footerText: "",
      name: "Primary Printer",
    },
    secondaryPrinter: {
      enabled: false,
      interfaceType: "tcp",
      ip: "192.168.1.201",
      port: 9100,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      paperWidth: 58,
      printDensity: 8,
      printSpeed: 10,
      autoCut: true,
      soundEnabled: true,
      includeLogo: true,
      includeBarcode: true,
      includeFooter: true,
      fontSize: "12",
      alignment: "center",
      characterSet: "1252",
      footerText: "",
      name: "Kitchen Printer",
    },
    refunds: {
      enabled: true,
      maxManagerRefund: 200,
      requireApproval: true,
      approvalThreshold: 500,
      allowedPaymentMethods: ["cash", "card", "mobile"],
      autoApproveSmallAmounts: true,
      smallAmountThreshold: 50,
      timeLimit: 24,
      partialRefunds: true,
      restockingFee: 0,
    },
  },
  security: {
    requireLogin: false,
    sessionTimeout: 30,
    twoFactorAuth: false,
  },
};

// Async function to fetch settings from API
export async function fetchSettings(): Promise<AppSettings> {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) {
      if (res.status === 404) return defaultSettings;
      throw new Error(`Failed to fetch settings: ${res.statusText}`);
    }
    const data = await res.json();
    if (Object.keys(data).length === 0) return defaultSettings;

    // Deep merge with default settings to ensure all fields exist
    return {
      ...defaultSettings,
      ...data,
      notifications: {
        ...defaultSettings.notifications,
        ...(data.notifications || {}),
      },
      account: { ...defaultSettings.account, ...(data.account || {}) },
      system: {
        ...defaultSettings.system,
        ...(data.system || {}),
        cashDrawer: {
          ...defaultSettings.system.cashDrawer,
          ...(data.system?.cashDrawer || {}),
        },
        barcodeScanner: {
          ...defaultSettings.system.barcodeScanner,
          ...(data.system?.barcodeScanner || {}),
        },
        refunds: {
          ...defaultSettings.system.refunds,
          ...(data.system?.refunds || {}),
        },
      },
    };
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return defaultSettings;
  }
}

// Kept for synchronous compatibility during migration, but prefers API if possible
export function getSettings(_useDefaults = false): AppSettings {
  void _useDefaults;
  // Synchronous access is deprecated in Neon-only mode.
  // Returns defaults to avoid blocking render. Components must use fetchSettings().
  return defaultSettings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  // Sync with DB
  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
  } catch (error) {
    console.error("Failed to save settings to DB:", error);
  }
}

export function getCurrentLogo(): string {
  // Deprecated synchronous access
  return defaultSettings.account.logo || "";
}
