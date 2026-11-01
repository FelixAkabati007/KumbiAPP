import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { GET as getHardwareStatus } from "@/app/api/hardware/status/route";
import { POST as openCashDrawerEndpoint } from "@/app/api/hardware/cash-drawer/open/route";
import { BarcodeScannerService } from "@/lib/barcode-scanner";
import { CashDrawerService } from "@/lib/cash-drawer";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  getClient: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

describe("Hardware Status & Peripheral Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/hardware/status", () => {
    it("rejects unauthorized requests with 401", async () => {
      const { getSession } = await import("@/lib/auth");
      (getSession as unknown as Mock).mockResolvedValue(null);

      const res = await getHardwareStatus();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("evaluates live hardware status and returns configured peripheral health", async () => {
      const { getSession } = await import("@/lib/auth");
      (getSession as unknown as Mock).mockResolvedValue({ id: "user-1", role: "admin" });

      const { query } = await import("@/lib/db");
      (query as unknown as Mock).mockResolvedValueOnce({
        rows: [
          {
            data: {
              system: {
                thermalPrinter: {
                  enabled: true,
                  name: "XP-80T Kitchen Printer",
                  interfaceType: "tcp",
                  ip: "127.0.0.1",
                  port: 9100,
                },
                cashDrawer: {
                  enabled: true,
                  port: "DK (RJ11 via Printer)",
                  autoOpen: true,
                },
                barcodeScanner: {
                  enabled: true,
                  port: "USB HID",
                },
              },
            },
          },
        ],
      });

      const res = await getHardwareStatus();
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("timestamp");
      expect(body.printer.enabled).toBe(true);
      expect(body.printer.name).toBe("XP-80T Kitchen Printer");
      expect(body.cashDrawer.enabled).toBe(true);
      expect(body.cashDrawer.mode).toBe("printer_kick");
      expect(body.barcodeScanner.enabled).toBe(true);
      expect(body.barcodeScanner.mode).toBe("usb_hid");
    });

    it("accurately reports disabled status when peripherals are toggled off", async () => {
      const { getSession } = await import("@/lib/auth");
      (getSession as unknown as Mock).mockResolvedValue({ id: "user-1", role: "admin" });

      const { query } = await import("@/lib/db");
      (query as unknown as Mock).mockResolvedValueOnce({
        rows: [
          {
            data: {
              system: {
                thermalPrinter: { enabled: false },
                cashDrawer: { enabled: false },
                barcodeScanner: { enabled: false },
              },
            },
          },
        ],
      });

      const res = await getHardwareStatus();
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.printer.status).toBe("disabled");
      expect(body.cashDrawer.status).toBe("disabled");
      expect(body.barcodeScanner.status).toBe("disabled");
    });
  });

  describe("POST /api/hardware/cash-drawer/open", () => {
    it("rejects unauthorized drawer kick requests with 401", async () => {
      const { getSession } = await import("@/lib/auth");
      (getSession as unknown as Mock).mockResolvedValue(null);

      const req = new Request("http://localhost/api/hardware/cash-drawer/open", {
        method: "POST",
      });
      const res = await openCashDrawerEndpoint(req);
      expect(res.status).toBe(401);
    });

    it("rejects when cash drawer is explicitly disabled in system settings", async () => {
      const { getSession } = await import("@/lib/auth");
      (getSession as unknown as Mock).mockResolvedValue({ id: "user-1", role: "admin" });

      const { query } = await import("@/lib/db");
      (query as unknown as Mock).mockResolvedValueOnce({
        rows: [{ data: { system: { cashDrawer: { enabled: false } } } }],
      });

      const req = new Request("http://localhost/api/hardware/cash-drawer/open", {
        method: "POST",
      });
      const res = await openCashDrawerEndpoint(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Cash drawer is disabled");
    });

    it("accepts and dispatches drawer kick when cash drawer is enabled", async () => {
      const { getSession } = await import("@/lib/auth");
      (getSession as unknown as Mock).mockResolvedValue({ id: "user-1", role: "admin" });

      const { query } = await import("@/lib/db");
      (query as unknown as Mock).mockResolvedValueOnce({
        rows: [
          {
            data: {
              system: {
                thermalPrinter: { enabled: true, interfaceType: "usb" },
                cashDrawer: { enabled: true, port: "DK (RJ11)" },
              },
            },
          },
        ],
      });

      const req = new Request("http://localhost/api/hardware/cash-drawer/open", {
        method: "POST",
      });
      const res = await openCashDrawerEndpoint(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe("BarcodeScannerService & CashDrawerService Unit Verification", () => {
    it("processes valid barcodes and determines standard symbologies without simulated background timer ticks", () => {
      const scanner = new BarcodeScannerService({
        enabled: true,
        port: "USB HID",
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        autoFocus: true,
        soundEnabled: false,
        vibrationEnabled: false,
        prefix: "",
        suffix: "",
        timeout: 1000,
      });

      let capturedCode = "";
      let capturedType = "";
      scanner.onBarcodeData((data) => {
        capturedCode = data.code;
        capturedType = data.type;
      });

      scanner.processBarcodeData("049000028911");
      expect(capturedCode).toBe("049000028911");
      expect(capturedType).toBe("UPC-A");

      scanner.processBarcodeData("5012345678900");
      expect(capturedCode).toBe("5012345678900");
      expect(capturedType).toBe("EAN-13");
    });

    it("verifies cash drawer connection and state management", async () => {
      const drawer = new CashDrawerService({
        enabled: true,
        port: "DK (RJ11)",
        baudRate: 9600,
        autoOpen: true,
        requireConfirmation: false,
        soundEnabled: false,
      });

      const connected = await drawer.connect();
      expect(connected).toBe(true);
      expect(drawer.getStatus().isConnected).toBe(true);

      drawer.disconnect();
      expect(drawer.getStatus().isConnected).toBe(false);
    });
  });
});
