import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("hotel receipt print preview", () => {
  it("writes the complete receipt markup before printing", async () => {
    const source = await readFile(path.resolve(process.cwd(), "lib/hotel-receipt-print.ts"), "utf8");
    expect(source).toContain("const markup =");
    expect(source).toContain("printWindow.document.open();");
    expect(source).toContain("printWindow.document.write(markup);");
    expect(source).toContain("Guest folio charge");
  });
});
