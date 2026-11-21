import { describe, expect, it, vi, beforeEach } from "vitest";
import { parsePositiveQuantity } from "@/lib/inventory-top-up-validation";

const executedQueries: Array<{ sql: string; params: unknown[] }> = [];

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockResolvedValue({
    id: "d9e8c7b6-a5b4-4321-9876-abcdef123456",
    email: "manager@kumbisaly.com",
    role: "admin",
  }),
}));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn().mockResolvedValue({
    session: { id: "d9e8c7b6-a5b4-4321-9876-abcdef123456", email: "manager@kumbisaly.com", role: "admin" },
  }),
}));

vi.mock("@/lib/system-sync", () => ({
  updateSystemState: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/realtime", () => ({
  publishRealtime: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/property-time", () => ({
  getCanonicalTransactionTimestamp: vi.fn().mockResolvedValue("2026-11-21T12:00:00Z"),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn().mockImplementation((sql: string, params: unknown[] = []) => {
    executedQueries.push({ sql, params });
    if (sql.includes("SELECT id, email, role FROM users")) {
      return { rows: [{ id: "admin-1", email: "admin@kumbisaly.com", role: "admin" }] };
    }
    return { rows: [] };
  }),
  transaction: vi.fn().mockImplementation(async (cb) => {
    const client = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[] = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes("SELECT id, inventory_item_id") && sql.includes("FROM inventory_top_up_audit")) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes("SELECT id, quantity, name, unit") && sql.includes("FROM inventory")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: "inv-vitamilk",
                quantity: "10.00",
                name: "Vitamilk",
                unit: "units",
                category: "beverage",
                cost_per_container: "7.08",
                quantity_per_container: "1",
                cost_per_item: "7.08",
              },
            ],
          };
        }
        if (sql.includes("UPDATE inventory")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: "inv-vitamilk",
                name: "Vitamilk",
                quantity: "15.00",
                unit: "units",
                cost_per_container: "7.08",
                cost_per_item: "7.08",
                container_count: "15",
                cost_price: "106.20",
              },
            ],
          };
        }
        if (sql.includes("INSERT INTO inventory_top_up_audit")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: "audit-1",
                inventory_item_id: "inv-vitamilk",
                quantity_before: 10,
                quantity_added: 5,
                quantity_after: 15,
                performed_by: "d9e8c7b6-a5b4-4321-9876-abcdef123456",
                performed_at: "2026-11-21T12:00:00Z",
                source: "manual_top_up",
                request_metadata: {},
              },
            ],
          };
        }
        if (sql.includes("INSERT INTO inventory_events")) {
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 1, rows: [] };
      }),
    };
    return cb(client);
  }),
}));

describe("inventory top-up validation", () => {
  it("accepts positive integer, decimal, and string quantities", () => {
    expect(parsePositiveQuantity(5)).toBe(5);
    expect(parsePositiveQuantity("2.5")).toBe(2.5);
    expect(parsePositiveQuantity(".75")).toBe(0.75);
  });

  it("rejects zero, negative, empty, malformed, and non-finite quantities", () => {
    for (const value of [0, "0", -1, "", "  ", "1e3", "1,000", "abc", Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(parsePositiveQuantity(value)).toBeNull();
    }
  });

  it("rejects values above the safety maximum", () => {
    expect(parsePositiveQuantity("1000000001")).toBeNull();
    expect(parsePositiveQuantity("1000000000")).toBe(1_000_000_000);
  });

  it("preserves the audit quantity invariant", () => {
    const before = parsePositiveQuantity("0") ?? 0;
    const added = parsePositiveQuantity("250000.75");
    expect(added).toBe(250000.75);
    expect(before + (added ?? 0)).toBe(250000.75);
  });
});

describe("POST /api/inventory/[id]/top-up route", () => {
  beforeEach(() => {
    executedQueries.length = 0;
  });

  it("executes top-up transaction with matching parameter placeholder counts in all SQL queries", async () => {
    const { POST } = await import("@/app/api/inventory/[id]/top-up/route");

    const req = new Request("http://localhost/api/inventory/inv-vitamilk/top-up", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "test-idem-key-1",
      },
      body: JSON.stringify({
        quantityAdded: 5,
        reason: "Purchase",
      }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: "inv-vitamilk" }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.duplicate).toBe(false);
    expect(data.item.quantity).toBe("15.00");

    // Verify both audit and event inserts occurred with exact parameter counts
    const auditQuery = executedQueries.find((q) => q.sql.includes("INSERT INTO inventory_top_up_audit"));
    expect(auditQuery).toBeDefined();
    const auditPlaceholders = auditQuery!.sql.match(/\$\d+/g) || [];
    expect(auditQuery!.params.length).toBe(auditPlaceholders.length);
    expect(auditQuery!.params).toHaveLength(9);

    const eventQuery = executedQueries.find((q) => q.sql.includes("INSERT INTO inventory_events"));
    expect(eventQuery).toBeDefined();
    const eventPlaceholders = eventQuery!.sql.match(/\$\d+/g) || [];
    expect(eventQuery!.params.length).toBe(eventPlaceholders.length);
    expect(eventQuery!.params).toHaveLength(17);
  });
});
