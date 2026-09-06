import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

const RESTOCK_ROLES = new Set(["admin", "generalManager", "restaurantManager", "chef", "kitchen"]);

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await query(
      "SELECT role, job_classification, position FROM users LEFT JOIN staff_profiles ON staff_profiles.user_id = users.id WHERE users.id = $1 LIMIT 1",
      [session.id]
    );
    const role = profile.rows[0]?.role || profile.rows[0]?.job_classification || profile.rows[0]?.position;
    if (!RESTOCK_ROLES.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const result = await query(
      `SELECT id, user_id, entity_id AS inventory_item_id, details, created_at
       FROM audit_logs
       WHERE action IN ('RESTOCK_INVENTORY', 'RESTOCK_BASELINE') AND entity_type = 'INVENTORY'
       ORDER BY created_at DESC LIMIT 200`
    );
    return NextResponse.json({ logs: result.rows });
  } catch (error) {
    console.error("Restock history GET failed:", error);
    return NextResponse.json({ error: "Failed to load restock history" }, { status: 500 });
  }
}
