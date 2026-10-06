import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { transaction } from "@/lib/db";
import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";

export async function PATCH(request: Request) {
  const { session, error } = await requirePermission("events");
  if (error) return error;
  const body = await request.json();
  const id = String(body.id ?? "").trim();
  const decision = body.decision === "reject" ? "rejected" : "approved";
  const reason = String(body.rejectionReason ?? "").trim() || null;
  if (!id || (decision === "rejected" && !reason))
    return NextResponse.json(
      { error: "Refund id and rejection reason are required" },
      { status: 400 },
    );
  const result = await transaction(async (client) => {
    const requestResult = await client.query(
      `SELECT id, event_id, amount, status FROM event_refund_requests WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const refund = requestResult.rows[0];
    if (!refund || refund.status !== "pending_finance_approval") return null;
    if (decision === "approved") {
      const balance = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0)::numeric AS balance
         FROM canonical_financial_ledger WHERE entity_type = 'event' AND entity_id = $1 AND status = 'posted'`,
        [refund.event_id],
      );
      if (Number(refund.amount) > Number(balance.rows[0]?.balance ?? 0) + 0.005)
        throw new Error("REFUND_EXCEEDS_POSTED_BALANCE");
    }
    const updated = await client.query(
      `UPDATE event_refund_requests SET status = $2, approved_by = $3, approved_at = NOW(), rejection_reason = $4, updated_at = NOW() WHERE id = $1 RETURNING id, event_id, amount, status, approved_at, rejection_reason`,
      [id, decision, session.id, reason],
    );
    if (decision === "approved") {
      await recordFinancialLedgerEntry(client, {
        eventKey: `event-refund:${id}`,
        amount: Number(refund.amount),
        direction: "debit",
        status: "posted",
        source: "event_refund",
        journalType: "refund",
        entityType: "event",
        entityId: refund.event_id,
        metadata: { refundRequestId: id, approvedBy: session.id, reason },
      });
    }
    return updated.rows[0];
  });
  if (!result)
    return NextResponse.json(
      { error: "Refund not found or already decided" },
      { status: 404 },
    );
  return NextResponse.json({ refund: result });
}
