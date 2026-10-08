import { describe, expect, it } from "vitest";
import { financeClassificationMetadata } from "@/lib/finance-classification";

describe("finance classification exceptions", () => {
  it("maps F0 transactions to Shared / Corporate", () => {
    expect(financeClassificationMetadata("F0-001")).toMatchObject({ department: "Shared", businessUnit: "Corporate" });
  });

  it("maps VIP authorization transactions to Shared Event", () => {
    expect(financeClassificationMetadata("vip-authorization-001")).toMatchObject({ department: "Shared Event", businessUnit: "Shared Event" });
  });
});
