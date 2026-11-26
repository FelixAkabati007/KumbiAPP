import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
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

const mockGetSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireSession: vi.fn().mockImplementation(async () => ({
    session: await mockGetSession(),
    error: null,
  })),
  requirePermission: vi.fn().mockImplementation(async () => ({
    session: await mockGetSession(),
    error: null,
  })),
}));

describe("Receipt Generator Recent Transactions & Lookup (Online Neon Schema + Offline Mode)", () => {
  beforeAll(async () => {
    pg = new PGlite();
    // Canonical Neon schema where kitchenorders uses created_at (NO createdat, NO items JSONB column!)
    await pg.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        role VARCHAR(64) NOT NULL DEFAULT 'waiterWaitress'
      );

      CREATE TABLE kitchenorders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ordernumber VARCHAR(120) NOT NULL UNIQUE,
        total NUMERIC(12, 2) NOT NULL,
        ordertype VARCHAR(64) NOT NULL DEFAULT 'dine-in',
        tablenumber VARCHAR(64),
        customername VARCHAR(255),
        paymentmethod VARCHAR(64) NOT NULL DEFAULT 'cash',
        status VARCHAR(64) NOT NULL DEFAULT 'pending',
        priority VARCHAR(32) NOT NULL DEFAULT 'normal',
        performed_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE kitchen_orderitems (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kitchenorderid UUID NOT NULL REFERENCES kitchenorders(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(12, 2) NOT NULL,
        category VARCHAR(100),
        quantity INT NOT NULL DEFAULT 1,
        status VARCHAR(50) DEFAULT 'pending'
      );

      CREATE TABLE transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID,
        transaction_reference VARCHAR(255),
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'GHS',
        method VARCHAR(64) NOT NULL,
        status VARCHAR(50) NOT NULL,
        metadata JSONB,
        performed_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE hotel_receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number VARCHAR(120),
        order_id VARCHAR(120),
        reservation_id UUID,
        folio_id UUID,
        receipt_type VARCHAR(64),
        snapshot JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE canonical_receipts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        identity_key VARCHAR(255) UNIQUE NOT NULL,
        source VARCHAR(64) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        receipt_number VARCHAR(120) NOT NULL,
        version INT NOT NULL DEFAULT 1,
        print_method VARCHAR(64) NOT NULL,
        payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterAll(async () => {
    await pg.close();
  });

  beforeEach(async () => {
    const offlineStorage = await import("@/lib/offline-storage");
    offlineStorage.clearAllQueues();

    await pg.exec(`
      DELETE FROM canonical_receipts;
      DELETE FROM hotel_receipts;
      DELETE FROM transactions;
      DELETE FROM kitchen_orderitems;
      DELETE FROM kitchenorders;
      DELETE FROM users;
    `);

    mockGetSession.mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
      name: "Ama Waitress",
      email: "ama@kumbisaly.com",
      role: "waiterWaitress",
    });
  });

  it("returns recent online POS transactions and full receipt details when kitchenorders uses created_at without createdat/items columns", async () => {
    const ko = await pg.query<{ id: string }>(
      `INSERT INTO kitchenorders (ordernumber, total, ordertype, tablenumber, customername, paymentmethod, status)
       VALUES ('ORD-20261126-0101', 240.00, 'dine-in', 'T3', 'Kofi Annan', 'cash', 'pending')
       RETURNING id`,
    );
    await pg.query(
      `INSERT INTO kitchen_orderitems (kitchenorderid, name, price, category, quantity)
       VALUES ($1, '8 PM (Big Size)', 120.00, 'beverages', 2)`,
      [ko.rows[0].id],
    );
    await pg.query(
      `INSERT INTO transactions (transaction_reference, amount, method, status, metadata)
       VALUES ('ORD-20261126-0101', 240.00, 'cash', 'completed', $1::jsonb)`,
      [
        JSON.stringify({
          source: "pos-order-completion",
          department: "restaurant",
          orderNumber: "ORD-20261126-0101",
          performedBy: { name: "Ama Waitress", email: "ama@kumbisaly.com", role: "waiterWaitress" },
        }),
      ],
    );

    const { GET: lookupGet } = await import("@/app/api/receipts/lookup/route");

    // 1. Recent receipts chips
    const recentReq = new NextRequest(
      "http://localhost/api/receipts/lookup?recent=true&source=restaurant&limit=6",
    );
    const recentRes = await lookupGet(recentReq);
    expect(recentRes.status).toBe(200);
    const recentData = await recentRes.json();
    expect(recentData.recentReceipts).toHaveLength(1);
    expect(recentData.recentReceipts[0]).toMatchObject({
      id: "ORD-20261126-0101",
      amount: 240,
      source: "restaurant",
    });

    // 2. Full receipt lookup by order number
    const queryReq = new NextRequest(
      "http://localhost/api/receipts/lookup?query=ORD-20261126-0101&source=restaurant",
    );
    const queryRes = await lookupGet(queryReq);
    expect(queryRes.status).toBe(200);
    const queryData = await queryRes.json();
    expect(queryData.receipt).toBeDefined();
    expect(queryData.receipt.orderNumber).toBe("ORD-20261126-0101");
    expect(queryData.receipt.total).toBe(240);
    expect(queryData.receipt.items).toHaveLength(1);
    expect(queryData.receipt.items[0]).toMatchObject({
      name: "8 PM (Big Size)",
      price: 120,
      quantity: 2,
    });
    expect(queryData.receipt.performedBy?.name).toBe("Ama Waitress");

    // 3. Receipt statistics work for waiterWaitress role and deduplicate reprinted canonical_receipts
    await pg.query(
      `INSERT INTO canonical_receipts (identity_key, source, entity_id, receipt_number, version, print_method)
       VALUES ('restaurant:ord-20261126-0101:1', 'restaurant', $1, 'ORD-20261126-0101', 1, 'browser')`,
      [ko.rows[0].id],
    );
    const { GET: statsGet } = await import("@/app/api/receipts/stats/route");
    const statsRes = await statsGet();
    expect(statsRes.status).toBe(200);
    const stats = await statsRes.json();
    expect(stats.today).toBe(1);
    expect(stats.total).toBe(1);
  });

  it("surfaces offline POS transactions immediately in local recent receipts and offline lookup before and after sync", async () => {
    const offlineStorage = await import("@/lib/offline-storage");

    offlineStorage.enqueueOfflineOrder({
      id: "offline-rec-501",
      orderNumber: "ORD-OFFLINE-501",
      payload: {
        orderNumber: "ORD-OFFLINE-501",
        total: 360,
        tax: 0,
        orderType: "takeout",
        customerName: "Yaw Asante",
        paymentMethod: "cash",
        items: [
          {
            id: "item-8pm",
            name: "8 PM (Big Size)",
            price: 120,
            originalPrice: 120,
            quantity: 3,
          },
        ],
      },
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
    });

    // While offline: appears in Recent receipts chips with (offline) label
    const summariesOffline = offlineStorage.getLocalRecentReceiptSummaries("restaurant", 6);
    expect(summariesOffline).toHaveLength(1);
    expect(summariesOffline[0]).toMatchObject({
      id: "ORD-OFFLINE-501",
      label: "ORD-OFFLINE-501 (offline)",
      amount: 360,
      isOfflinePending: true,
    });

    // Searching by order number or customer name while offline returns full SalesData
    const foundByOrder = offlineStorage.findLocalReceiptByQuery("ORD-OFFLINE-501", "restaurant");
    expect(foundByOrder).not.toBeNull();
    expect(foundByOrder?.orderNumber).toBe("ORD-OFFLINE-501");
    expect(foundByOrder?.total).toBe(360);
    expect(foundByOrder?.items).toHaveLength(1);
    expect(foundByOrder?.items[0].name).toBe("8 PM (Big Size)");

    const foundByCustomer = offlineStorage.findLocalReceiptByQuery("Yaw Asante", "restaurant");
    expect(foundByCustomer?.orderNumber).toBe("ORD-OFFLINE-501");
  });
});
