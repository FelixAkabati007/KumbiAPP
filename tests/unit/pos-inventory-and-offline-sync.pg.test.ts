import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let pg: PGlite;

vi.mock("@/lib/db", () => {
  const runQuery = async (text: string, params?: unknown[]) => {
    const res = await pg.query(text, params);
    return {
      rows: res.rows as Record<string, unknown>[],
      rowCount: res.affectedRows || res.rows.length,
    };
  };

  return {
    query: (text: string, params?: unknown[]) => runQuery(text, params),
    transaction: async <T>(
      cb: (client: { query: typeof runQuery }) => Promise<T>,
    ): Promise<T> => {
      await pg.query("BEGIN");
      try {
        const out = await cb({ query: runQuery });
        await pg.query("COMMIT");
        return out;
      } catch (err) {
        await pg.query("ROLLBACK");
        throw err;
      }
    },
  };
});

const mockRequirePermission = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  requireRole: vi.fn().mockResolvedValue({
    session: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "System Administrator",
      email: "admin@kumbisaly.com",
      role: "admin",
    },
    error: null,
  }),
}));

vi.mock("@/lib/realtime", () => ({
  publishRealtime: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/system-sync", () => ({
  updateSystemState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/property-time", () => ({
  getCanonicalTransactionTimestamp: vi.fn().mockResolvedValue("2026-11-26T12:00:00.000Z"),
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
  roundMoney: (n: number) => Math.round(n * 100) / 100,
}));

describe("POS Checkout Automatic Inventory Decrement & Offline Queue Neon Sync (Real PostgreSQL)", () => {
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`

      DO $$ BEGIN
        CREATE TYPE payment_method_enum AS ENUM (
          'cash', 'card', 'mobile', 'mobile_money', 'bank_transfer',
          'room_charge', 'complimentary', 'other', 'guest-folio', 'paid-at-order'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        role VARCHAR(64) NOT NULL DEFAULT 'waiterWaitress',
        is_active BOOLEAN DEFAULT true
      );

      CREATE TABLE categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL
      );

      CREATE TABLE inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        menu_item_id UUID UNIQUE,
        name VARCHAR(255),
        sku VARCHAR(100),
        category VARCHAR(100) DEFAULT 'beverage',
        quantity DECIMAL(12, 4) NOT NULL DEFAULT 0,
        unit VARCHAR(50) NOT NULL DEFAULT 'units',
        container_unit VARCHAR(50),
        quantity_per_container DECIMAL(12, 4) DEFAULT 1,
        container_count DECIMAL(12, 4) DEFAULT 0,
        cost_per_container DECIMAL(12, 2) DEFAULT 0,
        cost_per_item DECIMAL(12, 4) DEFAULT 0,
        reorder_level DECIMAL(12, 4) DEFAULT 0,
        cost_price DECIMAL(12, 2) DEFAULT 0,
        supplier VARCHAR(255),
        base_unit VARCHAR(50),
        recipe_unit VARCHAR(50),
        conversion_ratio DECIMAL(12, 4) DEFAULT 1,
        conversion_type VARCHAR(50) DEFAULT 'standard',
        chef_yield_per_stock_unit DECIMAL(12, 4),
        density_g_per_ml DECIMAL(12, 4),
        last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE menu_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category_id UUID REFERENCES categories(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        barcode VARCHAR(100),
        image_url TEXT,
        is_available BOOLEAN DEFAULT true,
        availability_mode VARCHAR(32) DEFAULT 'automatic',
        inventory_mode VARCHAR(32) DEFAULT 'recipe',
        direct_inventory_id UUID REFERENCES inventory(id) ON DELETE SET NULL,
        direct_units_per_sale DECIMAL(12, 4) DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE recipe_ingredients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
        inventory_item_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        quantity DECIMAL(12, 4) NOT NULL,
        unit VARCHAR(50) NOT NULL
      );

      CREATE TABLE inventory_item_uoms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
        purchase_unit VARCHAR(50) NOT NULL,
        base_unit VARCHAR(50) NOT NULL,
        conversion_factor_to_base DECIMAL(12, 4) NOT NULL DEFAULT 1,
        density_g_per_ml DECIMAL(12, 4),
        yield_factor DECIMAL(12, 4) NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        effective_from TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        effective_to TIMESTAMPTZ
      );

      CREATE TABLE inventory_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id UUID NOT NULL,
        menu_item_id UUID,
        quantity_delta DECIMAL(12, 4) NOT NULL,
        movement_type VARCHAR(50) NOT NULL,
        source_type VARCHAR(50) NOT NULL,
        source_id VARCHAR(255),
        order_id VARCHAR(255),
        reason TEXT,
        actor_id UUID,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      -- Strict Neon database/schema.sql definition with items JSONB NOT NULL & FK to users(id)
      CREATE TABLE kitchenorders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ordernumber VARCHAR NOT NULL UNIQUE,
        total NUMERIC NOT NULL,
        ordertype VARCHAR NOT NULL,
        tablenumber VARCHAR,
        customername VARCHAR,
        paymentmethod VARCHAR NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'pending',
        priority VARCHAR NOT NULL DEFAULT 'normal',
        createdat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
        updatedat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
        estimatedtime INT,
        notes TEXT,
        items JSONB NOT NULL,
        performed_by UUID REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID,
        transaction_reference VARCHAR(255),
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'GHS',
        method payment_method_enum NOT NULL,
        status VARCHAR(50) NOT NULL,
        metadata JSONB,
        performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  beforeEach(async () => {
    const { resetPosOrderSchemaCacheForTests } = await import("@/lib/pos-order-inventory");
    resetPosOrderSchemaCacheForTests();

    await pg.exec(`
      DELETE FROM inventory_movements;
      DELETE FROM transactions;
      DELETE FROM kitchenorders;
      DELETE FROM recipe_ingredients;
      DELETE FROM inventory_item_uoms;
      UPDATE menu_items SET direct_inventory_id = NULL;
      DELETE FROM inventory;
      DELETE FROM menu_items;
      DELETE FROM categories;
      DELETE FROM users;
    `);
    await pg.exec(`DROP TABLE IF EXISTS order_idempotency_keys;`).catch(() => undefined);
    await pg.exec(`DROP TABLE IF EXISTS discount_applications;`).catch(() => undefined);

    mockRequirePermission.mockResolvedValue({
      session: {
        // Intentionally a staff_profiles ID not present in users(id) to verify FK resilience
        id: "99999999-9999-4999-8999-999999999999",
        name: "Akosua Mensah",
        email: "akosua@kumbisaly.com",
        role: "waiterWaitress",
      },
      error: null,
    });
  });

  it("automatically decrements inventory for standalone '8 PM (Big Size)' (recipe mode with 0 recipe rows) and prevents GET /api/inventory from resurrecting 0 stock", async () => {
    const cat = await pg.query<{ id: string }>(
      `INSERT INTO categories (name, slug) VALUES ('Beverages', 'beverages') RETURNING id`,
    );
    const menuRes = await pg.query<{ id: string }>(
      `INSERT INTO menu_items (category_id, name, price, barcode, inventory_mode, direct_inventory_id, direct_units_per_sale, availability_mode)
       VALUES ($1, '8 PM (Big Size)', 120.00, '8PM-BIG-001', 'recipe', NULL, 1, 'automatic')
       RETURNING id`,
      [cat.rows[0].id],
    );
    const invRes = await pg.query<{ id: string }>(
      `INSERT INTO inventory (name, sku, category, quantity, unit, container_unit, quantity_per_container, container_count, cost_per_container, cost_price)
       VALUES ('8 PM (Big Size)', '8PM-BIG-001', 'beverage', 12, 'bottle', 'case', 12, 1, 840, 840)
       RETURNING id`,
    );

    const { POST: completeOrder } = await import("@/app/api/orders/complete/route");

    // 1. Checkout 3 bottles of '8 PM (Big Size)'
    const req1 = new Request("http://localhost/api/orders/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: "ORD-20261126-0001",
        total: 360,
        orderType: "dine-in",
        tableNumber: "B2",
        paymentMethod: "cash",
        items: [
          {
            id: menuRes.rows[0].id,
            name: "8 PM (Big Size)",
            price: 120,
            quantity: 3,
          },
        ],
      }),
    });

    const res1 = await completeOrder(req1);
    expect(res1.status).toBe(200);

    const afterFirstSale = await pg.query<{ quantity: string; container_count: string }>(
      `SELECT quantity::text, container_count::text FROM inventory WHERE id = $1`,
      [invRes.rows[0].id],
    );
    expect(Number(afterFirstSale.rows[0].quantity)).toBe(9);
    expect(Number(afterFirstSale.rows[0].container_count)).toBe(0.75);

    const movRes = await pg.query<{ quantity_delta: string; movement_type: string }>(
      `SELECT quantity_delta::text, movement_type FROM inventory_movements WHERE inventory_id = $1`,
      [invRes.rows[0].id],
    );
    expect(movRes.rows).toHaveLength(1);
    expect(Number(movRes.rows[0].quantity_delta)).toBe(-3);
    expect(movRes.rows[0].movement_type).toBe("sale");

    // 2. Sell remaining 9 bottles so stock reaches 0
    const req2 = new Request("http://localhost/api/orders/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: "ORD-20261126-0002",
        total: 1080,
        orderType: "takeout",
        paymentMethod: "cash",
        items: [
          {
            id: menuRes.rows[0].id,
            name: "8 PM (Big Size)",
            price: 120,
            quantity: 9,
          },
        ],
      }),
    });
    const res2 = await completeOrder(req2);
    expect(res2.status).toBe(200);

    // 3. Verify GET /api/inventory in production mode does NOT auto-heal sold-out stock back to 12
    const prevEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      const { GET: getInventory } = await import("@/app/api/inventory/route");
      const invGetRes = await getInventory();
      expect(invGetRes.status).toBe(200);
      const invList = (await invGetRes.json()) as Array<{
        id: string;
        name: string;
        quantity: string;
        containerCount: string;
      }>;
      const eightPm = invList.find((item) => item.id === invRes.rows[0].id);
      expect(eightPm).toBeDefined();
      expect(Number(eightPm?.quantity)).toBe(0);
      expect(Number(eightPm?.containerCount)).toBe(0);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
    }

    // 4. Attempting one more live POS sale must now return 409 out of stock
    const req3 = new Request("http://localhost/api/orders/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: "ORD-20261126-0003",
        total: 120,
        orderType: "dine-in",
        paymentMethod: "cash",
        items: [
          {
            id: menuRes.rows[0].id,
            name: "8 PM (Big Size)",
            price: 120,
            quantity: 1,
          },
        ],
      }),
    });
    const res3 = await completeOrder(req3);
    expect(res3.status).toBe(409);
  });

  it("applies direct_units_per_sale quantity-per-sale rules when linked via inventory.menu_item_id", async () => {
    const cat = await pg.query<{ id: string }>(
      `INSERT INTO categories (name, slug) VALUES ('Beverages', 'beverages') RETURNING id`,
    );
    const menuRes = await pg.query<{ id: string }>(
      `INSERT INTO menu_items (category_id, name, price, inventory_mode, direct_inventory_id, direct_units_per_sale)
       VALUES ($1, '8 PM (Big Size) Double Pack', 220.00, 'recipe', NULL, 2)
       RETURNING id`,
      [cat.rows[0].id],
    );
    const invRes = await pg.query<{ id: string }>(
      `INSERT INTO inventory (menu_item_id, name, category, quantity, unit, quantity_per_container, container_count)
       VALUES ($1, '8 PM (Big Size)', 'beverage', 20, 'bottle', 10, 2)
       RETURNING id`,
      [menuRes.rows[0].id],
    );

    const { POST: completeOrder } = await import("@/app/api/orders/complete/route");
    const req = new Request("http://localhost/api/orders/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: "ORD-PACK-001",
        total: 660,
        orderType: "dine-in",
        paymentMethod: "card",
        items: [
          {
            id: menuRes.rows[0].id,
            name: "8 PM (Big Size) Double Pack",
            price: 220,
            quantity: 3, // 3 packs * 2 units/sale = 6 bottles deducted
          },
        ],
      }),
    });

    const res = await completeOrder(req);
    expect(res.status).toBe(200);

    const invAfter = await pg.query<{ quantity: string; container_count: string }>(
      `SELECT quantity::text, container_count::text FROM inventory WHERE id = $1`,
      [invRes.rows[0].id],
    );
    expect(Number(invAfter.rows[0].quantity)).toBe(14);
    expect(Number(invAfter.rows[0].container_count)).toBe(1.4);
  });

  it("reconciles stuck (failed) offline orders in processOfflineQueue against strict Neon constraints, non-UUID discounts, orderNumber collisions, and depleted stock", async () => {
    const offlineStorage = await import("@/lib/offline-storage");
    offlineStorage.clearAllQueues();

    await pg.query(
      `INSERT INTO inventory (name, sku, category, quantity, unit, quantity_per_container, container_count)
       VALUES ('8 PM (Big Size)', '8PM-BIG', 'beverage', 1, 'bottle', 1, 1)`,
    );

    // Pre-insert an existing online order from another terminal using the same orderNumber
    await pg.query(
      `INSERT INTO kitchenorders (ordernumber, total, ordertype, customername, paymentmethod, status, priority, items)
       VALUES ('ORD-20261126-0007', 45, 'dine-in', 'Other Guest', 'cash', 'completed', 'normal', '[{"name":"Water","quantity":1,"price":45}]'::jsonb)`,
    );

    // Enqueue a previously stuck '(failed)' offline order + an offline attendance punch
    offlineStorage.enqueueOfflineAttendance({
      id: "att-offline-1",
      payload: { action: "clock_in" },
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
    });

    offlineStorage.enqueueOfflineOrder({
      id: "offline-stuck-key-9001",
      orderNumber: "ORD-20261126-0007",
      payload: {
        orderNumber: "ORD-20261126-0007",
        // Historical tax total (10% discount on 2 * 120 = 216 subtotal + 43.20 historical tax = 259.20)
        total: 259.2,
        orderType: "dine-in",
        tableNumber: "T9",
        customerName: "Kwame Boateng",
        paymentMethod: "momo",
        items: [
          {
            id: "legacy-non-uuid-8pm",
            name: "8 PM (Big Size)",
            price: 120,
            quantity: 2, // Stock is only 1, but offline order was already paid!
            discountPercent: 10,
            discountReason: "VIP Regular",
            approvedBy: "System Administrator", // Non-UUID string from DiscountModal
          },
        ],
      },
      createdAt: new Date().toISOString(),
      status: "failed",
      retryCount: 3,
      lastError: 'null value in column "items" of relation "kitchenorders" violates not-null constraint',
    });

    const callSequence: string[] = [];
    const { POST: completeOrder } = await import("@/app/api/orders/complete/route");

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        callSequence.push(url);
        if (url.includes("/api/v2/attendance")) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.includes("/api/orders/complete")) {
          const forwardReq = new Request("http://localhost/api/orders/complete", {
            method: init?.method || "POST",
            headers: init?.headers,
            body: init?.body,
          });
          return completeOrder(forwardReq);
        }
        return new Response("Not Found", { status: 404 });
      });

    try {
      const syncResult = await offlineStorage.processOfflineQueue();
      expect(syncResult.failedCount).toBe(0);
      expect(syncResult.syncedAttendance).toBe(1);
      expect(syncResult.syncedOrders).toBe(1);
      expect(offlineStorage.getQueuedOrders()).toHaveLength(0);

      // Attendance MUST be synced before POS orders
      expect(callSequence[0]).toContain("/api/v2/attendance");
      expect(callSequence[1]).toContain("/api/orders/complete");

      // Both the original online order and the suffixed offline order exist in kitchenorders
      const ordersInDb = await pg.query<{ ordernumber: string; customername: string }>(
        `SELECT ordernumber, customername FROM kitchenorders ORDER BY ordernumber ASC`,
      );
      expect(ordersInDb.rows).toHaveLength(2);
      expect(ordersInDb.rows.some((r) => r.customername === "Kwame Boateng")).toBe(true);

      // Stock clamped cleanly to 0 while recording the full -2 sale movement
      const invAfter = await pg.query<{ quantity: string }>(
        `SELECT quantity::text FROM inventory WHERE name = '8 PM (Big Size)'`,
      );
      expect(Number(invAfter.rows[0].quantity)).toBe(0);

      const movements = await pg.query<{ quantity_delta: string }>(
        `SELECT quantity_delta::text FROM inventory_movements`,
      );
      expect(movements.rows).toHaveLength(1);
      expect(Number(movements.rows[0].quantity_delta)).toBe(-2);

      // Replaying the exact same Idempotency-Key must be idempotent without double-inserting
      const replayReq = new Request("http://localhost/api/orders/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "offline-stuck-key-9001",
          "X-Offline-Sync": "true",
        },
        body: JSON.stringify({
          orderNumber: "ORD-20261126-0007",
          total: 259.2,
          orderType: "dine-in",
          customerName: "Kwame Boateng",
          paymentMethod: "momo",
          items: [{ id: "legacy-non-uuid-8pm", name: "8 PM (Big Size)", price: 120, quantity: 2, discountPercent: 10 }],
        }),
      });
      const replayRes = await completeOrder(replayReq);
      expect(replayRes.status).toBe(200);
      const replayBody = await replayRes.json();
      expect(replayBody.idempotent).toBe(true);

      const movementsAfterReplay = await pg.query(`SELECT id FROM inventory_movements`);
      expect(movementsAfterReplay.rows).toHaveLength(1);
    } finally {
      fetchSpy.mockRestore();
      offlineStorage.clearAllQueues();
    }
  });
});
