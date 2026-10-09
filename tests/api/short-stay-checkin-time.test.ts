import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("short-stay check-in time source", () => {
  it("starts billing from the persisted actual check-in instant", () => {
    const source = readFileSync(join(root, "lib/services/hotel-folio.ts"), "utf8");
    expect(source).toContain("r.check_in_at");
    expect(source).toContain("CURRENT_TIMESTAMP - COALESCE(r.check_in_at, r.check_in_date::timestamptz)");
    expect(source).toContain("const elapsed = Number(stay.elapsed_ms || 0)");
    expect(source).not.toContain("Date.now() - new Date(stay.check_in_date).getTime()");
  });
});
