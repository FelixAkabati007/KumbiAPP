import {
  ThermalPrinter,
  PrinterTypes,
  CharacterSet,
} from "node-thermal-printer";
import { ReceiptData } from "@/lib/types";
import { PrinterConfig } from "@/lib/settings";

export async function printToPrinter(
  config: PrinterConfig,
  receipt: ReceiptData,
): Promise<void> {
  if (!config.enabled) return;

  // Determine interface
  let printerInterface = config.port.toString();
  if (config.interfaceType === "tcp") {
    printerInterface = `tcp://${config.ip || "127.0.0.1"}:${config.port}`;
  } else if (config.interfaceType === "serial") {
    // Serial not fully supported in this server-side implementation without additional native modules
    // defaulting to file/console for safety or attempting raw path if linux
    console.warn(
      "Serial printing from server requires specific environment setup.",
    );
    // For windows/linux serial, node-thermal-printer often expects a path like /dev/ttyS0 or COM1
    // But direct hardware access from a generic node process might need privileges.
    // We'll pass the port string directly (e.g. "COM1") and hope the library handles it or we'd need 'electron-printer' etc.
    // node-thermal-printer supports 'printer' driver which is system driver.
    // For now, let's focus on TCP as requested "wireless".
  }

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON, // Default to EPSON (ESC/POS)
    interface: printerInterface,
    characterSet: CharacterSet.PC852_LATIN2, // Default
    removeSpecialCharacters: false,
    lineCharacter: "=",
    width: config.paperWidth === 80 ? 48 : 32, // approx chars for 80mm vs 58mm
    options: {
      timeout: 5000,
    },
  });

  const isConnected = await printer.isPrinterConnected();
  if (!isConnected) {
    throw new Error(`Printer at ${printerInterface} is not connected`);
  }

  // Header
  printer.alignCenter();
  if (config.includeLogo) {
    // Logo printing usually requires a path or buffer. Skipping for now or text fallback.
    printer.println(config.name || "Restaurant");
  } else {
    printer.println("Receipt");
  }
  printer.newLine();

  printer.alignLeft();
  printer.println(`Order: ${receipt.orderNumber}`);
  printer.println(`Date: ${receipt.date} ${receipt.time}`);
  printer.println(`Table: ${receipt.tableNumber || "N/A"}`);
  printer.println(`Type: ${receipt.orderType || "Dine-in"}`);
  printer.drawLine();

  // Items
  receipt.items.forEach((item) => {
    printer.tableCustom([
      { text: item.name, align: "LEFT", width: 0.5 },
      { text: `${item.quantity}x`, align: "CENTER", width: 0.2 },
      { text: item.total.toFixed(2), align: "RIGHT", width: 0.3 },
    ]);
  });

  printer.drawLine();

  // Totals
  printer.alignRight();
  printer.println(`Subtotal: ${receipt.subtotal.toFixed(2)}`);
  printer.println(`Tax: ${receipt.tax.toFixed(2)}`);
  printer.bold(true);
  printer.println(`TOTAL: ${receipt.total.toFixed(2)}`);
  printer.bold(false);
  printer.newLine();

  // Footer
  printer.alignCenter();
  printer.println(`Payment: ${receipt.paymentMethod}`);
  if (config.includeFooter && config.footerText) {
    printer.println(config.footerText);
  }
  printer.println("Thank you!");

  if (config.autoCut) {
    printer.cut();
  }

  if (config.soundEnabled) {
    printer.beep();
  }

  try {
    await printer.execute();
  } catch (error) {
    throw new Error(`Failed to execute print job: ${error}`);
  }
}

export async function printReceipt(
  receipt: ReceiptData,
  configs: PrinterConfig[],
) {
  const results = await Promise.allSettled(
    configs.map((config) => {
      if (!config.enabled) return Promise.resolve();
      return printToPrinter(config, receipt);
    }),
  );

  const errors = results
    .filter((r) => r.status === "rejected")
    .map((r) => (r as PromiseRejectedResult).reason);

  if (errors.length > 0) {
    console.error("Some print jobs failed:", errors);
    // We don't throw here to allow partial success, but we could return status
    return { success: false, errors };
  }

  return { success: true };
}
