import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("hotel checkout balance contract", () => {
  it("uses the persisted check-in receipt timestamp instead of a missing reservation column", async () => {
    const source = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/api/hotels/check-out/route.ts"), "utf8");
    expect(source).toContain("h.snapshot->>'checkedInAt'");
    expect(source).not.toContain("SELECT id, room_id, guest_id, status, checked_in_at, check_in_date FROM reservations");
  });

  it("allows early checkout before two hours while retaining folio validation", async () => {
    const source = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/api/hotels/check-out/route.ts"), "utf8");
    expect(source).not.toContain("SHORT_STAY_MINIMUM_NOT_REACHED");
    expect(source).toContain("Full payment");
    expect(source).toContain("cannot exceed");
  });

  it("requires the truthful outstanding balance before checkout", async () => {
    const source = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/api/hotels/check-out/route.ts"), "utf8");
    expect(source).toContain("if (paid < outstandingBalance)");
    expect(source).toContain("const outstandingBalance = Number(folio.extras_outstanding ?? 0)");
    expect(source).toContain("COALESCE(service_charges, 0) + COALESCE(food_charges, 0) + COALESCE(other_charges, 0)");
    expect(source).toContain("Full payment of");
    expect(source).toContain("UPDATE guest_folios SET paid_amount");
  });
});
