"use client";

import type { ReceiptData } from "./types";

type QzApi = {
  websocket: { isActive: () => boolean; connect: () => Promise<void>; disconnect: () => Promise<void> };
  security: { setCertificatePromise: (callback: () => Promise<string>) => void; setSignaturePromise: (callback: (data: string) => Promise<string>) => void };
  printers: { find: (query?: string) => Promise<string[]>; details: (printer?: string) => Promise<unknown> };
  configs: { create: (printer: string, options?: Record<string, unknown>) => unknown };
  print: (config: unknown, data: unknown[]) => Promise<unknown>;
};

declare global { interface Window { qz?: QzApi } }

let scriptPromise: Promise<QzApi> | null = null;

function loadQz(): Promise<QzApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("QZ Tray is browser-only"));
  if (window.qz) return Promise.resolve(window.qz);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/qz-tray/2.2.4/qz-tray.js";
      script.async = true;
      script.onload = () => window.qz ? resolve(window.qz) : reject(new Error("QZ Tray client did not load"));
      script.onerror = () => reject(new Error("QZ Tray client library could not load"));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

async function connectQz() {
  const qz = await loadQz();
  qz.security.setCertificatePromise(async () => {
    const response = await fetch("/api/qz/certificate");
    if (!response.ok) throw new Error("QZ certificate is not configured");
    return response.text();
  });
  qz.security.setSignaturePromise(async (data) => {
    const response = await fetch("/api/qz/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    if (!response.ok) throw new Error("QZ signing failed");
    return response.text();
  });
  if (!qz.websocket.isActive()) await qz.websocket.connect();
  return qz;
}

export function isQzPrinter(config: { interfaceType?: string; name?: string }) {
  return config.interfaceType === "usb" || config.interfaceType === "printer" || /XP-80[CT]/i.test(config.name ?? "");
}

export async function discoverQzPrinters() {
  const qz = await connectQz();
  return qz.printers.find();
}

export async function printQzReceipt(printerName: string, receipt: ReceiptData, paperWidth = 80) {
  const qz = await connectQz();
  const printers = await qz.printers.find();
  const printer = printers.find((name) => name === printerName)
    ?? printers.find((name) => /XP-80[CT]/i.test(name))
    ?? printerName;
  const config = qz.configs.create(printer, { size: { width: paperWidth, units: "mm" }, margins: 0, density: 203, colorType: "blackwhite" });
  const lines = [receipt.businessName ?? "KumbiAPP", receipt.businessAddress ?? "", `Order #: ${receipt.orderNumber}`, `${receipt.date} ${receipt.time}`, "------------------------------------------", ...receipt.items.map((item) => `${item.quantity} x ${item.name}  ${item.total.toFixed(2)}`), "------------------------------------------", `TOTAL: ${receipt.total.toFixed(2)}`, "", "Thank you for your business!", "\n\n\n"];
  await qz.print(config, [{ type: "raw", format: "plain", data: lines.join("\n") }]);
}
