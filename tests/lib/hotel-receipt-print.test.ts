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
    expect(source).toContain("STATUTORY_LEVIES_HEADER");
    expect(source).toContain("levyRowsBlock");
    expect(source).toContain("Taxable Subtotal");
    expect(source).toContain("graFiscalHeaderHtml");
    expect(source).toContain("graFiscalFooterHtml");
  });
});
