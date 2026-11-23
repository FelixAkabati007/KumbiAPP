import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("hotel checkout constraint and parameter type resilience contract", () => {
  it("does not rely on ON CONFLICT for transactions table and casts parameter $1 explicitly", () => {
    const source = readFileSync(join(process.cwd(), "app/api/hotels/check-out/route.ts"), "utf8");
    expect(source).not.toContain("ON CONFLICT (transaction_reference)");
    expect(source).toContain("WHERE NOT EXISTS");
    expect(source).toContain("SELECT 1 FROM transactions WHERE transaction_reference = $1::text");
    expect(source).toContain("SELECT NULL, $1::text, $2::numeric, 'GHS', 'cash', 'completed', $3::jsonb, $4::uuid");
  });

  it("does not rely on ON CONFLICT for operational_outbox table and casts parameter $2 explicitly", () => {
    const source = readFileSync(join(process.cwd(), "app/api/hotels/check-out/route.ts"), "utf8");
    expect(source).not.toContain("ON CONFLICT (idempotency_key)");
    expect(source).toContain("SELECT 1 FROM operational_outbox WHERE idempotency_key = $2::text");
  });

  it("avoids inconsistent parameter type deduction in hotel_receipts insert", () => {
    const source = readFileSync(join(process.cwd(), "app/api/hotels/check-out/route.ts"), "utf8");
    // Ensure $1 is not reused with conflicting types $1::uuid and $1::text in the same query
    expect(source).not.toContain("VALUES ($1::uuid, $2::uuid, $1::text");
    expect(source).toContain("VALUES ($1::uuid, $2::uuid, $3::text, $4::text, 'check_out', $5::jsonb, $6::uuid)");
  });

  it("ensures folios route also explicitly casts parameters on transactions insert", () => {
    const source = readFileSync(join(process.cwd(), "app/api/hotels/folios/[reservationId]/route.ts"), "utf8");
    expect(source).not.toContain("ON CONFLICT (transaction_reference)");
    expect(source).toContain("WHERE NOT EXISTS");
    expect(source).toContain("SELECT 1 FROM transactions WHERE transaction_reference = $1::text");
    expect(source).toContain("SELECT NULL, $1::text, $2::numeric, 'GHS', 'guest-folio', 'completed', $3::jsonb, $4::uuid");
  });
});
