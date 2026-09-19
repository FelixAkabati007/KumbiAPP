import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

describe("hotel folio restaurant payment contract", () => {
  it("persists guest-folio for both kitchen and finance transactions", async () => {
    const testDirectory = path.dirname(fileURLToPath(import.meta.url));
    const [routeSource, schemaSource] = await Promise.all([
      readFile(path.resolve(testDirectory, "../../app/api/hotels/folios/[reservationId]/restaurant-order/route.ts"), "utf8"),
      readFile(path.resolve(testDirectory, "../../database/schema.sql"), "utf8"),
    ]);

    expect(routeSource).toContain("paymentmethod, priority, estimatedtime");
    expect(routeSource).toContain("method, status, metadata, performed_by");
    expect(routeSource).toContain("ca.valid_from <= NOW()");
    expect(routeSource).toContain("ca.valid_until > NOW()");
    expect(routeSource).toContain("ca.scope IN ('restaurant', 'both')");
    expect(routeSource).toContain("valid_from, valid_until, folio_waived");
    expect(routeSource).toContain('businessUnit: "shared"');
    expect(routeSource).toContain('grossAmount: total');
    expect(routeSource.match(/'guest-folio'/g)).toHaveLength(3);
    expect(routeSource).not.toContain("folio-charge");
    expect(schemaSource).toContain("'guest-folio'");
  });
});
