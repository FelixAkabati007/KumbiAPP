import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { resolveWorkforceSchedule } from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const schedule = await resolveWorkforceSchedule(session.id, undefined, undefined, session.role);
    return NextResponse.json(
      {
        schedule: {
          schedule_name: schedule.schedule_name,
          job_classification: schedule.job_classification,
          department: schedule.department,
          shift_period: schedule.shift_period,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          reminder_minutes: schedule.reminder_minutes,
          assignment_status: schedule.assignment_status,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (cause) {
    console.error("[workforce] schedule lookup failed", cause);
    return NextResponse.json({ error: "Unable to load today’s schedule" }, { status: 500 });
  }
}
