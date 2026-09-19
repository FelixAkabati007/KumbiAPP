import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { PATCH, POST } from "../../app/api/events/quotes/route";

const { queryMock, transactionMock, requirePermissionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  transactionMock: vi.fn(),
  requirePermissionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  query: queryMock,
  transaction: transactionMock,
}));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: requirePermissionMock,
}));

describe("Event quote transactional flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      session: { id: "staff-1" },
      error: null,
    });
  });

  it("rejects a discount greater than the subtotal", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "event-1" }] });

    const response = await POST(
      new Request("http://localhost/api/events/quotes", {
        method: "POST",
        body: JSON.stringify({
          eventId: "event-1",
          discountAmount: 150,
          taxAmount: 0,
          items: [
            {
              label: "Venue",
              quantity: 1,
              unitPrice: 100,
              pricingUnit: "fixed",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Discount cannot exceed");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("creates a draft using server-calculated totals", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "event-1" }] });
    transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) =>
      callback({
        query: vi.fn()
          .mockResolvedValueOnce({
            rows: [{
              id: "quote-1",
              event_id: "event-1",
              status: "draft",
              subtotal: "200",
              total: "180",
            }],
          })
          .mockResolvedValue({ rows: [] }),
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/events/quotes", {
        method: "POST",
        body: JSON.stringify({
          eventId: "event-1",
          discountAmount: 20,
          taxAmount: 0,
          items: [
            { label: "Venue", quantity: 2, unitPrice: 100, pricingUnit: "fixed" },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.quote.total).toBe("180");
    expect(transactionMock).toHaveBeenCalledOnce();
  });

  it("rejects an invalid status transition without updating the quote", async () => {
    const clientQuery = vi.fn().mockResolvedValueOnce({
      rows: [{ id: "quote-1", event_id: "event-1", status: "draft" }],
    });
    transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) =>
      callback({ query: clientQuery }),
    );

    const response = await PATCH(
      new Request("http://localhost/api/events/quotes", {
        method: "PATCH",
        body: JSON.stringify({ quoteId: "quote-1", status: "accepted" }),
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("draft to accepted");
    expect(clientQuery).toHaveBeenCalledOnce();
  });

  it("supersedes the previous active quote when approving a replacement", async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ id: "quote-2", event_id: "event-1", status: "pending_approval" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: "quote-2", event_id: "event-1", status: "approved", approved_by: "staff-1" }],
});

    transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) =>
      callback({ query: clientQuery }),
    );

    const response = await PATCH(
      new Request("http://localhost/api/events/quotes", {
        method: "PATCH",
        body: JSON.stringify({ quoteId: "quote-2", status: "approved" }),
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).quote.status).toBe("approved");
    expect(clientQuery).toHaveBeenCalledTimes(3);
    expect(String((clientQuery as Mock).mock.calls[1][0])).toContain("superseded");
  });
});
