import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-logger";
import { updateSystemState } from "@/lib/system-sync";

const TOGGLE_KEYS = ["kitchen_display", "order_board"] as const;
type ToggleKey = (typeof TOGGLE_KEYS)[number];

function isToggleKey(value: unknown): value is ToggleKey {
  return typeof value === "string" && TOGGLE_KEYS.includes(value as ToggleKey);
}

// GET - Any authenticated user can read the current toggle states so pages
// and dashboard cards across the app can enforce them consistently.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await query(
      `SELECT key, enabled, updated_by_name, updated_by_role, updated_at
       FROM feature_toggles`
    );

    const toggles: Record<string, boolean> = {};
    for (const key of TOGGLE_KEYS) {
      toggles[key] = true; // default fallback if row is somehow missing
    }
    for (const row of result.rows) {
      toggles[row.key as string] = row.enabled as boolean;
    }

    return NextResponse.json({ toggles, rows: result.rows });
  } catch (error) {
    console.error("Error fetching feature toggles:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature toggles" },
      { status: 500 }
    );
  }
}

// PATCH - Only admin/manager may flip a toggle. Every change is audit
// logged with the actor's identity and the before/after state.
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "admin" && session.role !== "manager") {
      return NextResponse.json(
        { error: "Forbidden: only admins or managers can change feature toggles" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { key, enabled } = body as { key?: unknown; enabled?: unknown };

    if (!isToggleKey(key)) {
      return NextResponse.json({ error: "Invalid toggle key" }, { status: 400 });
    }
    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "'enabled' must be a boolean" },
        { status: 400 }
      );
    }

    const currentResult = await query(
      `SELECT enabled FROM feature_toggles WHERE key = $1`,
      [key]
    );
    const previousEnabled = currentResult.rows[0]?.enabled ?? true;

    // Fetch actor name for the audit trail
    const userResult = await query(`SELECT name FROM users WHERE id = $1`, [
      session.id,
    ]);
    const actorName = userResult.rows[0]?.name || session.email;

    await query(
      `INSERT INTO feature_toggles (key, enabled, updated_by_id, updated_by_name, updated_by_role, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (key) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_by_role = EXCLUDED.updated_by_role,
         updated_at = NOW()`,
      [key, enabled, session.id, actorName, session.role]
    );

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

    // The toggle write above already succeeded, which is what matters for
    // the feature itself. Audit logging is important but secondary — a
    // logging failure should never roll back or block the actual toggle,
    // so it's wrapped separately and only logged to the server console.
    try {
      await createAuditLog({
        actionType: "feature_toggle_changed",
        actorId: session.id,
        actorName,
        actorRole: session.role,
        changeDetails: {
          toggleKey: key,
          from: previousEnabled,
          to: enabled,
        },
        ipAddress,
        status: "completed",
      });
    } catch (auditError) {
      console.error("Feature toggle audit log failed (toggle still applied):", auditError);
    }

    await updateSystemState("feature_toggles");

    return NextResponse.json({ key, enabled });
  } catch (error) {
    console.error("Error updating feature toggle:", error);
    return NextResponse.json(
      { error: "Failed to update feature toggle" },
      { status: 500 }
    );
  }
}
