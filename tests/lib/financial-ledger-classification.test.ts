import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/property-time", () => ({
  getCanonicalTransactionTimestamp: vi.fn().mockResolvedValue("2026-01-01T00:00:00.000Z"),
}));

import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";

describe("canonical financial ledger classification", () => {
  it("persists prefix classification and actor attribution in one ledger write", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: "ledger-1" }] });
    const client = { query } as never;

    await recordFinancialLedgerEntry(client, {
      eventKey: "vip-authorization-auth-1",
      amount: 50,
      direction: "credit",
      status: "completed",
      source: "vip-authorization-auth-1",
      metadata: {
        performedBy: { id: "user-1", name: "Reception" },
        approvedBy: { id: "manager-1", name: "Manager" },
      },
    });

    const params = query.mock.calls[0][1] as unknown[];
    const metadata = JSON.parse(String(params[12]));
    expect(metadata).toMatchObject({
      department: "Shared Event",
      businessUnit: "Shared Event",
      classificationRule: "vip-authorization-shared-event",
      performedBy: { accountName: "Reception" },
      approvedBy: { accountName: "Manager" },
    });
  });
});
