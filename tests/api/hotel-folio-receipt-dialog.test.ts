import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("hotel folio receipt interaction", () => {
  it("uses an in-place receipt dialog instead of redirecting to receipt generator", async () => {
    const source = await readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../app/hotels/check-in/page.tsx"), "utf8");
    expect(source).toContain("Restaurant receipt");
    expect(source).toContain("window.print()");
    expect(source).not.toContain("window.open(`/receipt?orderNumber=");
  });
});
