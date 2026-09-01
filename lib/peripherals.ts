import {
  BarcodeScannerService,
  type BarcodeData,
  type BarcodeScannerConfig,
} from "@/lib/barcode-scanner";
import {
  ThermalPrinterService,
  type ReceiptData,
  type ThermalPrinterConfig,
} from "@/lib/thermal-printer";

export interface BarcodeScannerPort {
  connect(): Promise<boolean>;
  disconnect(): void;
  getStatus(): unknown;
  onData(listener: (data: BarcodeData) => void): () => void;
}

export interface ThermalPrinterPort {
  connect(): Promise<boolean>;
  getStatus(): unknown;
  printReceipt(receipt: ReceiptData): Promise<boolean>;
}

export function createBarcodeScanner(config: BarcodeScannerConfig): BarcodeScannerPort {
  const service = new BarcodeScannerService(config);
  return {
    connect: () => service.connect(),
    disconnect: () => service.disconnect(),
    getStatus: () => service.getStatus(),
    onData: (listener) => service.onBarcodeData(listener),
  };
}

export function createThermalPrinter(config: ThermalPrinterConfig): ThermalPrinterPort {
  const service = new ThermalPrinterService(config);
  return {
    connect: () => service.connect(),
    getStatus: () => service.getStatus(),
    printReceipt: (receipt) => service.printReceipt(receipt),
  };
}
