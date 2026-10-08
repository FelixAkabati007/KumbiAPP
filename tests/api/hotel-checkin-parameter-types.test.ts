import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/api/hotels/check-in/route.ts", "utf8");

describe("hotel check-in SQL parameter contracts", () => {
  it("does not reuse the receipt actor parameter as both text and uuid", () => {
    expect(source).toContain("'checkedInBy', jsonb_build_object('id', $2::text");
    expect(source).toContain("'performedBy', jsonb_build_object('id', $2::text");
    expect(source).toContain("), $3::uuid");
    expect(source).toContain("JOIN users u ON u.id = $3::uuid");
  });
});
