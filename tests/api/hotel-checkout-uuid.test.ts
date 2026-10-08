import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("hotel checkout UUID boundaries", () => {
  it("casts checkout identifiers at SQL comparison boundaries", () => {
    const route = readFileSync(resolve(process.cwd(), "app/api/hotels/check-out/route.ts"), "utf8");
    const folio = readFileSync(resolve(process.cwd(), "lib/services/hotel-folio.ts"), "utf8");

    expect(route).toContain("WHERE r.id = $1::uuid");
    expect(route).toContain("WHERE id = $1::uuid AND status = 'checked_in'");
    expect(route).toContain("WHERE id = $1::uuid AND status = 'checked_out'");
    expect(folio).toContain("WHERE r.id = $1::uuid AND r.status = 'checked_in'");
    expect(folio).toContain("WHERE item.reservation_id = $1::uuid");
  });
});
