import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { propertyDayExpression } from "@/lib/operational-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await transaction(async (client) => {
    const stale = await client.query(
      `UPDATE attendance_records
       SET status = 'auto_closed', updated_at = now(), notes = CONCAT_WS(' ', notes, 'Auto-closed at operational day boundary.')
       WHERE check_in_at IS NOT NULL AND check_out_at IS NULL AND created_at::date < ${propertyDayExpression()}
       RETURNING id, staff_id`,
    );
    for (const record of stale.rows) {
      await client.query(
        `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
         VALUES ('attendance.auto_closed', 'attendance', $1, $2, $3::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [record.id, `attendance-auto-closed:${record.id}`, JSON.stringify({ staffId: record.staff_id })],
      );
    }
    return stale.rows.length;
  });

  const pending = await query(`SELECT count(*)::int AS count FROM operational_outbox WHERE status = 'pending'`);
  return NextResponse.json({ staleAttendanceClosed: result, pendingOutbox: pending.rows[0]?.count ?? 0 });
}
