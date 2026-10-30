import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock database and auth modules
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockResolvedValue({
    id: "user-123",
    email: "manager@kumbisaly.com",
    role: "admin",
  }),
}));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn().mockResolvedValue({
    session: { id: "user-123", email: "manager@kumbisaly.com", role: "admin" },
  }),
  requireRole: vi.fn().mockResolvedValue({
    session: { id: "user-123", email: "manager@kumbisaly.com", role: "admin" },
  }),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/system-sync", () => ({
  updateSystemState: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/realtime", () => ({
  publishRealtime: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/canonical-menu-ledger", () => ({
  getCanonicalInventoryMenuLedger: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/property-time", () => ({
  getCanonicalTransactionTimestamp: vi.fn().mockResolvedValue("2026-10-30T10:00:00Z"),
}));

const mockQuery = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: (callback: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    mockTransaction(callback),
}));

describe("Inventory API Synchronization & Deduction Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/inventory", () => {
    it("returns inventory items with full synchronization of chefYieldPerStockUnit and densityGPerMl", async () => {
      const { GET } = await import("@/app/api/inventory/route");

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "inv-1",
            name: "Bread Loaf",
            sku: "BREAD-01",
            category: "supply",
            quantity: "15.00",
            unit: "unit",
            container_unit: "box",
            quantity_per_container: "10",
            container_count: "1",
            cost_per_container: "50.00",
            cost_per_item: "5.00",
            reorder_level: "3",
            cost_price: "5.00",
            supplier: "Bakery Direct",
            last_updated: "2026-10-30T09:00:00Z",
            base_unit: "unit",
            recipe_unit: "slice",
            conversion_ratio: "20",
            conversion_type: "standard",
            chef_yield_per_stock_unit: "20.00",
            density_g_per_ml: null,
            conversion_rule_missing: false,
          },
          {
            id: "inv-2",
            name: "Honey Pure",
            sku: "HONEY-01",
            category: "ingredient",
            quantity: "5.00",
            unit: "kg",
            container_unit: "jar",
            quantity_per_container: "1",
            container_count: "5",
            cost_per_container: "35.00",
            cost_per_item: "35.00",
            reorder_level: "1",
            cost_price: "35.00",
            supplier: "Bee Farms",
            last_updated: "2026-10-30T09:00:00Z",
            base_unit: "g",
            recipe_unit: "ml",
            conversion_ratio: "1000",
            conversion_type: "standard",
            chef_yield_per_stock_unit: null,
            density_g_per_ml: "1.42",
            conversion_rule_missing: false,
          },
        ],
      });

      const response = await GET();
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({
        id: "inv-1",
        name: "Bread Loaf",
        chefYieldPerStockUnit: "20.00",
        recipeUnit: "slice",
      });
      expect(data[1]).toMatchObject({
        id: "inv-2",
        name: "Honey Pure",
        densityGPerMl: "1.42",
        unit: "kg",
      });
    });
  });

  describe("POST /api/inventory parameter binding", () => {
    it("binds all 18 parameters accurately when linking a menu item", async () => {
      const { POST } = await import("@/app/api/inventory/route");

      mockTransaction.mockImplementation(async (cb) => {
        const client = {
          query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
            if (sql.includes("INSERT INTO inventory (menu_item_id")) {
              expect(params).toHaveLength(18);
              // $17 must be chefYield, $18 must be canonicalNow
              expect(params[16]).toBe(20); // chefYield
              expect(params[17]).toBe("2026-10-30T10:00:00Z"); // canonicalNow
              return { rows: [{ id: "inv-menu-1", quantity: "10.00" }] };
            }
            return { rows: [] };
          }),
        };
        return cb(client as unknown as { query: typeof mockQuery });
      });

      const req = new Request("http://localhost/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: "e4f8c9d0-1234-4567-89ab-cdef01234567",
          quantity: 10,
          unit: "unit",
          reorderLevel: 2,
          cost: 15,
          supplier: "Supplier X",
          chefYieldPerStockUnit: 20,
        }),
      });

      const response = await POST(req);
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.id).toBe("inv-menu-1");
    });
  });

  describe("PUT /api/inventory/[id]", () => {
    it("updates name, sku, category, chefYield and returns mapped camelCase object", async () => {
      const { PUT } = await import("@/app/api/inventory/[id]/route");

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "inv-1",
            name: "Old Name",
            sku: "OLD-SKU",
            category: "ingredient",
            quantity: "10.00",
            unit: "kg",
            cost_price: "25.00",
            cost_per_container: "25.00",
            quantity_per_container: "1",
            cost_per_item: "25.00",
            reorder_level: "2",
            supplier: "Local Farm",
            chef_yield_per_stock_unit: null,
            density_g_per_ml: null,
          },
        ],
      });

      mockTransaction.mockImplementation(async (cb) => {
        const client = {
          query: vi.fn().mockImplementation((sql: string) => {
            if (sql.includes("UPDATE inventory SET")) {
              return {
                rowCount: 1,
                rows: [
                  {
                    id: "inv-1",
                    name: "Updated Premium Flour",
                    sku: "FLOUR-PREM-01",
                    category: "ingredient",
                    quantity: "10.00",
                    unit: "kg",
                    container_unit: "sack",
                    quantity_per_container: "25",
                    container_count: "2",
                    cost_per_container: "150.00",
                    cost_per_item: "6.00",
                    reorder_level: "5",
                    cost_price: "6.00",
                    supplier: "Premier Millers",
                    last_updated: "2026-10-30T10:05:00Z",
                    base_unit: "g",
                    recipe_unit: "g",
                    conversion_ratio: "1000",
                    conversion_type: "standard",
                    chef_yield_per_stock_unit: "1",
                    density_g_per_ml: null,
                  },
                ],
              };
            }
            return { rows: [] };
          }),
        };
        return cb(client as unknown as { query: typeof mockQuery });
      });

      const req = new Request("http://localhost/api/inventory/inv-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated Premium Flour",
          sku: "FLOUR-PREM-01",
          category: "ingredient",
          chefYieldPerStockUnit: "1",
          reorderLevel: 5,
        }),
      });

      const response = await PUT(req, {
        params: Promise.resolve({ id: "inv-1" }),
      });
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.item).toMatchObject({
        id: "inv-1",
        name: "Updated Premium Flour",
        sku: "FLOUR-PREM-01",
        reorderLevel: "5",
        costPerContainer: "150.00",
        costPerItem: "6.00",
      });
    });
  });
});
