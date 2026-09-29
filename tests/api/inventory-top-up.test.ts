import { describe, expect, it } from "vitest";
import { parsePositiveQuantity } from "@/lib/inventory-top-up-validation";

describe("inventory top-up validation", () => {
  it("accepts positive integer, decimal, and string quantities", () => {
    expect(parsePositiveQuantity(5)).toBe(5);
    expect(parsePositiveQuantity("2.5")).toBe(2.5);
    expect(parsePositiveQuantity(".75")).toBe(0.75);
  });

  it("rejects zero, negative, empty, malformed, and non-finite quantities", () => {
    for (const value of [0, "0", -1, "", "  ", "1e3", "1,000", "abc", Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(parsePositiveQuantity(value)).toBeNull();
    }
  });

  it("rejects values above the safety maximum", () => {
    expect(parsePositiveQuantity("1000000001")).toBeNull();
    expect(parsePositiveQuantity("1000000000")).toBe(1_000_000_000);
  });

  it("preserves the audit quantity invariant", () => {
    const before = parsePositiveQuantity("0") ?? 0;
    const added = parsePositiveQuantity("250000.75");
    expect(added).toBe(250000.75);
    expect(before + (added ?? 0)).toBe(250000.75);
  });
});
