import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("hotel checkout balance contract", () => {
  it("requires the truthful outstanding balance before checkout", async () => {
    const source = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/api/hotels/check-out/route.ts"), "utf8");
    expect(source).toContain("if (paid < outstandingBalance)");
    expect(source).toContain("Full payment of");
    expect(source).toContain("UPDATE guest_folios SET paid_amount");
  });
});
