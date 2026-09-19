import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("hotel checkout extras balance", () => {
  it("uses only service, food, and other charges after room payment", async () => {
    const source = await readFile(
      path.resolve(process.cwd(), "app/api/hotels/checked-in/route.ts"),
      "utf8",
    );

    expect(source).toContain("AS extras_outstanding");
    expect(source).toContain("COALESCE(gf.service_charges, 0)");
    expect(source).toContain("COALESCE(gf.food_charges, 0)");
    expect(source).toContain("COALESCE(gf.other_charges, 0)");
    expect(source).toContain("COALESCE(gf.paid_amount, 0) - COALESCE(gf.room_charge, 0)");
  });
});
