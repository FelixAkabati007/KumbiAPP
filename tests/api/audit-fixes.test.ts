import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");

describe("Audit fixes and operational invariants", () => {
  it("exports GET handlers on scheduled cron routes for Vercel Cron compatibility", async () => {
    const workforceCron = await readFile(path.join(rootDir, "app/api/v2/workforce/reminders/cron/route.ts"), "utf8");
    expect(workforceCron).toContain("export async function GET");
    expect(workforceCron).toContain("return POST(request)");

    const attendanceCron = await readFile(path.join(rootDir, "app/api/v2/attendance/auto-checkout/route.ts"), "utf8");
    expect(attendanceCron).toContain("export async function GET");
    expect(attendanceCron).toContain("return POST(request)");
  });

  it("safeguards audit logs from deletion during operational data reset and blocks production reset", async () => {
    const dataReset = await readFile(path.join(rootDir, "app/api/admin/data-reset/route.ts"), "utf8");
    expect(dataReset).toContain("ALLOW_PRODUCTION_DATA_RESET");
    expect(dataReset).toContain("canonical_financial_ledger");
    expect(dataReset).toContain('"audit_logs", "staff_audit_logs", "refund_audit_logs"');
  });

  it("verifies refund authorizer/requester session binding and cumulative checks", async () => {
    const refunds = await readFile(path.join(rootDir, "app/api/refunds/route.ts"), "utf8");
    expect(refunds).toContain("effectiveRequestedBy");
    expect(refunds).toContain("effectiveAuthorizedBy");
    expect(refunds).toContain("CUMULATIVE_REFUND_EXCEEDS_ORIGINAL");
    expect(refunds).toContain("Cumulative refund amount exceeds original order amount");
  });

  it("ensures canonical receipts are immutable on conflict", async () => {
    const repo = await readFile(path.join(rootDir, "lib/server/canonical-receipts-repository.ts"), "utf8");
    expect(repo).not.toContain("payload = EXCLUDED.payload");
    expect(repo).toContain("ON CONFLICT (identity_key) DO UPDATE SET print_method = EXCLUDED.print_method");
  });

  it("enforces Segregation of Duties on termination requests and staff deactivation", async () => {
    const termRoute = await readFile(path.join(rootDir, "app/api/admin/termination-requests/[id]/route.ts"), "utf8");
    expect(termRoute).toContain("SELF_APPROVAL_FORBIDDEN");
    expect(termRoute).toContain("UPDATE users SET is_active = false");

    const staffRoute = await readFile(path.join(rootDir, "app/api/admin/staff/[id]/route.ts"), "utf8");
    expect(staffRoute).toContain("UPDATE users SET is_active = false");
  });

  it("enforces folio debit direction and ledger recording on hotel checkout", async () => {
    const folioRoute = await readFile(path.join(rootDir, "app/api/hotels/folios/[reservationId]/route.ts"), "utf8");
    expect(folioRoute).toContain('direction: "debit"');

    const checkoutRoute = await readFile(path.join(rootDir, "app/api/hotels/check-out/route.ts"), "utf8");
    expect(checkoutRoute).toContain("recordFinancialLedgerEntry");
    expect(checkoutRoute).toContain('direction: "credit"');
    expect(checkoutRoute).toContain('source: "hotel_checkout"');
  });
});
