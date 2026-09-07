import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const managerRoles = ["admin", "manager", "operationsManager"];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isManager = managerRoles.includes(session.role);
  const result = await query(
    `SELECT ae.*, CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name, sp.department
     FROM attendance_exceptions ae
     LEFT JOIN staff_profiles sp ON sp.user_id = ae.staff_id
     WHERE ${isManager ? "true" : "ae.staff_id = $1"}
     ORDER BY ae.created_at DESC LIMIT 100`,
    isManager ? [] : [session.id],
  );
  return NextResponse.json({ exceptions: result.rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!body?.id || !body.message?.trim()) return NextResponse.json({ error: "A message is required" }, { status: 400 });
  const result = await query(
    `UPDATE attendance_exceptions SET staff_reply = $2, status = 'pending_approval', updated_at = now()
     WHERE id = $1 AND staff_id = $3 AND status = 'awaiting_reason' RETURNING *`,
    [body.id, body.message.trim().slice(0, 2000), session.id],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Exception is no longer awaiting a reply" }, { status: 409 });
  return NextResponse.json({ exception: result.rows[0] });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || !managerRoles.includes(session.role)) return NextResponse.json({ error: "Manager access required" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { id?: string; status?: string; message?: string } | null;
  if (!body?.id || !["approved", "denied", "confirmed", "resumed"].includes(body.status || "")) return NextResponse.json({ error: "Invalid exception decision" }, { status: 400 });
  const result = await query(
    `UPDATE attendance_exceptions SET status = $2, manager_message = COALESCE($3, manager_message), resolved_by = $4, resolved_at = now(), updated_at = now()
     WHERE id = $1 AND status IN ('awaiting_reason', 'pending_approval', 'approved', 'denied') RETURNING *`,
    [body.id, body.status, body.message?.trim().slice(0, 2000) || null, session.id],
  );
  if (!result.rowCount) return NextResponse.json({ error: "Exception is already resolved" }, { status: 409 });
  const row = result.rows[0];
  await query(`INSERT INTO notifications (recipient_user_id, title, message, type) VALUES ($1, $2, $3, 'attendance_exception_decision')`, [row.staff_id, `Attendance exception ${body.status}`, body.message?.trim() || `Your attendance exception was ${body.status}.`]);
  return NextResponse.json({ exception: row });
}
