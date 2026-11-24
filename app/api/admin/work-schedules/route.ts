import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { managementRoles } from "@/lib/roles";
import {
  ensureDefaultWorkSchedules,
  VALID_SCHEDULE_CLASSIFICATIONS,
  VALID_SCHEDULE_DEPARTMENTS,
} from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireRole(...managementRoles);
  if (error) return error;

  await ensureDefaultWorkSchedules().catch(() => undefined);
  const result = await query(
    `SELECT id, name, job_classification, department, COALESCE(shift_period, 'standard') AS shift_period,
            start_time::text, end_time::text, reminder_minutes, timezone, is_active
     FROM work_schedules
     ORDER BY department, job_classification, name`,
  );
  return NextResponse.json({ schedules: result.rows });
}

export async function POST(request: Request) {
  const { error } = await requireRole(...managementRoles);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 150);
  const jobClassification = String(body.jobClassification || "").trim().slice(0, 100);
  const department = String(body.department || "").trim().slice(0, 100);
  const shiftPeriod = String(body.shiftPeriod || "standard").trim().toLowerCase().slice(0, 50);
  const startTime = String(body.startTime || "");
  const endTime = String(body.endTime || "");

  if (!name) {
    return NextResponse.json({ error: "Schedule name is required." }, { status: 400 });
  }
  if (!department) {
    return NextResponse.json({ error: "Department is required." }, { status: 400 });
  }
  if (!jobClassification) {
    return NextResponse.json({ error: "Role or classification is required." }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: "Please enter valid check-in and check-out times in HH:MM format." }, { status: 400 });
  }

  const reminderMinutes = Math.max(0, Math.min(180, Number(body.reminderMinutes) || 20));

  const result = await query(
    `INSERT INTO work_schedules (name, job_classification, department, shift_period, start_time, end_time, reminder_minutes, timezone, is_active)
     VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, 'Africa/Accra', true)
     RETURNING id, name, job_classification, department, shift_period, start_time::text, end_time::text, reminder_minutes, is_active`,
    [name, jobClassification, department, shiftPeriod, startTime, endTime, reminderMinutes],
  );
  return NextResponse.json({ schedule: result.rows[0] }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { error } = await requireRole(...managementRoles);
  if (error) return error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });

  await query("DELETE FROM work_schedules WHERE id = $1", [id]);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const { error } = await requireRole(...managementRoles);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });

  const name = String(body.name || "").trim().slice(0, 150);
  const department = String(body.department || "").trim().slice(0, 100);
  const jobClassification = String(body.jobClassification || "").trim().slice(0, 100);
  const shiftPeriod = String(body.shiftPeriod || "standard").trim().toLowerCase().slice(0, 50);
  const startTime = String(body.startTime || "");
  const endTime = String(body.endTime || "");

  if (!name || !department || !jobClassification || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: "Please provide valid schedule name, department, role, and shift times." }, { status: 400 });
  }

  const reminderMinutes = Math.max(0, Math.min(180, Number(body.reminderMinutes) || 20));
  const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

  const result = await query(
    `UPDATE work_schedules
     SET name = $1, department = $2, job_classification = $3, shift_period = $4,
         start_time = $5::time, end_time = $6::time, reminder_minutes = $7, is_active = $8, updated_at = now()
     WHERE id = $9
     RETURNING id, name, job_classification, department, shift_period, start_time::text, end_time::text, reminder_minutes, is_active`,
    [name, department, jobClassification, shiftPeriod, startTime, endTime, reminderMinutes, isActive, body.id],
  );

  if (!result.rowCount) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  return NextResponse.json({ schedule: result.rows[0] });
}
