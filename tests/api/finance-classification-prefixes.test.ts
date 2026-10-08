import { describe, expect, it } from "vitest";
import { financeClassificationMetadata } from "@/lib/finance-classification";

describe("finance classification prefixes", () => {
  it("maps F0 transactions to Shared / Corporate", () => {
    expect(financeClassificationMetadata("F0-123")).toMatchObject({ department: "Shared", businessUnit: "Corporate" });
  });

  it("maps VIP authorization transactions to Shared Event", () => {
    expect(financeClassificationMetadata("vip-authorization-123")).toMatchObject({ department: "Shared Event", businessUnit: "Shared Event" });
  });

  it("maps event payments to Event Organization", () => {
    expect(financeClassificationMetadata("event-payment:123")).toMatchObject({ department: "Event Organization", businessUnit: "Event Organization" });
  });

  it("keeps the classification independent from an existing department", () => {
    expect(financeClassificationMetadata("F0-123", "Restaurant")).toMatchObject({ department: "Shared", businessUnit: "Corporate" });
    expect(financeClassificationMetadata("vip-authorization-123", "Hotel")).toMatchObject({ department: "Shared Event", businessUnit: "Shared Event" });
    expect(financeClassificationMetadata("event-payment:123", "Restaurant")).toMatchObject({ department: "Event Organization", businessUnit: "Event Organization" });
  });
});
