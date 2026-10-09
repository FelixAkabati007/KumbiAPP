import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("short-stay checkout SQL parameter typing", () => {
  it("uses a dedicated text parameter for source-id concatenation", () => {
    const source = readFileSync(join(process.cwd(), "lib/services/hotel-folio.ts"), "utf8");
    expect(source).toContain("'system', $5::text || ':short-stay:' || block_number");
    expect(source).toContain("existing.source_id = $5::text || ':short-stay:' || block_number");
    expect(source).toContain("[reservationId, folio.rows[0].id, stay.room_rate, billableBlocks, reservationId]");
  });
});
