import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("hotel check-in SQL parameter contracts", () => {
  it("types every reused identifier parameter explicitly", () => {
    const source = readFileSync(join(process.cwd(), "app/api/hotels/check-in/route.ts"), "utf8");

    expect(source).toContain("transaction_reference = $1::text");
    expect(source).toContain("SELECT $1::uuid, $2::uuid, $3::uuid");
    expect(source).toContain("WHERE r.id = $2::uuid");
    expect(source).toContain("$3::uuid, 'hotel'");
    expect(source).not.toContain("'room_stay'");
    expect(source).toContain("JOIN users u ON u.id = $3::uuid");
    expect(source).toContain("), $3::uuid");
  });
});
