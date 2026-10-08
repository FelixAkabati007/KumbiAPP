import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("complimentary authorization guest creation", () => {
  it("does not insert a null surname for a single-word guest name", async () => {
    const source = await readFile(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../app/api/admin/complimentary-authorizations/route.ts",
      ),
      "utf8",
    );

    expect(source).toContain('guestParts.slice(1).join(" ") || ""');
    expect(source).not.toContain('guestParts.slice(1).join(" ") || null');
  });
});
