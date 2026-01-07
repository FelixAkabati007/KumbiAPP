import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { getRefundService } from "../../lib/refund-service";

// Mock fetch globally
global.fetch = vi.fn();

describe("RefundService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates an auto-approved refund for small amounts", async () => {
    // Mock successful create response
    const mockCreatedRefund = {
      id: "ref-1",
      orderId: "ORDER-1",
      orderNumber: "ORD-001",
      customerName: "John Doe",
      refundAmount: 25,
      originalAmount: 100,
      reason: "Item damaged",
      authorizedBy: "Restaurant Manager",
      requestedBy: "staff@restaurant.com",
      paymentMethod: "cash",
      status: "pending",
      requestedAt: new Date().toISOString(),
    };

    // Mock successful approve response
    const mockApprovedRefund = {
      ...mockCreatedRefund,
      status: "approved",
      approvedBy: "Restaurant Manager",
    };

    (global.fetch as Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreatedRefund,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockApprovedRefund,
      });

    const service = getRefundService();
    const refund = await service.createRefundRequest({
      orderId: "ORDER-1",
      orderNumber: "ORD-001",
      customerName: "John Doe",
      refundAmount: 25,
      originalAmount: 100,
      reason: "Item damaged",
      authorizedBy: "Restaurant Manager",
      requestedBy: "staff@restaurant.com",
      paymentMethod: "cash",
    });

    expect(refund.status).toBe("approved");
    expect(global.fetch).toHaveBeenCalledTimes(2); // Create + Approve
  });

  it("requires approval for large amounts", async () => {
    const mockCreatedRefund = {
      id: "ref-2",
      orderId: "ORDER-2",
      orderNumber: "ORD-002",
      customerName: "Jane Smith",
      refundAmount: 600,
      originalAmount: 700,
      reason: "Order issue",
      authorizedBy: "Restaurant Manager",
      requestedBy: "manager@restaurant.com",
      paymentMethod: "card",
      status: "pending",
      requestedAt: new Date().toISOString(),
    };

    (global.fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCreatedRefund,
    });

    const service = getRefundService();
    const refund = await service.createRefundRequest({
      orderId: "ORDER-2",
      orderNumber: "ORD-002",
      customerName: "Jane Smith",
      refundAmount: 600,
      originalAmount: 700,
      reason: "Order issue",
      authorizedBy: "Restaurant Manager",
      requestedBy: "manager@restaurant.com",
      paymentMethod: "card",
    });

    expect(refund.status).toBe("pending");
    expect(global.fetch).toHaveBeenCalledTimes(1); // Create only
  });
});
