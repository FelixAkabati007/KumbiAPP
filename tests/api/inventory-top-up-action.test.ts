import { describe, expect, it, vi, beforeEach } from "vitest";

const executedQueries: Array<{ sql: string; params: unknown[] }> = [];

let mockSession = {
  id: "manager-uuid-1234",
  email: "manager@kumbisaly.com",
  role: "manager",
  name: "Manager Felix",
};

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockImplementation(() => Promise.resolve(mockSession)),
}));

vi.mock("@/lib/api-auth", () => ({
  requireRole: vi.fn().mockImplementation(() => Promise.resolve({ session: mockSession })),
  requirePermission: vi.fn().mockImplementation(() => Promise.resolve({ session: mockSession })),
}));

vi.mock("@/lib/system-sync", () => ({
  updateSystemState: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/realtime", () => ({
  publishRealtime: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/db/ensure-topup-schema", () => ({
  ensureTopUpReviewSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn().mockImplementation((sql: string, params: unknown[] = []) => {
    executedQueries.push({ sql, params });
    return { rows: [] };
  }),
  transaction: vi.fn().mockImplementation(async (cb) => {
    const client = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[] = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes("SELECT a.*, i.name as item_name")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: "audit-uuid-1",
                inventory_item_id: "item-whiskey",
                quantity_before: "10.00",
                quantity_added: "2.00",
                quantity_after: "12.00",
                performed_by: "staff-uuid-5678",
                performed_at: "2026-11-21T12:00:00Z",
                source: "manual_top_up",
                request_metadata: {
                  purchasePackagingPriceBefore: 100,
                  purchasePackagingPriceAfter: 120,
                  status: "pending_review",
                  evidencePathname: "inventory-evidence/top-up/item-whiskey/receipt.jpg",
                },
                item_name: "Jameson Irish Whiskey",
                item_unit: "bottles",
                current_stock: "12.00",
                current_packaging_price: "120.00",
                current_cost_per_item: "120.00",
                quantity_per_container: "1",
                status: "pending_review",
              },
            ],
          };
        }
        if (sql.includes("UPDATE inventory_top_up_audit")) {
          return { rowCount: 1, rows: [{ id: "audit-uuid-1", status: "approved" }] };
        }
        if (sql.includes("UPDATE inventory") && sql.includes("SET quantity = $1")) {
          return { rowCount: 1, rows: [{ id: "item-whiskey", quantity: "10.00" }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    };
    return cb(client);
  }),
}));

describe("POST /api/inventory/top-up/[id]/action", () => {
  beforeEach(() => {
    executedQueries.length = 0;
    mockSession = {
      id: "manager-uuid-1234",
      email: "manager@kumbisaly.com",
      role: "manager",
      name: "Manager Felix",
    };
  });

  it("approves a pending top-up and updates audit records", async () => {
    const { POST } = await import("@/app/api/inventory/top-up/[id]/action/route");

    const req = new Request("http://localhost/api/inventory/top-up/audit-uuid-1/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", notes: "Receipt verified" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: "audit-uuid-1" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("approved");
    expect(data.itemName).toBe("Jameson Irish Whiskey");

    const updateAudit = executedQueries.find((q) => q.sql.includes("UPDATE inventory_top_up_audit"));
    expect(updateAudit).toBeDefined();
    expect(updateAudit?.sql).toContain("status = 'approved'");
  });

  it("requires notes when disapproving a top-up", async () => {
    const { POST } = await import("@/app/api/inventory/top-up/[id]/action/route");

    const req = new Request("http://localhost/api/inventory/top-up/audit-uuid-1/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disapprove", notes: "" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: "audit-uuid-1" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Please provide a reason");
  });

  it("disapproves a top-up, reverts inventory stock, and logs RESTOCK_REVERSED event", async () => {
    const { POST } = await import("@/app/api/inventory/top-up/[id]/action/route");

    const req = new Request("http://localhost/api/inventory/top-up/audit-uuid-1/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disapprove", notes: "Invoice showed only 1 bottle delivered" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: "audit-uuid-1" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("disapproved");
    expect(data.quantityReverted).toBe(2);
    expect(data.newQuantity).toBe(10);

    // Verify stock reversion in inventory table
    const updateInventory = executedQueries.find((q) => q.sql.includes("UPDATE inventory") && q.sql.includes("SET quantity = $1"));
    expect(updateInventory).toBeDefined();
    expect(updateInventory?.params[0]).toBe(10); // 12 - 2 = 10

    // Verify RESTOCK_REVERSED event was logged
    const reversalEvent = executedQueries.find((q) => q.sql.includes("RESTOCK_REVERSED"));
    expect(reversalEvent).toBeDefined();
    expect(reversalEvent?.params[2]).toBe(-2); // -quantityAdded
  });

  it("enforces Segregation of Duties so non-admin requesters cannot review their own top-up", async () => {
    // Set current session to the same ID as the performed_by staff
    mockSession = {
      id: "staff-uuid-5678",
      email: "staff@kumbisaly.com",
      role: "manager",
      name: "Staff Member",
    };

    const { POST } = await import("@/app/api/inventory/top-up/[id]/action/route");

    const req = new Request("http://localhost/api/inventory/top-up/audit-uuid-1/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });

    const res = await POST(req, {
      params: Promise.resolve({ id: "audit-uuid-1" }),
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Segregation of duties");
  });
});
