import type { PrinterConfig } from "@/lib/settings";
import type { ReceiptData } from "@/lib/types";

const DEFAULT_PRINTBRIDGE_URL = "http://127.0.0.1:1337";

export async function printWithBridge(receipt: ReceiptData, config: PrinterConfig) {
  const baseUrl = process.env.PRINTBRIDGE_URL || DEFAULT_PRINTBRIDGE_URL;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/print`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      printer: config.name || "XP-80T",
      paperWidth: config.paperWidth,
      interfaceType: config.interfaceType,
      receipt,
      options: {
        autoCut: config.autoCut,
        soundEnabled: config.soundEnabled,
        includeFooter: config.includeFooter,
        footerText: config.footerText,
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
