import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("hotel checkout SQL parameter typing", () => {
  it("casts reused checkout identifiers at every SQL type boundary", () => {
    const source = readFileSync(join(process.cwd(), "app/api/hotels/check-out/route.ts"), "utf8");
    expect(source).toContain("SELECT $1::uuid, 'cleaning', 'normal', $2::text");
    expect(source).toContain("WHERE room_id = $1::uuid");
    expect(source).toContain("snapshot = snapshot || jsonb_build_object('checkedOutBy', $2::jsonb");
  });
});

// The checkout endpoint must never rely on PostgreSQL inferring the type of a reused parameter.
