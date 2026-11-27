import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-logger";
import { updateSystemState } from "@/lib/system-sync";
import { publishRealtime } from "@/lib/realtime";
import { canManageFeatureToggles } from "@/lib/roles";

export const dynamic = "force-dynamic";

const TOGGLE_KEYS = ["kitchen_display", "order_board", "housekeeping_advanced"] as const;
type ToggleKey = (typeof TOGGLE_KEYS)[number];

function isToggleKey(value: unknown): value is ToggleKey {
  return typeof value === "string" && TOGGLE_KEYS.includes(value as ToggleKey);
}

let featureTogglesEnsured = false;

async function ensureFeatureTogglesSchema(): Promise<void> {
  if (featureTogglesEnsured) return;
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS feature_toggles (
         key VARCHAR(100) PRIMARY KEY,
         enabled BOOLEAN NOT NULL DEFAULT true,
         updated_by_id VARCHAR(255),
         updated_by_name VARCHAR(255),
         updated_by_role VARCHAR(100),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`
    );
    await query(
      `ALTER TABLE feature_toggles ALTER COLUMN updated_by_id TYPE VARCHAR(255) USING updated_by_id::varchar`
    ).catch(() => undefined);

    for (const key of TOGGLE_KEYS) {
      await query(
        `INSERT INTO feature_toggles (key, enabled)
         VALUES ($1::varchar, true)
         ON CONFLICT (key) DO NOTHING`,
        [key]
      ).catch(() => undefined);
    }
    featureTogglesEnsured = true;
  } catch {
    // Non-fatal in mocked environments
  }
}

// GET - Any authenticated user (Admin, Manager, and all Restaurant/Hotel roles)
// can read current toggle states so pages and dashboard cards across all roles
// stay 100% synchronized with Admin controls.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureFeatureTogglesSchema();

    const result = await query<{
      key: string;
      enabled: boolean;
      updated_by_name?: string | null;
      updated_by_role?: string | null;
      updated_at?: string | null;
    }>(
      `SELECT key, enabled, updated_by_name, updated_by_role, updated_at
       FROM feature_toggles`
    );

    const toggles: Record<string, boolean> = {};
    for (const key of TOGGLE_KEYS) {
      toggles[key] = true;
    }
    for (const row of result.rows) {
      toggles[String(row.key)] = Boolean(row.enabled);
    }

    return NextResponse.json(
      { toggles, rows: result.rows },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Error fetching feature toggles:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature toggles" },
      { status: 500 }
    );
  }
}

// PATCH - Only admins (or General Manager) may flip a toggle. Every change is
// persisted in Neon, audit-logged, and broadcast in real time to all connected roles.
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageFeatureToggles(session.role) && session.role !== "manager") {
      return NextResponse.json(
        { error: "Forbidden: only admins and managers can change feature toggles" },
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

    await ensureFeatureTogglesSchema();

    const currentResult = await query<{ enabled: boolean }>(
      `SELECT enabled FROM feature_toggles WHERE key = $1::varchar`,
      [key]
    );
    const previousEnabled = currentResult.rows[0]?.enabled ?? true;

    const userResult = await query<{ name: string | null }>(
      `SELECT name FROM users WHERE id::text = $1::text LIMIT 1`,
      [session.id]
    ).catch(() => ({ rows: [] as Array<{ name: string | null }> }));
    const sessionWithOptionalName = session as typeof session & { name?: string | null };
    const actorName = userResult.rows[0]?.name || sessionWithOptionalName.name || session.email;

    await query(
      `INSERT INTO feature_toggles (key, enabled, updated_by_id, updated_by_name, updated_by_role, updated_at)
       VALUES ($1::varchar, $2::boolean, $3::varchar, $4::varchar, $5::varchar, NOW())
       ON CONFLICT (key) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         updated_by_id = EXCLUDED.updated_by_id,
         updated_by_name = EXCLUDED.updated_by_name,
         updated_by_role = EXCLUDED.updated_by_role,
         updated_at = NOW()`,
      [key, enabled, session.id, actorName, session.role]
    );

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

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
    await publishRealtime("feature_toggles.updated", key);

    return NextResponse.json({ key, enabled });
  } catch (error) {
    console.error("Error updating feature toggle:", error);
    return NextResponse.json(
      { error: "Failed to update feature toggle" },
      { status: 500 }
    );
  }
}
