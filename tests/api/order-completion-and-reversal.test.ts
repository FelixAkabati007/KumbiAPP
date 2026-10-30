import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQuery = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: (cb: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    mockTransaction(cb),
}));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn().mockResolvedValue({
    session: {
      id: "staff-1",
      name: "Ama Mensah",
      email: "ama@kumbisaly.com",
      role: "restaurantManager",
    },
  }),
}));

vi.mock("@/lib/realtime", () => ({
  publishRealtime: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/financial-ledger", () => ({
  recordFinancialLedgerEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tax", () => ({
  getTaxConfiguration: vi.fn().mockResolvedValue({
    enabled: true,
    vatRate: 15,
    nhilRate: 2.5,
    getfundRate: 2.5,
    covidRate: 1,
  }),
  calculateTaxes: vi.fn().mockImplementation((subtotal: number) => ({
    subtotal,
    tax: Number((subtotal * 0.219).toFixed(2)),
    total: Number((subtotal * 1.219).toFixed(2)),
    breakdown: [],
  })),
}));

describe("POS Order Completion (Tax-Aware + Row-Locked) & Cancellation Reversal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts tax-inclusive POS totals in POST /api/orders/complete and locks direct inventory rows", async () => {
    const { POST } = await import("@/app/api/orders/complete/route");

    const clientQueries: string[] = [];
    mockTransaction.mockImplementation(async (cb) => {
      const client = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          clientQueries.push(sql);
          if (sql.includes("SELECT id FROM kitchenorders WHERE ordernumber")) {
            return { rowCount: 0, rows: [] };
          }
          if (sql.includes("FROM menu_items mi LEFT JOIN inventory di")) {
            return {
              rowCount: 1,
              rows: [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  inventory_mode: "direct",
                  direct_inventory_id: "22222222-2222-4222-8222-222222222222",
                  direct_units_per_sale: 1,
                  quantity: 20,
                },
              ],
            };
          }
          if (sql.includes("INSERT INTO kitchenorders")) {
            return { rowCount: 1, rows: [{ id: "ord-uuid-1" }] };
          }
          if (sql.includes("UPDATE inventory SET quantity = quantity - $1")) {
            return { rowCount: 1, rows: [] };
          }
          if (sql.includes("SELECT id FROM transactions")) {
            return { rowCount: 0, rows: [] };
          }
          return { rowCount: 1, rows: [] };
        }),
      };
      return cb(client as unknown as { query: typeof mockQuery });
    });

    // Subtotal = 100.00, Tax = 21.90, Total = 121.90
    const req = new Request("http://localhost/api/orders/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: "ORD-TAX-101",
        total: 121.9,
        tax: 21.9,
        orderType: "dine-in",
        tableNumber: "T4",
        paymentMethod: "cash",
        items: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Club Beer",
            price: 50,
            quantity: 2,
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.orderId).toBe("ord-uuid-1");
    expect(clientQueries.some((q) => q.includes("FOR UPDATE OF di"))).toBe(true);
  });

  it("atomically reverses inventory stock and ledger status when PATCH /api/orders/[id] cancels an order", async () => {
    const { PATCH } = await import("@/app/api/orders/[id]/route");

    const executedSql: Array<{ sql: string; params: unknown[] }> = [];
    mockTransaction.mockImplementation(async (cb) => {
      const client = {
        query: vi.fn().mockImplementation(async (sql: string, params: unknown[] = []) => {
          executedSql.push({ sql, params });
          if (sql.includes("SELECT id, ordernumber, status FROM kitchenorders")) {
            return {
              rowCount: 1,
              rows: [{ id: "ord-uuid-1", ordernumber: "ORD-TAX-101", status: "pending" }],
            };
          }
          if (sql.includes("UPDATE kitchenorders")) {
            return {
              rowCount: 1,
              rows: [{ id: "ord-uuid-1", ordernumber: "ORD-TAX-101", status: "cancelled" }],
            };
          }
          if (sql.includes("FROM inventory_movements")) {
            return {
              rowCount: 1,
              rows: [
                {
                  id: "mov-1",
                  inventory_id: "inv-beer-1",
                  menu_item_id: "menu-beer-1",
                  quantity_delta: -2,
                },
              ],
            };
          }
          return { rowCount: 1, rows: [] };
        }),
      };
      return cb(client as unknown as { query: typeof mockQuery });
    });

    const req = new Request("http://localhost/api/orders/ord-uuid-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "ord-uuid-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.inventoryReversed).toBe(true);

    const inventoryRestore = executedSql.find((q) =>
      q.sql.includes("UPDATE inventory") && q.sql.includes("quantity = quantity + $1"),
    );
    expect(inventoryRestore).toBeDefined();
    expect(inventoryRestore?.params).toEqual([2, "inv-beer-1"]);

    const returnMovement = executedSql.find((q) =>
      q.sql.includes("INSERT INTO inventory_movements") && q.sql.includes("'return'"),
    );
    expect(returnMovement).toBeDefined();
  });
});
