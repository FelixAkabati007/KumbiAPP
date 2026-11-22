import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockQueryRows: Record<string, unknown[]> = {};

vi.mock("@/lib/api-auth", () => ({
  requireSession: vi.fn().mockResolvedValue({
    session: { id: "user-1", email: "frontdesk@kumbisaly.com", role: "frontDesk" },
  }),
}));

vi.mock("@/lib/db", () => ({
  query: vi.fn().mockImplementation((sql: string) => {
    if (sql.includes("FROM hotel_receipts") && sql.includes("receipt_type IN ('check_in', 'check_out', 'hotel_stay')")) {
      return { rows: mockQueryRows.hotelReceipts || [] };
    }
    if (sql.includes("FROM reservations r") && sql.includes("JOIN guests g")) {
      return { rows: mockQueryRows.reservations || [] };
    }
    if (sql.includes("FROM guest_folio_items")) {
      return { rows: mockQueryRows.folioItems || [] };
    }
    if (sql.includes("FROM kitchenorders")) {
      return { rows: mockQueryRows.kitchenorders || [] };
    }
    if (sql.includes("FROM events e")) {
      return { rows: mockQueryRows.events || [] };
    }
    return { rows: [] };
  }),
}));

describe("Unified receipts lookup API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockQueryRows).forEach((k) => delete mockQueryRows[k]);
  });

  it("returns recent hotel receipts", async () => {
    mockQueryRows.hotelReceipts = [
      {
        id: "hr-1",
        order_number: "RES-2026-001",
        receipt_type: "check_out",
        created_at: "2026-11-22T08:00:00Z",
        total: "450.00",
        guest_name: "Kwame Mensah",
      },
    ];

    const { GET } = await import("@/app/api/receipts/lookup/route");
    const req = new NextRequest("http://localhost/api/receipts/lookup?recent=true&source=hotel");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.recentReceipts).toHaveLength(1);
    expect(data.recentReceipts[0].id).toBe("RES-2026-001");
    expect(data.recentReceipts[0].amount).toBe(450);
  });

  it("looks up hotel reservation and builds folio receipt items", async () => {
    mockQueryRows.reservations = [
      {
        id: "77777777-7777-7777-7777-777777777777",
        reservation_number: "RES-2026-002",
        check_in_date: "2026-11-20",
        check_out_date: "2026-11-22",
        stay_type: "overnight",
        status: "checked_out",
        total_price: 600,
        paid_amount: 600,
        created_at: "2026-11-20T14:00:00Z",
        guest_name: "Akosua Osei",
        room_number: "204",
        folio_id: "88888888-8888-8888-8888-888888888888",
        folio_total: 720,
        folio_paid: 720,
        folio_balance: 0,
      },
    ];

    mockQueryRows.folioItems = [
      {
        id: "fi-1",
        category: "room",
        description: "Room 204 (2 nights)",
        quantity: 2,
        unit_amount: 300,
        total_amount: 600,
      },
      {
        id: "fi-2",
        category: "restaurant",
        description: "POS Dining Charge - Order ORD-100",
        quantity: 1,
        unit_amount: 120,
        total_amount: 120,
      },
    ];

    const { GET } = await import("@/app/api/receipts/lookup/route");
    const req = new NextRequest("http://localhost/api/receipts/lookup?query=RES-2026-002&source=hotel");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.receipt).toBeDefined();
    expect(data.receipt.orderNumber).toBe("RES-2026-002");
    expect(data.receipt.customerName).toBe("Akosua Osei");
    expect(data.receipt.tableNumber).toBe("Room 204");
    expect(data.receipt.orderType).toBe("guest checkout folio");
    expect(data.receipt.items).toHaveLength(2);
    expect(data.receipt.total).toBe(720);
  });

  it("looks up restaurant POS order", async () => {
    mockQueryRows.kitchenorders = [
      {
        id: "ko-123",
        ordernumber: "ORD-20261122-005",
        total: 185.5,
        ordertype: "dine-in",
        tablenumber: "Table 4",
        customername: "John Doe",
        paymentmethod: "momo",
        status: "completed",
        createdat: "2026-11-22T01:30:00Z",
        items: [
          { id: "item-1", name: "Jollof Rice with Grilled Tilapia", price: 120, quantity: 1, total: 120 },
          { id: "item-2", name: "Fresh Sobolo Drink", price: 65.5, quantity: 1, total: 65.5 },
        ],
        performed_by_name: "Sarah Waiter",
      },
    ];

    const { GET } = await import("@/app/api/receipts/lookup/route");
    const req = new NextRequest("http://localhost/api/receipts/lookup?query=ORD-20261122-005&source=restaurant");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.receipt).toBeDefined();
    expect(data.receipt.orderNumber).toBe("ORD-20261122-005");
    expect(data.receipt.customerName).toBe("John Doe");
    expect(data.receipt.paymentMethod).toBe("momo");
    expect(data.receipt.total).toBe(185.5);
    expect(data.receipt.items).toHaveLength(2);
  });

  it("looks up event booking receipt", async () => {
    mockQueryRows.events = [
      {
        id: "e1234567-89ab-cdef-0123-456789abcdef",
        name: "Annual Corporate Banquet",
        client_name: "Apex Global Holdings",
        venue: "Heritage Grand Ballroom",
        total_invoiced: 4500,
        total_paid: 4500,
        balance_due: 0,
        created_at: "2026-11-15T10:00:00Z",
      },
    ];

    const { GET } = await import("@/app/api/receipts/lookup/route");
    const req = new NextRequest("http://localhost/api/receipts/lookup?query=EVENT-E1234567&source=event");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.receipt).toBeDefined();
    expect(data.receipt.customerName).toBe("Apex Global Holdings");
    expect(data.receipt.orderType).toBe("event booking");
    expect(data.receipt.total).toBe(4500);
  });

  it("returns receipt null when search query is blank", async () => {
    const { GET } = await import("@/app/api/receipts/lookup/route");
    const req = new NextRequest("http://localhost/api/receipts/lookup?query=");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.receipt).toBeNull();
  });
});
