import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/api/hotels/folios/[reservationId]/restaurant-order/route.ts", "utf8");

describe("hotel restaurant paid-at-order accounting", () => {
  it("does not write restaurant food orders into the room folio", () => {
    expect(source).toContain("'paid-at-order'");
    expect(source).toContain("method, status");
    expect(source).toContain("paidAtOrder: true");
    expect(source).not.toContain("INSERT INTO guest_folio_items");
    expect(source).not.toContain("SET food_charges =");
    expect(source).toContain('source: "hotel-restaurant-paid-at-order"');
  });
});
