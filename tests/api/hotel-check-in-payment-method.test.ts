import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("hotel check-in Finance payment method", () => {
  it("uses a payment method accepted by payment_method_enum", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "app/api/hotels/check-in/route.ts"),
      "utf8",
    );

    expect(source).toContain("'guest-folio'::payment_method_enum");
    expect(source).not.toContain("'hotel-check-in'");
  });
});
