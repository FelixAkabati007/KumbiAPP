import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("hotel checkout constraint resilience contract", () => {
  it("does not rely on ON CONFLICT for transactions table which has no unique constraint", () => {
    const source = readFileSync(join(process.cwd(), "app/api/hotels/check-out/route.ts"), "utf8");
    expect(source).not.toContain("ON CONFLICT (transaction_reference)");
    expect(source).toContain("WHERE NOT EXISTS");
    expect(source).toContain("SELECT 1 FROM transactions WHERE transaction_reference = $1");
  });

  it("does not rely on ON CONFLICT for operational_outbox table", () => {
    const source = readFileSync(join(process.cwd(), "app/api/hotels/check-out/route.ts"), "utf8");
    expect(source).not.toContain("ON CONFLICT (idempotency_key)");
    expect(source).toContain("SELECT 1 FROM operational_outbox WHERE idempotency_key = $2");
  });

  it("ensures folios route also avoids raw ON CONFLICT on transactions", () => {
    const source = readFileSync(join(process.cwd(), "app/api/hotels/folios/[reservationId]/route.ts"), "utf8");
    expect(source).not.toContain("ON CONFLICT (transaction_reference)");
    expect(source).toContain("WHERE NOT EXISTS");
    expect(source).toContain("SELECT 1 FROM transactions WHERE transaction_reference = $1");
  });
});
