import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { createAuditLog, type AuditActionType } from "@/lib/audit-logger";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["admin", "manager"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: string; note?: string } | null;
  const action = body?.action;
  if (!action || !["investigate", "approve", "deny", "archive", "purge"].includes(action)) return NextResponse.json({ error: "Invalid review action" }, { status: 400 });
  if (action === "purge" && session.role !== "admin") return NextResponse.json({ error: "Only Admin can permanently purge messages" }, { status: 403 });
  if (action === "approve" && session.role !== "admin" && session.role !== "manager") return NextResponse.json({ error: "Only General Manager or Admin can approve" }, { status: 403 });
  const result = await transaction(async (client) => {
    const found = await client.query(`SELECT id, status, requested_by, reason, target_staff_ids FROM staff_termination_cases WHERE id = $1 FOR UPDATE`, [id]);
    if (!found.rows[0]) return null;
    const item = found.rows[0];
    if (action === "approve") {
      const ids = Array.isArray(item.target_staff_ids) ? item.target_staff_ids : [];
      for (const staffId of ids) await client.query(`UPDATE staff_profiles SET is_active = false, employment_status = 'terminated', updated_at = NOW() WHERE id = $1`, [staffId]);
      await client.query(`UPDATE staff_termination_cases SET status = 'approved', reviewed_by = $2, decision_note = $3, resolved_at = NOW() WHERE id = $1`, [id, session.id, body?.note?.trim() || "Approved by reviewer"]);
    } else if (action === "deny") await client.query(`UPDATE staff_termination_cases SET status = 'denied', reviewed_by = $2, decision_note = $3, resolved_at = NOW() WHERE id = $1`, [id, session.id, body?.note?.trim() || "Denied by reviewer"]);
    else if (action === "investigate") await client.query(`UPDATE staff_termination_cases SET status = 'investigating', reviewed_by = $2, investigated_at = NOW(), decision_note = $3 WHERE id = $1`, [id, session.id, body?.note?.trim() || "Investigation opened"]);
    else if (action === "archive") await client.query(`UPDATE staff_termination_cases SET archived_at = NOW() WHERE id = $1`, [id]);
    else await client.query(`UPDATE staff_termination_cases SET reason = '[PURGED BY ADMIN]', decision_note = '[PURGED BY ADMIN]', purged_at = NOW() WHERE id = $1`, [id]);
    await client.query(`INSERT INTO notifications (recipient_user_id, title, message, type) VALUES ($1, $2, $3, $4)`, [item.requested_by, `Termination request ${action}`, `Your confidential termination request was marked ${action}.`, "termination_update"]);
    return item;
  });
  if (!result) return NextResponse.json({ error: "Termination request not found" }, { status: 404 });
  await createAuditLog({ actionType: `termination_${action}` as AuditActionType, actorId: session.id, actorName: session.email, actorRole: session.role, reason: body?.note?.trim() || action, changeDetails: { terminationRequestId: id, confidential: true } });
  return NextResponse.json({ ok: true, status: action });
}
