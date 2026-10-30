import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setOfflineCachedUser,
  getOfflineCachedUser,
  clearOfflineCachedUser,
  setOfflineMenuCatalog,
  getOfflineMenuCatalog,
  setOfflineInventory,
  getOfflineInventory,
  enqueueOfflineOrder,
  getQueuedOrders,
  removeQueuedOrder,
  enqueueOfflineAttendance,
  getQueuedAttendance,
  removeQueuedAttendance,
  getOfflineQueueStats,
  clearAllQueues,
  processOfflineQueue,
  type QueuedOfflineOrder,
  type QueuedOfflineAttendance,
} from "@/lib/offline-storage";

describe("Offline Storage & Sync Engine", () => {
  beforeEach(() => {
    // Clear localStorage and queue state
    localStorage.clear();
    clearAllQueues();
    vi.restoreAllMocks();
  });

  describe("Auth Session Caching", () => {
    it("should store and retrieve cached user profile", () => {
      const user = {
        id: "usr-123",
        name: "Test Cashier",
        email: "cashier@kumbisaly.com",
        role: "cashier",
      };

      setOfflineCachedUser(user);
      const cached = getOfflineCachedUser();

      expect(cached).not.toBeNull();
      expect(cached?.id).toBe("usr-123");
      expect(cached?.role).toBe("cashier");
      expect(cached?.name).toBe("Test Cashier");
      expect(typeof cached?.cachedAt).toBe("number");
    });

    it("should clear cached user session", () => {
      setOfflineCachedUser({
        id: "usr-456",
        name: "Manager",
        email: "manager@kumbisaly.com",
        role: "manager",
      });

      clearOfflineCachedUser();
      expect(getOfflineCachedUser()).toBeNull();
    });

    it("should expire sessions older than 72 hours", () => {
      const expiredTimestamp = Date.now() - (73 * 60 * 60 * 1000);
      localStorage.setItem(
        "kumbi_offline_auth_user",
        JSON.stringify({
          id: "usr-old",
          name: "Old Session",
          email: "old@kumbisaly.com",
          role: "cashier",
          cachedAt: expiredTimestamp,
        })
      );

      expect(getOfflineCachedUser()).toBeNull();
    });
  });

  describe("Menu Catalog & Inventory Caching", () => {
    it("should store and retrieve offline menu catalog", () => {
      const items = [
        {
          id: "m-1",
          name: "Jollof Rice",
          price: 45,
          category: "ghanaian" as const,
          description: "Spicy rice",
          inStock: true,
        },
        {
          id: "m-2",
          name: "Club Beer",
          price: 15,
          category: "beverages" as const,
          description: "Chilled beer",
          inStock: true,
        },
      ];

      setOfflineMenuCatalog(items);
      const cached = getOfflineMenuCatalog();

      expect(cached.length).toBe(2);
      expect(cached[0].name).toBe("Jollof Rice");
      expect(cached[1].price).toBe(15);
    });

    it("should store and retrieve offline inventory snapshot", () => {
      const inventory = [
        { id: "inv-1", name: "Rice 50kg", quantity: 12, unit: "bag" },
        { id: "inv-2", name: "Cooking Oil", quantity: 5, unit: "gallon" },
      ];

      setOfflineInventory(inventory);
      const cached = getOfflineInventory<typeof inventory[0]>();

      expect(cached.length).toBe(2);
      expect(cached[0].quantity).toBe(12);
    });
  });

  describe("POS Offline Orders Queue", () => {
    const mockOrder: QueuedOfflineOrder = {
      id: "ord-test-1",
      orderNumber: "ORD-1001",
      payload: {
        orderNumber: "ORD-1001",
        total: 60,
        orderType: "dine-in",
        paymentMethod: "cash",
        items: [
          { name: "Jollof Rice", price: 45, quantity: 1 },
          { name: "Club Beer", price: 15, quantity: 1 },
        ],
      },
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
    };

    it("should enqueue and retrieve offline orders", () => {
      enqueueOfflineOrder(mockOrder);
      const orders = getQueuedOrders();

      expect(orders.length).toBe(1);
      expect(orders[0].orderNumber).toBe("ORD-1001");
      expect(orders[0].status).toBe("pending");
    });

    it("should deduplicate orders by orderNumber", () => {
      enqueueOfflineOrder(mockOrder);
      enqueueOfflineOrder({
        ...mockOrder,
        id: "ord-test-duplicate",
        payload: { ...mockOrder.payload, total: 75 },
      });

      const orders = getQueuedOrders();
      expect(orders.length).toBe(1);
      expect(orders[0].payload.total).toBe(75);
    });

    it("should remove order from queue", () => {
      enqueueOfflineOrder(mockOrder);
      removeQueuedOrder(mockOrder.id);

      expect(getQueuedOrders().length).toBe(0);
    });
  });

  describe("Attendance Queue", () => {
    const mockAttendance: QueuedOfflineAttendance = {
      id: "att-1",
      payload: { action: "clock_in" },
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
    };

    it("should enqueue and remove attendance punches", () => {
      enqueueOfflineAttendance(mockAttendance);
      expect(getQueuedAttendance().length).toBe(1);

      removeQueuedAttendance(mockAttendance.id);
      expect(getQueuedAttendance().length).toBe(0);
    });
  });

  describe("Queue Metrics & Stats", () => {
    it("should calculate total queue stats accurately", () => {
      enqueueOfflineOrder({
        id: "ord-1",
        orderNumber: "ORD-1",
        payload: { orderNumber: "ORD-1", total: 10, orderType: "takeout", paymentMethod: "cash", items: [] },
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });

      enqueueOfflineAttendance({
        id: "att-1",
        payload: { action: "clock_in" },
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });

      const stats = getOfflineQueueStats();
      expect(stats.orders).toBe(1);
      expect(stats.attendance).toBe(1);
      expect(stats.total).toBe(2);
    });
  });

  describe("Queue Processing & Sync Engine", () => {
    it("should drain orders and attendance successfully when online", async () => {
      enqueueOfflineOrder({
        id: "ord-sync-1",
        orderNumber: "ORD-9999",
        payload: { orderNumber: "ORD-9999", total: 50, orderType: "dine-in", paymentMethod: "cash", items: [] },
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });

      enqueueOfflineAttendance({
        id: "att-sync-1",
        payload: { action: "clock_in" },
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });

      // Mock fetch responses
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("/api/orders/complete")) {
          return new Response(JSON.stringify({ success: true, orderId: "srv-ord-1" }), { status: 200 });
        }
        if (urlStr.includes("/api/v2/attendance")) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const result = await processOfflineQueue();

      expect(result.syncedOrders).toBe(1);
      expect(result.syncedAttendance).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(getQueuedOrders().length).toBe(0);
      expect(getQueuedAttendance().length).toBe(0);

      fetchSpy.mockRestore();
    });

    it("should retain orders in queue when network error occurs", async () => {
      enqueueOfflineOrder({
        id: "ord-fail-1",
        orderNumber: "ORD-FAIL",
        payload: { orderNumber: "ORD-FAIL", total: 50, orderType: "dine-in", paymentMethod: "cash", items: [] },
        createdAt: new Date().toISOString(),
        status: "pending",
        retryCount: 0,
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

      const result = await processOfflineQueue();

      expect(result.syncedOrders).toBe(0);
      expect(result.failedCount).toBe(1);
      // Order stays in queue with incremented retry count
      const queued = getQueuedOrders();
      expect(queued.length).toBe(1);
      expect(queued[0].retryCount).toBe(1);
      expect(queued[0].status).toBe("failed");

      fetchSpy.mockRestore();
    });
  });
});
