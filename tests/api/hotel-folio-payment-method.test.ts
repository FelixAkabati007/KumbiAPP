import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("hotel folio restaurant payment contract", () => {
  it("persists the database-supported guest-folio method", async () => {
    const routePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../app/api/hotels/folios/[reservationId]/restaurant-order/route.ts",
    );
    const source = await readFile(routePath, "utf8");

    expect(source).toContain("'guest-folio', 'completed'");
    expect(source).not.toContain("'folio-charge'");
  });
});
