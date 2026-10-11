import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireRole("admin", "manager");
  if (error) return error;
  const result = await query(`SELECT id, name, job_classification, department, shift_period, start_time::text, end_time::text, reminder_minutes, timezone, is_active FROM work_schedules ORDER BY department, job_classification, name`);
  return NextResponse.json({ schedules: result.rows });
}

export async function POST(request: Request) {
  const { error } = await requireRole("admin", "manager");
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const jobClassification = String(body.jobClassification || "").trim();
  const department = String(body.department || "").trim();
  const startTime = String(body.startTime || "");
  const endTime = String(body.endTime || "");
  const validDepartments = ["Hotel", "Restaurant", "Operations"];
  const validClassifications = ["Reception", "Restaurant Front Desk / POS", "Waiter/Waitress", "Chef", "Housekeeping", "Security", "Labour", "Other"];
  if (!name || !validClassifications.includes(jobClassification) || !validDepartments.includes(department) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return NextResponse.json({ error: "Select an existing department and role or classification, then enter valid times." }, { status: 400 });
  const result = await query(`INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes, timezone, is_active) VALUES ($1,$2,$3,$4,$5,$6,'Africa/Accra',true) RETURNING id, name, job_classification, department, start_time::text, end_time::text, reminder_minutes`, [name, jobClassification, department, startTime, endTime, Math.max(0, Math.min(180, Number(body.reminderMinutes) || 20))]);
  return NextResponse.json({ schedule: result.rows[0] }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { error } = await requireRole("admin", "manager");
  if (error) return error;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });
  await query("DELETE FROM work_schedules WHERE id = $1", [id]);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const { error } = await requireRole("admin", "manager");
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });
  const validDepartments = ["Hotel", "Restaurant", "Operations"];
  const validClassifications = ["Reception", "Restaurant Front Desk / POS", "Waiter/Waitress", "Chef", "Housekeeping", "Security", "Labour", "Other"];
  if (!validDepartments.includes(String(body.department)) || !validClassifications.includes(String(body.jobClassification)) || !/^\d{2}:\d{2}$/.test(String(body.startTime)) || !/^\d{2}:\d{2}$/.test(String(body.endTime))) return NextResponse.json({ error: "Select existing department and role values, then enter valid times." }, { status: 400 });
  const result = await query(`UPDATE work_schedules SET name=$1, department=$2, job_classification=$3, start_time=$4, end_time=$5, reminder_minutes=$6, updated_at=now() WHERE id=$7 RETURNING *`, [body.name, body.department, body.jobClassification, body.startTime, body.endTime, Number(body.reminderMinutes) || 20, body.id]);
  return NextResponse.json({ schedule: result.rows[0] });
}
