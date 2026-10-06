import { describe, expect, it } from "vitest";
import {
  canonicalReceiptKey,
  canonicalizeReceipt,
  normalizePrintMethod,
  normalizeReceiptSource,
} from "@/lib/canonical-receipts";

describe("canonical receipt normalization", () => {
  it("maps source aliases to one canonical source", () => {
    expect(normalizeReceiptSource("POS")).toBe("restaurant");
    expect(normalizeReceiptSource("folio")).toBe("hotel");
    expect(normalizeReceiptSource("catering-event")).toBe("event");
  });

  it("maps printing aliases to one canonical method", () => {
    expect(normalizePrintMethod("print-bridge")).toBe("bridge");
    expect(normalizePrintMethod("USB")).toBe("thermal");
    expect(normalizePrintMethod("window")).toBe("browser");
  });

  it("deduplicates equivalent receipt identities", () => {
    const first = canonicalizeReceipt({
      source: "POS",
      entityId: " order-7 ",
      receiptNumber: " r-100 ",
      version: 1,
      printMethod: "USB",
      payload: {},
    });
    const second = canonicalizeReceipt({
      source: "restaurant",
      entityId: "order-7",
      receiptNumber: "R-100",
      version: 1,
      printMethod: "thermal",
      payload: {},
    });

    expect(canonicalReceiptKey(first.identity)).toBe(canonicalReceiptKey(second.identity));
    expect(first.printMethod).toBe(second.printMethod);
  });
});
