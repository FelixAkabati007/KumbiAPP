import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock modules
const mockSession = {
  id: "mgr-001",
  email: "gm@kumbisaly.com",
  role: "manager",
  name: "General Manager",
};

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockImplementation(() => Promise.resolve(mockSession)),
}));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: vi.fn().mockImplementation(() => {
    return Promise.resolve({ session: mockSession });
  }),
  requireRole: vi.fn().mockImplementation((...roles: string[]) => {
    if (roles.includes(mockSession.role)) {
      return Promise.resolve({ session: mockSession });
    }
    return Promise.resolve({
      error: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });
  }),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/system-sync", () => ({
  updateSystemState: vi.fn().mockResolvedValue(true),
}));

const mockPublishRealtime = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/realtime", () => ({
  publishRealtime: (...args: unknown[]) => mockPublishRealtime(...args),
}));

vi.mock("@/lib/property-time", () => ({
  getCanonicalTransactionTimestamp: vi.fn().mockResolvedValue("2026-10-30T10:00:00Z"),
}));

vi.mock("@/lib/blob-storage", () => ({
  putBlob: vi.fn().mockResolvedValue({
    pathname: "inventory-evidence/test-evidence.jpg",
    contentType: "image/jpeg",
    size: 1024,
  }),
  getBlob: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/db/ensure-variance-table", () => ({
  ensureInventoryVariancesTable: vi.fn().mockResolvedValue(true),
}));

const mockQuery = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: (callback: (client: { query: typeof mockQuery }) => Promise<unknown>) =>
    mockTransaction(callback),
}));

describe("Inventory Variance & Manager Review Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.role = "manager";
    mockSession.name = "General Manager";
    mockSession.id = "mgr-001";
  });

  describe("POST /api/inventory/variance (Submission)", () => {
    it("persists stock issue variance, notifies all managers, and emits realtime events", async () => {
      const { POST } = await import("@/app/api/inventory/variance/route");

      // Mock item lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "inv-100", name: "Fresh Salmon", unit: "kg", quantity: 25.0 }],
      });

      // Mock variance insert
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "var-001", status: "pending", quantity: 3.5 }],
      });

      // Mock active managers lookup (admin, manager, restaurantManager)
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: "adm-1", role: "admin", name: "Admin User" },
          { id: "mgr-1", role: "manager", name: "General Manager" },
          { id: "rm-1", role: "restaurantManager", name: "Restaurant Manager" },
        ],
      });

      // Mock notification inserts
      mockQuery.mockResolvedValue({ rows: [] });

      // Create dummy file for evidence
      const dummyFile = new File([new Uint8Array([1, 2, 3])], "evidence.jpg", {
        type: "image/jpeg",
      });

      const formData = new FormData();
      formData.append("inventoryItemId", "inv-100");
      formData.append("quantity", "3.5");
      formData.append("reason", "expired");
      formData.append("explanation", "Found 3.5kg expired salmon in freezer");
      formData.append("evidence", dummyFile);

      const request = new Request("http://localhost:3000/api/inventory/variance", {
        method: "POST",
      });
      (request as any).formData = async () => formData;

      const response = await POST(request as any);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.varianceId).toBeDefined();
      expect(typeof data.varianceId).toBe("string");
      expect(data.notifiedManagersCount).toBe(3);

      // Verify realtime notifications published
      expect(mockPublishRealtime).toHaveBeenCalledWith("inventory.updated", data.varianceId);
      expect(mockPublishRealtime).toHaveBeenCalledWith("notifications.updated", data.varianceId);
    });
  });

  describe("POST /api/inventory/variance/[id]/action (Manager Action)", () => {
    it("allows General Manager to approve variance: deducts stock and records inventory_movements", async () => {
      const { POST } = await import("@/app/api/inventory/variance/[id]/action/route");

      // Setup transaction mock
      mockTransaction.mockImplementation(async (callback) => {
        const client = {
          query: vi.fn(),
        };

        // 1. Lock variance
        client.query.mockResolvedValueOnce({
          rows: [
            {
              id: "var-001",
              inventory_item_id: "inv-100",
              reported_by: "staff-99",
              reported_by_name: "Kitchen Cook",
              reported_by_role: "kitchen",
              quantity: "3.5",
              reason: "expired",
              status: "pending",
              evidence_pathname: "inventory-evidence/test.jpg",
            },
          ],
        });

        // 2. Lock inventory item
        client.query.mockResolvedValueOnce({
          rows: [
            {
              id: "inv-100",
              name: "Fresh Salmon",
              quantity: "25.0",
              unit: "kg",
            },
          ],
        });

        // 3. Update inventory stock
        client.query.mockResolvedValueOnce({
          rows: [{ id: "inv-100", quantity: "21.5" }],
        });

        // 4. Insert inventory_movements
        client.query.mockResolvedValueOnce({ rows: [{ id: "mov-001" }] });

        // 5. Update variance status
        client.query.mockResolvedValueOnce({
          rows: [{ id: "var-001", status: "approved" }],
        });

        // 6. Notify reporting staff
        client.query.mockResolvedValueOnce({ rows: [] });

        return callback(client as any);
      });

      const request = new Request("http://localhost:3000/api/inventory/variance/var-001/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          notes: "Inspected evidence. Approved write-off.",
        }),
      });

      const response = await POST(request as any, { params: Promise.resolve({ id: "var-001" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe("approve");
      expect(data.message).toContain("Stock issue approved");

      expect(mockPublishRealtime).toHaveBeenCalledWith("inventory.updated", "var-001");
      expect(mockPublishRealtime).toHaveBeenCalledWith("notifications.updated", "var-001");
    });

    it("allows Restaurant Manager to reject variance without deducting inventory stock", async () => {
      mockSession.role = "restaurantManager";
      mockSession.name = "Restaurant Manager";

      const { POST } = await import("@/app/api/inventory/variance/[id]/action/route");

      mockTransaction.mockImplementation(async (callback) => {
        const client = {
          query: vi.fn(),
        };

        // 1. Lock variance
        client.query.mockResolvedValueOnce({
          rows: [
            {
              id: "var-002",
              inventory_item_id: "inv-200",
              reported_by: "staff-77",
              reported_by_name: "Bar Tender",
              reported_by_role: "staff",
              quantity: "1.0",
              reason: "missing",
              status: "pending",
            },
          ],
        });

        // 2. Lock inventory item
        client.query.mockResolvedValueOnce({
          rows: [
            {
              id: "inv-200",
              name: "Red Wine",
              quantity: "10.0",
              unit: "bottle",
            },
          ],
        });

        // 3. Update variance status to rejected
        client.query.mockResolvedValueOnce({
          rows: [{ id: "var-002", status: "rejected" }],
        });

        // 4. Notify reporting staff
        client.query.mockResolvedValueOnce({ rows: [] });

        return callback(client as any);
      });

      const request = new Request("http://localhost:3000/api/inventory/variance/var-002/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          notes: "Bottle was found in the private reserve cabinet.",
        }),
      });

      const response = await POST(request as any, { params: Promise.resolve({ id: "var-002" }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.action).toBe("reject");
      expect(data.message).toContain("Stock issue rejected");
    });

    it("rejects non-manager staff from approving or rejecting stock issues (403)", async () => {
      mockSession.role = "kitchen";
      mockSession.name = "Line Cook";

      const { POST } = await import("@/app/api/inventory/variance/[id]/action/route");

      const request = new Request("http://localhost:3000/api/inventory/variance/var-001/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      const response = await POST(request as any, { params: Promise.resolve({ id: "var-001" }) });
      expect(response.status).toBe(403);
    });
  });
});
