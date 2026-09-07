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
  if (!name || !jobClassification || !department || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return NextResponse.json({ error: "Enter a name, department, role, start time, and end time." }, { status: 400 });
  const result = await query(`INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes, timezone, is_active) VALUES ($1,$2,$3,$4,$5,$6,'Africa/Accra',true) RETURNING id, name, job_classification, department, start_time::text, end_time::text, reminder_minutes`, [name, jobClassification, department, startTime, endTime, Math.max(0, Math.min(180, Number(body.reminderMinutes) || 20))]);
  return NextResponse.json({ schedule: result.rows[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { error } = await requireRole("admin", "manager");
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });
  const result = await query(`UPDATE work_schedules SET start_time=$1, end_time=$2, reminder_minutes=$3, updated_at=now() WHERE id=$4 RETURNING *`, [body.startTime, body.endTime, Number(body.reminderMinutes) || 20, body.id]);
  return NextResponse.json({ schedule: result.rows[0] });
}
