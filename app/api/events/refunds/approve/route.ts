import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query } from "@/lib/db";

export async function PATCH(request: Request) {
  const { session, error } = await requirePermission("events");
  if (error) return error;
  const body = await request.json();
  const id = String(body.id ?? "").trim();
  const decision = body.decision === "reject" ? "rejected" : "approved";
  const reason = String(body.rejectionReason ?? "").trim() || null;
  if (!id || decision === "rejected" && !reason) return NextResponse.json({ error: "Refund id and rejection reason are required" }, { status: 400 });
  const result = await query(
    `UPDATE event_refund_requests SET status = $2, approved_by = $3, approved_at = NOW(), rejection_reason = $4, updated_at = NOW() WHERE id = $1 AND status = 'pending_finance_approval' RETURNING id, event_id, amount, status, approved_at, rejection_reason`,
    [id, decision, session.id, reason],
  );
  if (!result.rows[0]) return NextResponse.json({ error: "Refund not found or already decided" }, { status: 404 });
  return NextResponse.json({ refund: result.rows[0] });
}
