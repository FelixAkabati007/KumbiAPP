import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await query(
    `INSERT INTO notification_logs (notification_id, recipient_user_id, title, message, type, created_at, opened_at, archived_at, archived_reason)
     SELECT id, recipient_user_id, title, message, type, created_at, opened_at, CURRENT_TIMESTAMP, 'opened_notification_expired'
     FROM notifications n
     WHERE n.recipient_user_id = $1 AND n.archived_at IS NULL AND n.expires_at IS NOT NULL AND n.expires_at <= CURRENT_TIMESTAMP
       AND NOT EXISTS (SELECT 1 FROM notification_logs l WHERE l.notification_id = n.id)`,
    [session.id],
  );
  await query(
    `UPDATE notifications SET archived_at = CURRENT_TIMESTAMP, archived_reason = 'opened_notification_expired'
     WHERE recipient_user_id = $1 AND archived_at IS NULL AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`,
    [session.id],
  );
  const result = await query(
    `SELECT id, title, message, type, read_at, opened_at, created_at
     FROM notifications
     WHERE recipient_user_id = $1 AND archived_at IS NULL
     ORDER BY created_at DESC
     LIMIT 50`,
    [session.id],
  );
  return NextResponse.json({ notifications: result.rows });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string; markAllRead?: boolean; opened?: boolean } | null;
  if (body?.markAllRead) {
    await query(
      "UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE recipient_user_id = $1 AND archived_at IS NULL",
      [session.id],
    );
  } else if (body?.id) {
    await query(
      `UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP), opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP), expires_at = COALESCE(expires_at, CURRENT_TIMESTAMP + INTERVAL '30 days')
       WHERE id = $1 AND recipient_user_id = $2 AND archived_at IS NULL`,
      [body.id, session.id],
    );
  } else {
    return NextResponse.json({ error: "Provide id or markAllRead" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    message?: string;
    type?: string;
  } | null;
  const title = body?.title?.trim();
  const message = body?.message?.trim();
  if (!title || !message || title.length > 160 || message.length > 5000) {
    return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO notifications (recipient_user_id, title, message, type)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, message, type, read_at, opened_at, created_at`,
    [session.id, title, message, body?.type?.trim().slice(0, 40) || "info"],
  );
  return NextResponse.json({ notification: result.rows[0] }, { status: 201 });
}
