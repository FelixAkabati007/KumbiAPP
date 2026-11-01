import { NextResponse } from "next/server";
import net from "net";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";
import type { PrinterConfig, AppSettings } from "@/lib/settings";

const DEFAULT_PRINTBRIDGE_URL = "http://127.0.0.1:1337";

async function pingTcpPrinter(
  ip: string,
  port: number,
  timeoutMs = 1500
): Promise<{ online: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    socket.setTimeout(timeoutMs);

    socket.connect(port, ip, () => {
      if (settled) return;
      settled = true;
      const latency = Date.now() - start;
      socket.end();
      socket.destroy();
      resolve({ online: true, latencyMs: latency });
    });

    socket.on("error", (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ online: false, error: err.message });
    });

    socket.on("timeout", () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ online: false, error: `Connection timed out after ${timeoutMs}ms` });
    });
  });
}

async function checkPrintBridge(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const { error } = await requireSession();
    if (error) return error;

    const settingsRes = await query("SELECT data FROM settings WHERE id = 1");
    const settingsData = (settingsRes.rows[0]?.data ?? {}) as Partial<AppSettings>;

    const printerConfig = settingsData.system?.thermalPrinter as PrinterConfig | undefined;
    const cashDrawerConfig = settingsData.system?.cashDrawer;
    const barcodeConfig = settingsData.system?.barcodeScanner;

    const bridgeUrl = (process.env.PRINTBRIDGE_URL || DEFAULT_PRINTBRIDGE_URL).replace(/\/$/, "");
    const bridgeOnline = await checkPrintBridge(bridgeUrl);

    // Thermal Printer Status
    let printerStatus: {
      name: string;
      enabled: boolean;
      interfaceType: string;
      target: string;
      status: "online" | "offline" | "disabled" | "bridge_required";
      latencyMs?: number;
      error?: string | null;
      details?: string;
    } = {
      name: printerConfig?.name || "Thermal Receipt Printer",
      enabled: Boolean(printerConfig?.enabled),
      interfaceType: printerConfig?.interfaceType || "usb",
      target: printerConfig?.interfaceType === "tcp" ? `${printerConfig.ip || "unknown"}:${printerConfig.port || 9100}` : (printerConfig?.interfaceType || "usb"),
      status: "disabled",
      error: null,
    };

    if (printerConfig?.enabled) {
      if (printerConfig.interfaceType === "tcp") {
        if (!printerConfig.ip) {
          printerStatus.status = "offline";
          printerStatus.error = "IP address not configured";
        } else {
          const pingResult = await pingTcpPrinter(printerConfig.ip, Number(printerConfig.port || 9100));
          printerStatus.status = pingResult.online ? "online" : "offline";
          printerStatus.latencyMs = pingResult.latencyMs;
          printerStatus.error = pingResult.error || null;
        }
      } else {
        // USB or Serial
        printerStatus.status = bridgeOnline ? "online" : "bridge_required";
        printerStatus.details = bridgeOnline
          ? `Connected via PrintBridge (${bridgeUrl})`
          : "Requires PrintBridge daemon on local POS machine for USB/Serial printing";
      }
    }

    // Cash Drawer Status
    const cashDrawerStatus = {
      enabled: Boolean(cashDrawerConfig?.enabled),
      status: !cashDrawerConfig?.enabled
        ? "disabled"
        : printerStatus.status === "online" || bridgeOnline
        ? "ready"
        : "printer_offline",
      port: cashDrawerConfig?.port || "DK (RJ11 via Printer)",
      mode: "printer_kick",
      details: cashDrawerConfig?.enabled
        ? "Triggered via thermal printer RJ11/RJ12 drawer kick (ESC p)"
        : "Disabled in settings",
    };

    // Barcode Scanner Status
    const barcodeScannerStatus = {
      enabled: Boolean(barcodeConfig?.enabled),
      status: barcodeConfig?.enabled ? "ready" : "disabled",
      mode: "usb_hid",
      details: barcodeConfig?.enabled
        ? "Active USB / Bluetooth HID keyboard wedge (instant scan on focus/cart)"
        : "Disabled in settings",
      port: barcodeConfig?.port || "USB HID",
    };

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      printer: printerStatus,
      cashDrawer: cashDrawerStatus,
      barcodeScanner: barcodeScannerStatus,
      printBridge: {
        url: bridgeUrl,
        online: bridgeOnline,
      },
    });
  } catch (err) {
    console.error("Hardware status error:", err);
    return NextResponse.json(
      { error: "Failed to evaluate hardware status", details: String(err) },
      { status: 500 }
    );
  }
}
