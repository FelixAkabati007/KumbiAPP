import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { createAuditLog } from "@/lib/audit-logger";

const reviewerRoles = ["admin", "manager"];

export async function GET() {
  const session = await getSession();
  if (!session || !reviewerRoles.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await query(`SELECT id, requested_by, reviewed_by, status, reason, decision_note, target_staff_ids, requesting_manager_role, created_at, investigated_at, resolved_at, archived_at FROM staff_termination_cases WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 100`);
  return NextResponse.json({ requests: result.rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !["manager", "admin"].includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { staffIds?: string[]; reason?: string } | null;
  const staffIds = Array.isArray(body?.staffIds) ? body!.staffIds.filter((id) => typeof id === "string") : [];
  const reason = body?.reason?.trim() || "";
  if (!staffIds.length || reason.length < 20 || reason.length > 10000) return NextResponse.json({ error: "Select at least one staff account and provide a reason of at least 20 characters." }, { status: 400 });
  const result = await transaction(async (client) => {
    const inserted = await client.query(`INSERT INTO staff_termination_cases (requested_by, reason, target_staff_ids, requesting_manager_role) VALUES ($1, $2, $3::jsonb, $4) RETURNING id`, [session.id, reason, JSON.stringify(staffIds), session.role]);
    const recipients = await client.query(`SELECT id FROM users WHERE role IN ('admin', 'manager') AND is_active = true`);
    for (const recipient of recipients.rows) {
      await client.query(`INSERT INTO notifications (recipient_user_id, title, message, type) VALUES ($1, $2, $3, $4)`, [recipient.id, "Staff termination request", `${session.role === "manager" ? "A manager" : "An administrator"} submitted a confidential termination request for review.`, "termination_request"]);
    }
    return inserted.rows[0];
  });
  await createAuditLog({ actionType: "termination_requested", actorId: session.id, actorName: session.email, actorRole: session.role, reason, changeDetails: { staffIds, confidential: true } });
  return NextResponse.json({ request: result }, { status: 201 });
}
