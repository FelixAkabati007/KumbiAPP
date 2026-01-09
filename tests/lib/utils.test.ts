import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cn } from "../../lib/utils";

vi.mock("@/lib/thermal-printer", () => ({
  getThermalPrinterService: vi.fn(() => ({
    configurePrinter: vi.fn(async () => true),
    printReceipt: vi.fn(async () => true),
  })),
  ThermalPrinterService: class ThermalPrinterService {},
}));

vi.mock("@/lib/services/offline-queue", () => ({
  offlineQueue: {
    enqueue: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/data", () => ({
  addSaleData: vi.fn(() => {}),
  getInventoryItems: vi.fn(async () => []),
  saveInventoryItems: vi.fn(() => {}),
  updateInventoryItem: vi.fn(async () => true),
  getOrderNumber: vi.fn(async () => "ORD-TEST"),
}));

describe("cn utility", () => {
  it("merges tailwind classes correctly", () => {
    expect(cn("p-2", "p-4", "text-sm")).toBe("p-4 text-sm");
  });
  it("handles conditional classes", () => {
    const active = true;
    expect(cn("p-2", active && "font-bold")).toContain("font-bold");
  });
});

describe("PaymentService", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
      })) as unknown as typeof fetch
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it("processes a cash payment successfully", async () => {
    const { getInventoryItems, updateInventoryItem } = await import(
      "@/lib/data"
    );
    (
      getInventoryItems as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([
      { id: "inv-1", name: "Test Item", quantity: "10" },
    ]);

    const { PaymentService } = await import("@/lib/services/payment-service");
    const svc = new PaymentService();

    const res = await svc.processPayment(
      {
        id: "order-1",
        orderNumber: "ORD-1",
        items: [
          {
            id: "inv-1",
            name: "Test Item",
            quantity: 2,
            price: 10,
            subtotal: 20,
            status: "pending",
          },
        ],
        subtotal: 20,
        tax: 0,
        total: 20,
        status: "pending",
        timestamp: new Date().toISOString(),
      },
      { amount: 20, method: "cash", currency: "USD" },
      { id: "cust-1", name: "Jane" }
    );

    expect(res.success).toBe(true);
    expect(updateInventoryItem).toHaveBeenCalled();
  });

  it("fails when payment amount is invalid", async () => {
    const { PaymentService } = await import("@/lib/services/payment-service");
    const svc = new PaymentService();

    const res = await svc.processPayment(
      {
        id: "order-2",
        orderNumber: "ORD-2",
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        status: "pending",
        timestamp: new Date().toISOString(),
      },
      { amount: -1, method: "cash", currency: "USD" },
      { id: "cust-2", name: "Jane" }
    );

    expect(res.success).toBe(false);
  });

  it("fails for unsupported payment methods", async () => {
    const { PaymentService } = await import("@/lib/services/payment-service");
    const svc = new PaymentService();

    const res = await svc.processPayment(
      {
        id: "order-3",
        orderNumber: "ORD-3",
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        status: "pending",
        timestamp: new Date().toISOString(),
      },
      { amount: 1, method: "crypto" as unknown as "cash", currency: "USD" },
      { id: "cust-3", name: "Jane" }
    );

    expect(res.success).toBe(false);
  });

  it("exposes a disabled polling status", async () => {
    const { PaymentService } = await import("@/lib/services/payment-service");
    const svc = new PaymentService() as unknown as {
      pollTransactionStatus: () => Promise<{
        success: boolean;
        error?: string;
      }>;
    };

    const res = await svc.pollTransactionStatus();
    expect(res.success).toBe(false);
    expect(res.error).toBe("Polling is disabled");
  });
});
