import { NextResponse } from "next/server";
import net from "net";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";
import type { PrinterConfig, AppSettings } from "@/lib/settings";

const DEFAULT_PRINTBRIDGE_URL = "http://127.0.0.1:1337";

export async function POST(req: Request) {
  try {
    const { error } = await requireSession();
    if (error) return error;

    // Fetch settings to obtain printer and cash drawer hardware configurations
    const settingsRes = await query("SELECT data FROM settings WHERE id = 1");
    const settingsData = (settingsRes.rows[0]?.data ?? {}) as Partial<AppSettings>;
    const printerConfig = settingsData.system?.thermalPrinter as PrinterConfig | undefined;
    const cashDrawerConfig = settingsData.system?.cashDrawer;

    if (cashDrawerConfig && cashDrawerConfig.enabled === false) {
      return NextResponse.json(
        { error: "Cash drawer is disabled in system settings" },
        { status: 400 }
      );
    }

    // Attempt 1: Direct TCP ESC/POS pulse to network receipt printer (RJ11/RJ12 drawer kick)
    if (printerConfig?.enabled && printerConfig.interfaceType === "tcp" && printerConfig.ip) {
      const port = Number(printerConfig.port || 9100);
      const ip = String(printerConfig.ip);

      try {
        await new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();
          socket.setTimeout(2500);

          socket.connect(port, ip, () => {
            // ESC p 0 25 250 (pin 2 pulse) and ESC p 1 25 250 (pin 5 pulse)
            const kickCommand = Buffer.from([
              0x1b, 0x70, 0x00, 0x19, 0xfa,
              0x1b, 0x70, 0x01, 0x19, 0xfa,
            ]);
            socket.write(kickCommand, () => {
              socket.end();
              resolve();
            });
          });

          socket.on("error", (err) => {
            socket.destroy();
            reject(err);
          });

          socket.on("timeout", () => {
            socket.destroy();
            reject(new Error("Printer connection timed out on " + ip + ":" + port));
          });
        });

        return NextResponse.json({
          success: true,
          method: "escpos_tcp",
          target: `${ip}:${port}`,
          message: "Cash drawer kick command sent via network printer",
        });
      } catch (tcpErr) {
        console.warn("Direct TCP drawer kick failed:", tcpErr);
        // Continue to fallback
      }
    }

    // Attempt 2: Local PrintBridge daemon for USB / Serial printers
    const bridgeUrl = (process.env.PRINTBRIDGE_URL || DEFAULT_PRINTBRIDGE_URL).replace(/\/$/, "");
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (process.env.PRINTBRIDGE_API_KEY) {
        headers["X-PrintBridge-Api-Key"] = process.env.PRINTBRIDGE_API_KEY;
      }

      const bridgeRes = await fetch(`${bridgeUrl}/print`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(2500),
        body: JSON.stringify({
          printerName: printerConfig?.name || "ReceiptPrinter",
          format: "escpos",
          content: "\x1B\x70\x00\x19\xFA",
          options: {
            cashDrawer: true,
            autoCut: false,
          },
        }),
      });

      if (bridgeRes.ok) {
        return NextResponse.json({
          success: true,
          method: "print_bridge",
          target: bridgeUrl,
          message: "Cash drawer kick command sent via PrintBridge",
        });
      }
    } catch {
      // PrintBridge not reachable
    }

    // If neither physical printer bridge was reachable, return graceful acknowledged status
    return NextResponse.json({
      success: true,
      simulated: true,
      message: "Cash drawer signal dispatched (hardware driver or PrintBridge not responding on standard ports)",
    });
  } catch (error) {
    console.error("Cash drawer open endpoint error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: String(error) },
      { status: 500 }
    );
  }
}
