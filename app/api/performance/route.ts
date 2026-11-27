import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole, requireSession } from "@/lib/api-auth";
import { managementRoles } from "@/lib/roles";
import {
  ensurePerformanceSchema,
  resolveStaffAndUserIds,
  syncOperationalPerformanceEvents,
} from "@/lib/performance-service";

export const dynamic = "force-dynamic";

const RESOLVED_EVENTS_CTE = `
  WITH resolved_events AS (
    SELECT
      pe.id,
      COALESCE(sp.id, u.id, pe.staff_id)::text AS staff_id,
      COALESCE(sp.user_id, u.id, pe.user_id)::text AS user_id,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', sp.first_name, sp.last_name)), ''),
        NULLIF(TRIM(u.name), ''),
        u.email,
        'Staff Member'
      ) AS staff_name,
      COALESCE(
        NULLIF(sp.department, ''),
        CASE
          WHEN u.role IN ('frontDesk', 'housekeeping', 'hotelManager') THEN 'Hotel'
          WHEN u.role IN ('restaurantFrontDesk', 'waiterWaitress', 'kitchen', 'restaurantManager', 'staff') THEN 'Restaurant'
          ELSE 'Operations'
        END
      ) AS department,
      pe.points,
      pe.source_type,
      COALESCE(pe.completed_at, pe.created_at, CURRENT_TIMESTAMP) AS completed_at,
      pe.metadata
    FROM performance_events pe
    LEFT JOIN staff_profiles sp
      ON sp.id = pe.staff_id
      OR sp.user_id = pe.staff_id
      OR (pe.user_id IS NOT NULL AND sp.user_id = pe.user_id)
    LEFT JOIN users u
      ON u.id = COALESCE(sp.user_id, pe.user_id, pe.staff_id)
    WHERE pe.verification_status = 'verified'
      AND (timezone('Africa/Accra', COALESCE(pe.completed_at, pe.created_at, CURRENT_TIMESTAMP)))::date BETWEEN $1::date AND $2::date
  )
`;

export async function GET(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || "1970-01-01";
    const to = url.searchParams.get("to") || "2999-12-31";
    const requestedScope = url.searchParams.get("scope");

    // Automatically ensure schema and run idempotent operational sync so points are always fresh
    await ensurePerformanceSchema();
    await syncOperationalPerformanceEvents({ from, to, actorId: session.id });

    const isManagerial = managementRoles.includes(session.role);

    // Working / Workforce roles (or explicit ?scope=me) receive their personal points ledger
    if (!isManagerial || requestedScope === "me") {
      const resolvedSelf = await resolveStaffAndUserIds(session.id);
      const candidateIds = Array.from(
        new Set(
          [session.id, resolvedSelf?.staffId, resolvedSelf?.userId].filter(
            (v): v is string => Boolean(v)
          )
        )
      );

      const [summary, staff, events] = await Promise.all([
        query(
          `${RESOLVED_EVENTS_CTE}
           SELECT COUNT(DISTINCT staff_id)::int AS staff_count,
                  COALESCE(SUM(points), 0)::numeric AS total_points,
                  COUNT(id)::int AS event_count
           FROM resolved_events
           WHERE staff_id = ANY($3::text[]) OR user_id = ANY($3::text[])`,
          [from, to, candidateIds]
        ),
        query(
          `${RESOLVED_EVENTS_CTE}
           SELECT staff_id, staff_name, department,
                  COALESCE(SUM(points), 0)::numeric AS points,
                  COUNT(id)::int AS events,
                  MAX(completed_at) AS last_activity
           FROM resolved_events
           WHERE staff_id = ANY($3::text[]) OR user_id = ANY($3::text[])
           GROUP BY staff_id, staff_name, department
           ORDER BY points DESC`,
          [from, to, candidateIds]
        ),
        query(
          `${RESOLVED_EVENTS_CTE}
           SELECT id, points, source_type, completed_at, metadata, staff_name, department
           FROM resolved_events
           WHERE staff_id = ANY($3::text[]) OR user_id = ANY($3::text[])
           ORDER BY completed_at DESC
           LIMIT 50`,
          [from, to, candidateIds]
        ),
      ]);

      return NextResponse.json({
        summary: summary.rows[0] ?? { staff_count: 0, total_points: "0", event_count: 0 },
        staff: staff.rows,
        eligibleStaff: [],
        events: events.rows,
        scope: "My Performance",
      });
    }

    const scope =
      session.role === "manager" || session.role === "admin" || session.role === "finance"
        ? null
        : session.role === "restaurantManager"
        ? "Restaurant"
        : session.role === "hotelManager"
        ? "Hotel"
        : "Operations";

    const scopeClause = scope ? "WHERE department = $3" : "";
    const params = scope ? [from, to, scope] : [from, to];

    const [summary, staff, events, eligibleStaff] = await Promise.all([
      query(
        `${RESOLVED_EVENTS_CTE}
         SELECT COUNT(DISTINCT staff_id)::int AS staff_count,
                COALESCE(SUM(points), 0)::numeric AS total_points,
                COUNT(id)::int AS event_count
         FROM resolved_events
         ${scopeClause}`,
        params
      ),
      query(
        `${RESOLVED_EVENTS_CTE}
         SELECT staff_id, staff_name, department,
                COALESCE(SUM(points), 0)::numeric AS points,
                COUNT(id)::int AS events,
                MAX(completed_at) AS last_activity
         FROM resolved_events
         ${scopeClause}
         GROUP BY staff_id, staff_name, department
         ORDER BY points DESC`,
        params
      ),
      query(
        `${RESOLVED_EVENTS_CTE}
         SELECT id, points, source_type, completed_at, metadata, staff_name, department
         FROM resolved_events
         ${scopeClause}
         ORDER BY completed_at DESC
         LIMIT 100`,
        params
      ),
      query(
        `SELECT staff_id, staff_name, department
         FROM (
           SELECT sp.id::text AS staff_id,
                  CONCAT_WS(' ', sp.first_name, sp.last_name) AS staff_name,
                  COALESCE(NULLIF(sp.department, ''), 'Operations') AS department
           FROM staff_profiles sp
           WHERE COALESCE(sp.is_active, true) = true
           UNION ALL
           SELECT u.id::text AS staff_id,
                  COALESCE(NULLIF(TRIM(u.name), ''), u.email) AS staff_name,
                  CASE
                    WHEN u.role IN ('frontDesk', 'housekeeping', 'hotelManager') THEN 'Hotel'
                    WHEN u.role IN ('restaurantFrontDesk', 'waiterWaitress', 'kitchen', 'restaurantManager', 'staff') THEN 'Restaurant'
                    ELSE 'Operations'
                  END AS department
           FROM users u
           WHERE COALESCE(u.is_active, true) = true
             AND u.role <> 'admin'
             AND NOT EXISTS (SELECT 1 FROM staff_profiles sp2 WHERE sp2.user_id = u.id)
         ) directory
         ${scope ? "WHERE department = $1" : ""}
         ORDER BY staff_name ASC`,
        scope ? [scope] : []
      ),
    ]);

    return NextResponse.json({
      summary: summary.rows[0] ?? { staff_count: 0, total_points: "0", event_count: 0 },
      staff: staff.rows,
      eligibleStaff: eligibleStaff.rows,
      events: events.rows,
      scope: scope ?? "All departments",
    });
  } catch (cause) {
    console.error("[performance] load failed", cause);
    return NextResponse.json({ error: "Unable to load staff performance" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireRole(
    "admin",
    "manager",
    "finance",
    "restaurantManager",
    "hotelManager",
    "operationsManager"
  );
  if (error) return error;

  try {
    await ensurePerformanceSchema();
    const body = await request.json();

    if (body.mode === "sync") {
      const from = typeof body.from === "string" ? body.from : "1970-01-01";
      const to = typeof body.to === "string" ? body.to : "2999-12-31";
      // Idempotent attendance check invariant: pe.source_id = ar.id AND pe.source_type = 'attendance_verified'
      const syncedResult = await syncOperationalPerformanceEvents({
        from,
        to,
        actorId: session.id,
      });
      return NextResponse.json(syncedResult);
    }

    if (session.role === "finance") {
      return NextResponse.json(
        { error: "Only operational managers and administrators may record manual point adjustments" },
        { status: 403 }
      );
    }

    const points = Number(body.points);
    if (!body.staffId || !Number.isFinite(points) || points === 0 || !String(body.reason || "").trim()) {
      return NextResponse.json(
        { error: "Staff member, non-zero points, and a reason are required" },
        { status: 400 }
      );
    }

    const resolved = await resolveStaffAndUserIds(String(body.staffId));
    if (!resolved) {
      return NextResponse.json({ error: "Active staff member not found" }, { status: 404 });
    }

    const verifiedByUuid = /^[0-9a-f-]{36}$/i.test(session.id) ? session.id : null;
    const event = await query(
      `INSERT INTO performance_events (
         staff_id, user_id, source_type, points, completed_at, verified_by, verification_status, metadata
       )
       VALUES ($1::uuid, $2::uuid, 'manager_adjustment', $3::numeric, now(), $4::uuid, 'verified', $5::jsonb)
       RETURNING *`,
      [
        resolved.staffId,
        resolved.userId,
        points,
        verifiedByUuid,
        JSON.stringify({
          reason: String(body.reason).trim(),
          category: body.category || "Manager recognition",
        }),
      ]
    );

    return NextResponse.json({ event: event.rows[0] }, { status: 201 });
  } catch (cause) {
    console.error("[performance] award failed", cause);
    return NextResponse.json({ error: "Unable to save performance adjustment" }, { status: 500 });
  }
}
