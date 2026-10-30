import * as React from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { OfflineSyncIndicator } from "@/components/offline-sync-indicator";
import * as offlineStorage from "@/lib/offline-storage";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("OfflineSyncIndicator Navbar Component", () => {
  beforeEach(() => {
    localStorage.clear();
    offlineStorage.clearAllQueues();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("renders online status icon by default", async () => {
    render(<OfflineSyncIndicator />);

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /network connected/i });
      expect(button).toBeDefined();
    });
  });

  test("renders offline mode status and badge when device is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    render(<OfflineSyncIndicator />);

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /offline mode/i });
      expect(button).toBeDefined();
    });
  });

  test("displays badge counter when offline items are queued", async () => {
    offlineStorage.enqueueOfflineOrder({
      id: "ord-test",
      orderNumber: "ORD-99",
      payload: {
        orderNumber: "ORD-99",
        total: 100,
        orderType: "dine-in",
        paymentMethod: "cash",
        items: [],
      },
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
    });

    render(<OfflineSyncIndicator />);

    await waitFor(() => {
      const badge = screen.getByText("1");
      expect(badge).toBeDefined();
    });
  });

  test("opens popover with breakdown and triggers manual sync", async () => {
    offlineStorage.enqueueOfflineOrder({
      id: "ord-test-2",
      orderNumber: "ORD-102",
      payload: {
        orderNumber: "ORD-102",
        total: 75,
        orderType: "takeout",
        paymentMethod: "cash",
        items: [],
      },
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
    });

    const processSpy = vi.spyOn(offlineStorage, "processOfflineQueue").mockResolvedValue({
      syncedOrders: 1,
      syncedAttendance: 0,
      syncedMutations: 0,
      failedCount: 0,
      errors: [],
    });

    render(<OfflineSyncIndicator />);

    const trigger = await screen.findByRole("button", { name: /items pending sync/i });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Network & Local Sync")).toBeDefined();
      expect(screen.getByText("Order #ORD-102")).toBeDefined();
    });

    const syncBtn = screen.getByRole("button", { name: /sync now/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(processSpy).toHaveBeenCalled();
    });
  });
});
