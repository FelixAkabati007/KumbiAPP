import type { PrinterConfig } from "@/lib/settings";
import type { ReceiptData } from "@/lib/types";

const DEFAULT_PRINTBRIDGE_URL = "http://127.0.0.1:1337";

export async function printWithBridge(receipt: ReceiptData, config: PrinterConfig) {
  return printToBridgeUrl(receipt, config, process.env.PRINTBRIDGE_URL || DEFAULT_PRINTBRIDGE_URL);
}

export async function printWithLocalBridge(receipt: ReceiptData, config: PrinterConfig) {
  return printToBridgeUrl(receipt, config, DEFAULT_PRINTBRIDGE_URL);
}

function receiptText(receipt: ReceiptData, config: PrinterConfig) {
  const lines = [
    receipt.businessName || "Kumbisaly Heritage Restaurant",
    receipt.businessAddress || "",
    receipt.businessPhone ? `Tel: ${receipt.businessPhone}` : "",
    "",
    `Order #: ${receipt.orderNumber}`,
    `${receipt.date} ${receipt.time}`,
    receipt.tableNumber ? `Table: ${receipt.tableNumber}` : "",
    "-".repeat(config.paperWidth === 80 ? 42 : 32),
    ...receipt.items.map((item) => `${item.quantity} x ${item.name}    ${item.total.toFixed(2)}`),
    "-".repeat(config.paperWidth === 80 ? 42 : 32),
    `Subtotal: ${receipt.subtotal.toFixed(2)}`,
    `Tax: ${receipt.tax.toFixed(2)}`,
    `TOTAL: ${receipt.total.toFixed(2)}`,
    "",
    ...(config.includeFooter ? [config.footerText || "Thank you for your business!", "Please come again."] : []),
    "",
  ].filter(Boolean);

  return lines.join("\n");
}

async function printToBridgeUrl(receipt: ReceiptData, config: PrinterConfig, baseUrl: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.PRINTBRIDGE_API_KEY) {
    headers["X-PrintBridge-Api-Key"] = process.env.PRINTBRIDGE_API_KEY;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/print`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      printerName: config.name || "XP-80T",
      format: "escpos",
      content: receiptText(receipt, config),
      options: {
        paperWidth: config.paperWidth,
        autoCut: config.autoCut,
        cashDrawer: false,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`PrintBridge rejected the job (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  return response.json().catch(() => ({ success: true }));
}

export function isLocalBridgePrinter(config: PrinterConfig) {
  return config.interfaceType === "usb" || config.interfaceType === "serial";
}
