import { query } from "@/lib/db";
import { publishRealtime } from "@/lib/realtime";
import {
  ensureWebPushSchema,
  getOrCreateVapidKeys,
  removeWebPushSubscription,
  sendWebPushMessage,
  type PushQueryExecutor,
  type WebPushEnvelope,
} from "@/lib/web-push";

export const DEFAULT_ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_GENERAL_MANAGER_USER_ID = "00000000-0000-4000-8000-000000000002";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let notificationsSchemaEnsured = false;

export async function ensureNotificationsSchema(
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<void> {
  if (notificationsSchemaEnsured && executor === (query as unknown as PushQueryExecutor)) {
    return;
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS notifications (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       recipient_user_id VARCHAR(255),
       title VARCHAR(255) NOT NULL,
       message TEXT NOT NULL,
       type VARCHAR(100) NOT NULL DEFAULT 'info',
       metadata JSONB DEFAULT '{}'::jsonb,
       read BOOLEAN NOT NULL DEFAULT false,
       read_at TIMESTAMP WITH TIME ZONE,
       opened_at TIMESTAMP WITH TIME ZONE,
       expires_at TIMESTAMP WITH TIME ZONE,
       archived_at TIMESTAMP WITH TIME ZONE,
       archived_reason VARCHAR(255),
       created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS opened_at TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_reason VARCHAR(255)`,
    `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_recipient_user_id_fkey`,
  ];

  for (const stmt of statements) {
    await executor(stmt).catch(() => undefined);
  }

  await ensureWebPushSchema(executor);

  if (executor === (query as unknown as PushQueryExecutor)) {
    notificationsSchemaEnsured = true;
  }
}

export async function getAdminAndGeneralManagerUserIds(
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<string[]> {
  await ensureNotificationsSchema(executor);

  const res = await executor<{ id: string; role: string }>(
    `SELECT id::text AS id, role::text AS role
     FROM users
     WHERE role::text IN ('admin', 'manager')
       AND COALESCE(is_active, true) = true`,
  ).catch(() => ({ rows: [] as Array<{ id: string; role: string }> }));

  const ids = new Set<string>();
  let hasAdmin = false;
  let hasGeneralManager = false;

  for (const row of res.rows) {
    if (!row.id) continue;
    ids.add(String(row.id));
    if (row.role === "admin") hasAdmin = true;
    if (row.role === "manager") hasGeneralManager = true;
  }

  if (!hasAdmin) {
    ids.add(DEFAULT_ADMIN_USER_ID);
  }
  if (!hasGeneralManager) {
    ids.add(DEFAULT_GENERAL_MANAGER_USER_ID);
  }

  return Array.from(ids);
}

export async function getUnreadNotificationCount(
  userId: string,
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<number> {
  await ensureNotificationsSchema(executor);
  const res = await executor<{ unread_count: number }>(
    `SELECT COUNT(*)::int AS unread_count
     FROM notifications
     WHERE recipient_user_id::text = $1::text
       AND read_at IS NULL
       AND archived_at IS NULL`,
    [userId],
  ).catch(() => ({ rows: [{ unread_count: 0 }] }));

  return Number(res.rows[0]?.unread_count ?? 0);
}

export async function getUnreadCountsByUsers(
  userIds: string[],
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!uniqueIds.length) return counts;

  const res = await executor<{ user_id: string; unread_count: number }>(
    `SELECT recipient_user_id::text AS user_id, COUNT(*)::int AS unread_count
     FROM notifications
     WHERE recipient_user_id::text = ANY($1::text[])
       AND read_at IS NULL
       AND archived_at IS NULL
     GROUP BY recipient_user_id::text`,
    [uniqueIds],
  ).catch(() => ({ rows: [] as Array<{ user_id: string; unread_count: number }> }));

  for (const id of uniqueIds) {
    counts.set(id, 0);
  }
  for (const row of res.rows) {
    counts.set(String(row.user_id), Number(row.unread_count ?? 0));
  }
  return counts;
}

export interface DispatchPushOptions {
  recipientUserIds?: string[];
  includeAdminAndGmRoles?: boolean;
  notificationId?: string;
  title?: string;
  message?: string;
  type?: string;
  url?: string;
  tag?: string;
  silent?: boolean;
  resourceId?: string;
  fetchImpl?: typeof fetch;
}

export async function dispatchNotificationsRealtimeAndPush(
  options: DispatchPushOptions,
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<{ delivered: number; attempted: number }> {
  await ensureNotificationsSchema(executor);

  // 1. Broadcast SSE event immediately for all open browser tabs / active PWAs
  await publishRealtime(
    "notifications.updated",
    options.resourceId || options.notificationId || options.type || "sync",
    { skipWebPush: true },
  ).catch(() => undefined);

  // 2. Locate Web Push device subscriptions for targeted users (or all subscribed users on broadcast)
  const targetUserIds = Array.from(new Set((options.recipientUserIds ?? []).filter(Boolean)));

  interface SubRow {
    user_id: string;
    user_role: string | null;
    endpoint: string;
    p256dh: string;
    auth: string;
  }

  let subRows: SubRow[] = [];
  if (targetUserIds.length > 0 && options.includeAdminAndGmRoles) {
    const subRes = await executor<SubRow>(
      `SELECT user_id, user_role, endpoint, p256dh, auth
       FROM web_push_subscriptions
       WHERE user_id = ANY($1::text[])
          OR user_role IN ('admin', 'manager')`,
      [targetUserIds],
    ).catch(() => ({ rows: [] as SubRow[] }));
    subRows = subRes.rows;
  } else if (targetUserIds.length > 0) {
    const subRes = await executor<SubRow>(
      `SELECT user_id, user_role, endpoint, p256dh, auth
       FROM web_push_subscriptions
       WHERE user_id = ANY($1::text[])`,
      [targetUserIds],
    ).catch(() => ({ rows: [] as SubRow[] }));
    subRows = subRes.rows;
  } else {
    // Broadcast / SQL-SELECT notification path: push to all subscribed devices
    const subRes = await executor<SubRow>(
      `SELECT user_id, user_role, endpoint, p256dh, auth
       FROM web_push_subscriptions`,
    ).catch(() => ({ rows: [] as SubRow[] }));
    subRows = subRes.rows;
  }

  if (!subRows.length) {
    return { delivered: 0, attempted: 0 };
  }

  const allLookupIds = Array.from(
    new Set([...targetUserIds, ...subRows.map((s) => String(s.user_id)).filter(Boolean)]),
  );
  const unreadByUser = await getUnreadCountsByUsers(allLookupIds, executor);

  // Fallback unread count for admin/GM devices if subscribed under canonical ID before DB sync
  let fallbackAdminGmUnread = 0;
  for (const id of targetUserIds) {
    fallbackAdminGmUnread = Math.max(fallbackAdminGmUnread, unreadByUser.get(id) ?? 0);
  }

  const vapid = await getOrCreateVapidKeys(executor);
  const fetchFn = options.fetchImpl ?? fetch;

  let delivered = 0;
  await Promise.all(
    subRows.map(async (sub) => {
      let unreadCount = unreadByUser.get(String(sub.user_id)) ?? 0;
      if (
        unreadCount === 0 &&
        options.includeAdminAndGmRoles &&
        (sub.user_role === "admin" || sub.user_role === "manager") &&
        fallbackAdminGmUnread > 0
      ) {
        unreadCount = fallbackAdminGmUnread;
      }

      const envelope: WebPushEnvelope = {
        type: "kumbi_notification",
        notificationId: options.notificationId,
        title: options.silent ? undefined : options.title,
        body: options.silent ? undefined : options.message,
        category: options.type || "info",
        url: options.url || "/",
        tag:
          options.tag ||
          (options.notificationId ? `kumbi-notif-${options.notificationId}` : undefined),
        unreadCount,
        silent: Boolean(options.silent || !options.title),
        sentAt: new Date().toISOString(),
      };

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const wrappedFetch: typeof fetch = (input, init) =>
          fetchFn(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));

        const res = await sendWebPushMessage(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          envelope,
          vapid,
          wrappedFetch,
        );

        if (res.delivered) {
          delivered += 1;
        } else if (res.gone) {
          await removeWebPushSubscription(sub.endpoint, undefined, executor);
        }
      } catch {
        // Non-fatal: individual unreachable push endpoint must never fail business logic
      }
    }),
  );

  return { delivered, attempted: subRows.length };
}

export interface AdminGmAlertInput {
  title: string;
  message: string;
  type: string;
  url?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
  excludeUserIds?: string[];
  fetchImpl?: typeof fetch;
}

/**
 * Inserts a persistent notification for every active Admin (`admin`) and General Manager (`manager`)
 * and immediately dispatches SSE + Web Push + App Icon Badge updates across all of their devices.
 */
export async function notifyAdminsAndGeneralManagers(
  input: AdminGmAlertInput,
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<{ recipientIds: string[]; notificationIds: string[]; deliveredPush: number }> {
  await ensureNotificationsSchema(executor);

  const excluded = new Set((input.excludeUserIds ?? []).filter(Boolean));
  const recipients = (await getAdminAndGeneralManagerUserIds(executor)).filter(
    (id) => !excluded.has(id),
  );

  const metadataPayload = {
    ...(input.metadata ?? {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
  };
  const metadataJson = JSON.stringify(metadataPayload);
  const notificationIds: string[] = [];

  for (const recipientId of recipients) {
    // Only insert UUID-shaped IDs if recipient_user_id on a legacy DB might be UUID;
    // all users.id and DEFAULT_*_USER_ID values are valid UUIDs.
    if (!UUID_REGEX.test(recipientId)) continue;

    if (input.dedupeKey) {
      const existing = await executor<{ id: string }>(
        `SELECT id::text AS id
         FROM notifications
         WHERE recipient_user_id::text = $1::text
           AND type = $2::varchar
           AND metadata->>'dedupeKey' = $3::text
         LIMIT 1`,
        [recipientId, input.type, input.dedupeKey],
      ).catch(() => ({ rows: [] as Array<{ id: string }> }));

      if (existing.rows[0]?.id) {
        notificationIds.push(existing.rows[0].id);
        continue;
      }
    }

    const ins = await executor<{ id: string }>(
      `INSERT INTO notifications (recipient_user_id, title, message, type, metadata)
       VALUES ($1, $2::varchar, $3::text, $4::varchar, $5::jsonb)
       RETURNING id::text AS id`,
      [
        recipientId,
        input.title.slice(0, 250),
        input.message,
        input.type.slice(0, 95),
        metadataJson,
      ],
    ).catch((err) => {
      console.warn("[notifications] Failed inserting Admin/GM notification:", err);
      return { rows: [] as Array<{ id: string }> };
    });

    if (ins.rows[0]?.id) {
      notificationIds.push(ins.rows[0].id);
    }
  }

  const pushResult = await dispatchNotificationsRealtimeAndPush(
    {
      recipientUserIds: recipients,
      includeAdminAndGmRoles: true,
      notificationId: notificationIds[0],
      title: input.title,
      message: input.message,
      type: input.type,
      url: input.url || "/attendance",
      tag: input.dedupeKey || (notificationIds[0] ? `kumbi-notif-${notificationIds[0]}` : undefined),
      fetchImpl: input.fetchImpl,
    },
    executor,
  );

  return {
    recipientIds: recipients,
    notificationIds,
    deliveredPush: pushResult.delivered,
  };
}

/**
 * Fans out Web Push alerts and current unread badge counts to subscribed devices
 * whenever any route inserts into `notifications` and publishes `notifications.updated`.
 */
export async function pushRecentUnreadNotifications(
  resourceId?: string,
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
  fetchImpl: typeof fetch = fetch,
): Promise<{ delivered: number; attempted: number }> {
  await ensureNotificationsSchema(executor);

  interface SubRow {
    user_id: string;
    user_role: string | null;
    endpoint: string;
    p256dh: string;
    auth: string;
  }

  const subRes = await executor<SubRow>(
    `SELECT user_id, user_role, endpoint, p256dh, auth
     FROM web_push_subscriptions`,
  ).catch(() => ({ rows: [] as SubRow[] }));

  if (!subRes.rows.length) {
    return { delivered: 0, attempted: 0 };
  }

  const userIds = Array.from(new Set(subRes.rows.map((s) => String(s.user_id)).filter(Boolean)));
  const [unreadByUser, recentRes, vapid] = await Promise.all([
    getUnreadCountsByUsers(userIds, executor),
    executor<{
      id: string;
      user_id: string;
      title: string;
      message: string;
      type: string;
    }>(
      `SELECT DISTINCT ON (recipient_user_id::text)
         id::text AS id,
         recipient_user_id::text AS user_id,
         title,
         message,
         type
       FROM notifications
       WHERE recipient_user_id::text = ANY($1::text[])
         AND read_at IS NULL
         AND archived_at IS NULL
         AND created_at >= CURRENT_TIMESTAMP - INTERVAL '60 seconds'
       ORDER BY recipient_user_id::text, created_at DESC`,
      [userIds],
    ).catch(() => ({
      rows: [] as Array<{ id: string; user_id: string; title: string; message: string; type: string }>,
    })),
    getOrCreateVapidKeys(executor),
  ]);

  const recentByUser = new Map<string, { id: string; title: string; message: string; type: string }>();
  for (const row of recentRes.rows) {
    recentByUser.set(String(row.user_id), {
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
    });
  }

  // Only push to users who just received a new unread notification (within 60s)
  const matchingSubs = subRes.rows.filter((sub) => recentByUser.has(String(sub.user_id)));
  if (!matchingSubs.length) {
    return { delivered: 0, attempted: 0 };
  }

  let delivered = 0;
  await Promise.all(
    matchingSubs.map(async (sub) => {
      const recent = recentByUser.get(String(sub.user_id));
      const unreadCount = unreadByUser.get(String(sub.user_id)) ?? 0;
      const envelope: WebPushEnvelope = {
        type: "kumbi_notification",
        notificationId: recent?.id || resourceId,
        title: recent?.title,
        body: recent?.message,
        category: recent?.type || "info",
        url: "/",
        tag: recent?.id ? `kumbi-notif-${recent.id}` : undefined,
        unreadCount,
        silent: !recent?.title,
        sentAt: new Date().toISOString(),
      };

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const wrappedFetch: typeof fetch = (input, init) =>
          fetchImpl(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));

        const res = await sendWebPushMessage(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          envelope,
          vapid,
          wrappedFetch,
        );
        if (res.delivered) {
          delivered += 1;
        } else if (res.gone) {
          await removeWebPushSubscription(sub.endpoint, undefined, executor);
        }
      } catch {
        // Non-fatal
      }
    }),
  );

  return { delivered, attempted: matchingSubs.length };
}
