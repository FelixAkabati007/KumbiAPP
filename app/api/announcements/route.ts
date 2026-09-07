import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { getRoleDisplayName, UserRole } from "@/lib/roles";

const ANNOUNCEMENT_ROLES: UserRole[] = ["admin", "manager", "restaurantManager", "hotelManager", "finance", "operationsManager"];
const ROLE_RANK: Record<string, number> = { admin: 6, manager: 5, restaurantManager: 4, hotelManager: 4, finance: 4, operationsManager: 4, staff: 1, kitchen: 1, frontDesk: 1, housekeeping: 1 };

function canAnnounce(role?: string | null) {
  return !!role && ANNOUNCEMENT_ROLES.includes(role as UserRole);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await query(`
    SELECT a.id, a.title, a.message, a.priority, a.audience_type, a.audience_roles,
      a.created_by_name, a.created_by_role, a.created_at, a.expires_at, a.archived_at,
      EXISTS (SELECT 1 FROM notifications n WHERE n.recipient_user_id = $1 AND n.type = 'announcement' AND n.title = a.title AND n.message = a.message AND n.read_at IS NOT NULL) AS is_read
    FROM announcements a
    WHERE (a.expires_at IS NULL OR a.expires_at > CURRENT_TIMESTAMP)
      AND (a.audience_type = 'all' OR $2 = ANY(a.audience_roles) OR a.created_by = $1)
      AND ($3 = true OR a.archived_at IS NULL)
    ORDER BY a.created_at DESC LIMIT 8`, [session.id, session.role, canAnnounce(session.role)]);
  return NextResponse.json({ announcements: result.rows });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAnnounce(session.role)) return NextResponse.json({ error: "Your role cannot manage announcements" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { id?: string; hidden?: boolean } | null;
  if (!body?.id || typeof body.hidden !== "boolean") return NextResponse.json({ error: "Announcement id and hidden state are required" }, { status: 400 });
  const result = await query(`UPDATE announcements SET archived_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = $1 RETURNING id, archived_at`, [body.id, body.hidden]);
  if (!result.rowCount) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  return NextResponse.json({ announcement: result.rows[0] });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAnnounce(session.role)) return NextResponse.json({ error: "Your role cannot publish announcements" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { title?: string; message?: string; priority?: string; audienceType?: string; audienceRoles?: string[]; expiresAt?: string | null } | null;
  const title = body?.title?.trim();
  const message = body?.message?.trim();
  const priority = ["normal", "important", "urgent"].includes(body?.priority ?? "") ? body?.priority : "normal";
  const audienceType = body?.audienceType === "roles" ? "roles" : "all";
  const audienceRoles = Array.isArray(body?.audienceRoles) ? body!.audienceRoles.filter((role) => Object.hasOwn(ROLE_RANK, role)) : [];
  if (!title || !message || title.length > 160 || message.length > 5000 || (audienceType === "roles" && audienceRoles.length === 0)) {
    return NextResponse.json({ error: "Provide a title, message, and valid audience" }, { status: 400 });
  }
  if (audienceRoles.some((role) => (ROLE_RANK[role] ?? 0) > (ROLE_RANK[session.role] ?? 0))) {
    return NextResponse.json({ error: "You cannot target a higher role" }, { status: 403 });
  }

  const announcement = await transaction(async (client) => {
    const created = await client.query(`INSERT INTO announcements (title, message, priority, audience_type, audience_roles, created_by, created_by_name, created_by_role, expires_at, archived_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP) RETURNING id, title, message, priority, audience_type, audience_roles, created_by_name, created_by_role, created_at, expires_at`, [title, message, priority, audienceType, audienceRoles, session.id, session.email, session.role, body?.expiresAt || null]);
    const notificationSql = audienceType === "all"
      ? `INSERT INTO notifications (recipient_user_id, title, message, type, expires_at) SELECT u.id, $1, $2, 'announcement', $3 FROM users u WHERE u.is_active = true`
      : `INSERT INTO notifications (recipient_user_id, title, message, type, expires_at) SELECT u.id, $1, $2, 'announcement', $3 FROM users u WHERE u.is_active = true AND u.role::text = ANY($4::text[])`;
    const notificationParams = audienceType === "all" ? [title, message, body?.expiresAt || null] : [title, message, body?.expiresAt || null, audienceRoles];
    const delivered = await client.query(notificationSql, notificationParams);
    return { announcement: created.rows[0], recipientCount: delivered.rowCount ?? 0 };
  });
  await fetch(new URL("/api/realtime", request.url), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: "announcements.updated", resource: announcement.announcement.id }) }).catch(() => undefined);
  return NextResponse.json(announcement, { status: 201 });
}
