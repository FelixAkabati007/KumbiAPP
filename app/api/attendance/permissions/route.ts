import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const managerRoles = ["admin", "manager", "operationsManager"];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isManager = managerRoles.includes(session.role);
  const result = await query(
    `SELECT apr.*, CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name
     FROM attendance_permission_requests apr
     LEFT JOIN staff_profiles sp ON sp.user_id = apr.staff_id
     WHERE ${isManager ? "true" : "apr.staff_id = $1"}
     ORDER BY apr.created_at DESC LIMIT 100`,
    isManager ? [] : [session.id],
  );
  return NextResponse.json({ requests: result.rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { startDate?: string; endDate?: string; reason?: string; replacementStaffId?: string; handoverNotes?: string } | null;
  if (!body?.startDate || !body.endDate || !body.reason?.trim()) return NextResponse.json({ error: "Dates and a reason are required" }, { status: 400 });
  if (body.endDate < body.startDate) return NextResponse.json({ error: "End date cannot be before start date" }, { status: 400 });
  const duplicate = await query(`SELECT id FROM attendance_permission_requests WHERE staff_id = $1 AND status = 'pending' AND start_date <= $3::date AND end_date >= $2::date LIMIT 1`, [session.id, body.startDate, body.endDate]);
  if (duplicate.rowCount) return NextResponse.json({ error: "You already have a pending request for those dates" }, { status: 409 });
  const result = await query(
    `INSERT INTO attendance_permission_requests (staff_id, start_date, end_date, reason, replacement_staff_id, handover_notes)
     VALUES ($1, $2::date, $3::date, $4, NULLIF($5, '')::uuid, NULLIF($6, '')) RETURNING *`,
    [session.id, body.startDate, body.endDate, body.reason.trim().slice(0, 2000), body.replacementStaffId || "", body.handoverNotes?.trim().slice(0, 2000) || ""],
  );
  await query(`INSERT INTO notifications (recipient_user_id, title, message, type) SELECT id, 'New attendance permission request', $1, 'attendance_permission_request' FROM users WHERE role IN ('admin', 'manager', 'operationsManager')`, [`A staff member requested permission from ${body.startDate} to ${body.endDate}.`]);
  return NextResponse.json({ request: result.rows[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || !managerRoles.includes(session.role)) return NextResponse.json({ error: "Manager access required" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { id?: string; status?: string; message?: string } | null;
  if (!body?.id || !["approved", "denied"].includes(body.status || "")) return NextResponse.json({ error: "Choose approved or denied" }, { status: 400 });
  const result = await query(`UPDATE attendance_permission_requests SET status = $2, reviewer_message = NULLIF($3, ''), reviewed_by = $4, reviewed_at = now(), updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`, [body.id, body.status, body.message?.trim().slice(0, 2000) || "", session.id]);
  if (!result.rowCount) return NextResponse.json({ error: "Request is no longer pending" }, { status: 409 });
  const row = result.rows[0];
  await query(`INSERT INTO notifications (recipient_user_id, title, message, type) VALUES ($1, $2, $3, 'attendance_permission_decision')`, [row.staff_id, `Permission request ${body.status}`, body.message?.trim() || `Your planned absence request was ${body.status}.`]);
  return NextResponse.json({ request: row });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const result = await query(`UPDATE attendance_permission_requests SET status = 'withdrawn', updated_at = now() WHERE id = $1 AND staff_id = $2 AND status = 'pending' RETURNING *`, [body?.id, session.id]);
  if (!result.rowCount) return NextResponse.json({ error: "Request cannot be withdrawn" }, { status: 409 });
  return NextResponse.json({ request: result.rows[0] });
}
