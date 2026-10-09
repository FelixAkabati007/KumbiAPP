import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("short-stay checkout SQL parameter typing", () => {
  it("casts the reused reservation id before text source-id concatenation", () => {
    const source = readFileSync(join(process.cwd(), "lib/services/hotel-folio.ts"), "utf8");
    expect(source).toContain("existing.source_id = ($1::uuid)::text || ':short-stay:' || block_number");
  });
});
