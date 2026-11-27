import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { ensureTopUpReviewSchema } from "@/lib/db/ensure-topup-schema";
import {
  DEFAULT_ADMIN_USER_ID,
  DEFAULT_GENERAL_MANAGER_USER_ID,
  dispatchNotificationsRealtimeAndPush,
  ensureNotificationsSchema,
} from "@/lib/server-notifications";
import { DEFAULT_ROLE_ACCOUNTS } from "@/lib/default-accounts";
import { maybeDispatchDueWorkforceReminders } from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

async function getRecipientCandidateIds(session: { id: string; role: string; email?: string | null }): Promise<string[]> {
  const ids = new Set<string>([String(session.id)]);
  if (session.role === "admin") ids.add(DEFAULT_ADMIN_USER_ID);
  if (session.role === "manager") ids.add(DEFAULT_GENERAL_MANAGER_USER_ID);

  const defaultForRole = DEFAULT_ROLE_ACCOUNTS.find((acct) => acct.role === session.role);
  if (defaultForRole && (!session.email || session.email.toLowerCase() === defaultForRole.email.toLowerCase())) {
    ids.add(defaultForRole.id);
  }

  const linkedStaff = await query<{ staff_id: string | null; user_id: string | null }>(
    `SELECT id::text AS staff_id, user_id::text AS user_id
     FROM staff_profiles
     WHERE user_id::text = $1::text OR id::text = $1::text
     LIMIT 2`,
    [String(session.id)],
  ).catch(() => ({ rows: [] as Array<{ staff_id: string | null; user_id: string | null }> }));

  for (const row of linkedStaff.rows) {
    if (row.staff_id) ids.add(row.staff_id);
    if (row.user_id) ids.add(row.user_id);
  }

  return Array.from(ids);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await Promise.all([
    ensureNotificationsSchema(),
    ensureTopUpReviewSchema(),
    maybeDispatchDueWorkforceReminders(),
  ]);
  const candidateIds = await getRecipientCandidateIds(session);

  await query(
    `INSERT INTO notification_logs (notification_id, recipient_user_id, title, message, type, created_at, opened_at, archived_at, archived_reason)
     SELECT id, recipient_user_id, title, message, type, created_at, opened_at, CURRENT_TIMESTAMP, 'opened_notification_expired'
     FROM notifications n
     WHERE n.recipient_user_id::text = ANY($1::text[])
       AND n.archived_at IS NULL
       AND n.expires_at IS NOT NULL
       AND n.expires_at <= CURRENT_TIMESTAMP
       AND NOT EXISTS (SELECT 1 FROM notification_logs l WHERE l.notification_id = n.id)`,
    [candidateIds],
  ).catch(() => null);

  await query(
    `UPDATE notifications
     SET archived_at = CURRENT_TIMESTAMP, archived_reason = 'opened_notification_expired'
     WHERE recipient_user_id::text = ANY($1::text[])
       AND archived_at IS NULL
       AND expires_at IS NOT NULL
       AND expires_at <= CURRENT_TIMESTAMP`,
    [candidateIds],
  ).catch(() => null);

  const [result, countResult] = await Promise.all([
    query(
      `SELECT id, title, message, type, read_at, opened_at, created_at, metadata
       FROM notifications
       WHERE recipient_user_id::text = ANY($1::text[])
         AND archived_at IS NULL
       ORDER BY created_at DESC
       LIMIT 100`,
      [candidateIds],
    ).catch(async () =>
      query(
        `SELECT id, title, message, type, read_at, opened_at, created_at
         FROM notifications
         WHERE recipient_user_id::text = ANY($1::text[])
           AND archived_at IS NULL
         ORDER BY created_at DESC
         LIMIT 100`,
        [candidateIds],
      ),
    ),
    query<{ unread_count: number }>(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE recipient_user_id::text = ANY($1::text[])
         AND read_at IS NULL
         AND archived_at IS NULL`,
      [candidateIds],
    ).catch(() => ({ rows: [{ unread_count: 0 }] })),
  ]);

  const fallbackUnread = result.rows.filter((r) => !r.read_at).length;
  const unreadCount = Math.max(Number(countResult.rows[0]?.unread_count ?? 0), fallbackUnread);

  return NextResponse.json(
    { notifications: result.rows, unreadCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureNotificationsSchema();
  const candidateIds = await getRecipientCandidateIds(session);

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    markAllRead?: boolean;
    opened?: boolean;
  } | null;

  if (body?.markAllRead) {
    await query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
           read = true
       WHERE recipient_user_id::text = ANY($1::text[])
         AND archived_at IS NULL`,
      [candidateIds],
    );
  } else if (body?.id) {
    await query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
           read = true,
           opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP),
           expires_at = COALESCE(expires_at, CURRENT_TIMESTAMP + INTERVAL '30 days')
       WHERE id::text = $1::text
         AND recipient_user_id::text = ANY($2::text[])
         AND archived_at IS NULL`,
      [body.id, candidateIds],
    );
  } else {
    return NextResponse.json({ error: "Provide id or markAllRead" }, { status: 400 });
  }

  await dispatchNotificationsRealtimeAndPush({
    recipientUserIds: candidateIds,
    includeAdminAndGmRoles: session.role === "admin" || session.role === "manager",
    silent: true,
    type: "badge_sync",
    resourceId: body?.id || session.id,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureNotificationsSchema();

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    message?: string;
    type?: string;
    notifyManagement?: boolean;
  } | null;
  const title = body?.title?.trim();
  const message = body?.message?.trim();
  if (!title || !message || title.length > 160 || message.length > 5000) {
    return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
  }

  const notifType = body?.type?.trim().slice(0, 40) || "info";
  const result = await query<{
    id: string;
    title: string;
    message: string;
    type: string;
    read_at: string | null;
    opened_at: string | null;
    created_at: string;
  }>(
    `INSERT INTO notifications (recipient_user_id, title, message, type)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, message, type, read_at, opened_at, created_at`,
    [session.id, title, message, notifType],
  );

  const created = result.rows[0];
  await dispatchNotificationsRealtimeAndPush({
    recipientUserIds: [session.id],
    notificationId: created?.id ? String(created.id) : undefined,
    title,
    message,
    type: notifType,
    url: "/",
  }).catch(() => undefined);

  return NextResponse.json({ notification: created }, { status: 201 });
}
