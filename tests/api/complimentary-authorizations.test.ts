import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/admin/complimentary-authorizations/[id]/route";

const { queryMock, getSessionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: queryMock }));
vi.mock("@/lib/auth", () => ({ getSession: getSessionMock }));

describe("Complimentary authorization canonical folio detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ id: "admin-1", role: "admin" });
  });

  it("returns the linked canonical folio and its summary", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: "auth-1",
        reservation_id: "reservation-1",
        folio_id: "folio-1",
        folio_state: "linked",
        folio_total_charges: "250.00",
        folio_paid_amount: "50.00",
        folio_balance: "200.00",
        folio_summary: {
          gross_amount: "250.00",
          complimentary_amount: "100.00",
          paid_amount: "50.00",
          balance: "200.00",
        },
        folio_items: [{ id: "item-1", total_amount: "250.00" }],
        usage: [{ amount_used: "100.00" }],
      }],
    });

    const response = await GET(new Request("http://localhost/api/admin/complimentary-authorizations/auth-1"), {
      params: Promise.resolve({ id: "auth-1" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.folio_id).toBe("folio-1");
    expect(body.folio_state).toBe("linked");
    expect(body.folio_summary).toEqual({
      gross_amount: "250.00",
      complimentary_amount: "100.00",
      paid_amount: "50.00",
      balance: "200.00",
    });
    expect(body.folio_items).toHaveLength(1);
  });

  it("returns an explicit pending-link state without a reservation", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: "auth-2",
        reservation_id: null,
        folio_id: null,
        folio_state: "pending_link",
        folio_total_charges: null,
        folio_paid_amount: null,
        folio_balance: null,
        folio_summary: {
          gross_amount: 0,
          complimentary_amount: "0",
          paid_amount: 0,
          balance: 0,
        },
        folio_items: [],
        usage: [],
      }],
    });

    const response = await GET(new Request("http://localhost/api/admin/complimentary-authorizations/auth-2"), {
      params: Promise.resolve({ id: "auth-2" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.folio_state).toBe("pending_link");
    expect(body.folio_id).toBeNull();
    expect(body.folio_items).toEqual([]);
  });

  it("does not duplicate folio items across repeated detail reads", async () => {
    const detail = {
      id: "auth-3",
      folio_id: "folio-3",
      folio_state: "linked",
      folio_summary: { gross_amount: "90.00", complimentary_amount: "30.00", paid_amount: "0.00", balance: "90.00" },
      folio_items: [{ id: "item-3", total_amount: "90.00" }],
      usage: [{ amount_used: "30.00" }],
    };
    queryMock.mockResolvedValue({ rows: [detail] });

    const first = await GET(new Request("http://localhost/api/admin/complimentary-authorizations/auth-3"), {
      params: Promise.resolve({ id: "auth-3" }),
    });
    const second = await GET(new Request("http://localhost/api/admin/complimentary-authorizations/auth-3"), {
      params: Promise.resolve({ id: "auth-3" }),
    });

    expect((await first.json()).folio_items).toEqual((await second.json()).folio_items);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the gross folio amount unchanged when a waiver is used", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: "auth-4",
        folio_id: "folio-4",
        folio_state: "linked",
        folio_total_charges: "120.00",
        folio_summary: { gross_amount: "120.00", complimentary_amount: "40.00", paid_amount: "0.00", balance: "120.00" },
        folio_items: [{ id: "item-4", total_amount: "120.00" }],
        usage: [{ amount_used: "40.00" }],
      }],
    });

    const response = await GET(new Request("http://localhost/api/admin/complimentary-authorizations/auth-4"), {
      params: Promise.resolve({ id: "auth-4" }),
    });
    const body = await response.json();

    expect(body.folio_summary.gross_amount).toBe("120.00");
    expect(body.folio_summary.complimentary_amount).toBe("40.00");
    expect(body.folio_summary.balance).toBe("120.00");
  });
});
