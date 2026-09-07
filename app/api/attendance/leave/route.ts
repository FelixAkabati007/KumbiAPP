import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const managerRoles = ["admin", "manager", "operationsManager"];
const requiredReportTypes = ["sick", "maternity"];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isManager = managerRoles.includes(session.role);
  const result = await query(`SELECT lr.*, CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name FROM leave_requests lr LEFT JOIN staff_profiles sp ON sp.user_id = lr.staff_id WHERE ${isManager ? "true" : "lr.staff_id = $1"} ORDER BY lr.created_at DESC LIMIT 100`, isManager ? [] : [session.id]);
  return NextResponse.json({ requests: result.rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { leaveType?: string; startDate?: string; endDate?: string; reason?: string; medicalReportPath?: string } | null;
  if (!body?.leaveType || !body.startDate || !body.endDate || !body.reason?.trim()) return NextResponse.json({ error: "Leave type, dates, and reason are required" }, { status: 400 });
  if (!['annual', 'sick', 'maternity', 'emergency', 'unpaid', 'other'].includes(body.leaveType)) return NextResponse.json({ error: "Invalid leave type" }, { status: 400 });
  if (body.endDate < body.startDate) return NextResponse.json({ error: "End date cannot be before start date" }, { status: 400 });
  if (requiredReportTypes.includes(body.leaveType) && !body.medicalReportPath) return NextResponse.json({ error: "A medical hospital report is required for sick and maternity leave" }, { status: 400 });
  const duplicate = await query(`SELECT id FROM leave_requests WHERE staff_id = $1 AND status = 'pending' AND start_date <= $3::date AND end_date >= $2::date LIMIT 1`, [session.id, body.startDate, body.endDate]);
  if (duplicate.rowCount) return NextResponse.json({ error: "You already have a pending leave request for those dates" }, { status: 409 });
  const result = await query(`INSERT INTO leave_requests (staff_id, leave_type, start_date, end_date, reason, medical_report_path) VALUES ($1, $2, $3::date, $4::date, $5, $6) RETURNING *`, [session.id, body.leaveType, body.startDate, body.endDate, body.reason.trim().slice(0, 2000), body.medicalReportPath || null]);
  await query(`INSERT INTO notifications (recipient_user_id, title, message, type) SELECT id, 'New leave request', $1, 'leave_request' FROM users WHERE role IN ('admin', 'manager', 'operationsManager')`, [`A staff member submitted a ${body.leaveType} leave request from ${body.startDate} to ${body.endDate}.`]);
  return NextResponse.json({ request: result.rows[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || !managerRoles.includes(session.role)) return NextResponse.json({ error: "Manager access required" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { id?: string; status?: string; message?: string } | null;
  if (!body?.id || !["approved", "denied"].includes(body.status || "")) return NextResponse.json({ error: "Choose approved or denied" }, { status: 400 });
  const result = await query(`UPDATE leave_requests SET status = $2, reviewer_message = NULLIF($3, ''), reviewed_by = $4, reviewed_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`, [body.id, body.status, body.message?.trim().slice(0, 2000) || "", session.id]);
  if (!result.rowCount) return NextResponse.json({ error: "Request is no longer pending" }, { status: 409 });
  const row = result.rows[0];
  await query(`INSERT INTO notifications (recipient_user_id, title, message, type) VALUES ($1, $2, $3, 'leave_decision')`, [row.staff_id, `Leave request ${body.status}`, body.message?.trim() || `Your ${row.leave_type} leave request was ${body.status}.`]);
  return NextResponse.json({ request: row });
}
