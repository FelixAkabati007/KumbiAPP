import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const visibleRoles = new Set(["admin", "manager", "restaurantManager", "kitchen"]);
    if (!visibleRoles.has(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const result = await query(
      `SELECT e.id, e.inventory_id AS inventory_item_id, e.event_type, e.quantity_before,
              e.quantity_delta AS quantity_added, e.quantity_after,
              e.purchase_packaging_price_before, e.purchase_packaging_price_after,
              e.reason, e.staff_id AS user_id, e.staff_name, e.staff_role,
              e.correlation_id, e.idempotency_key, e.created_at, i.name, i.category, i.unit, i.supplier
       FROM inventory_events e
       LEFT JOIN inventory i ON i.id = e.inventory_id
       WHERE e.event_type IN ('RESTOCK', 'RESTOCK_AND_PRICE_CHANGE')
       ORDER BY e.created_at DESC LIMIT 200`
    );
    return NextResponse.json({ logs: result.rows });
  } catch (error) {
    console.error("Restock history GET failed:", error);
    return NextResponse.json({ error: "Failed to load restock history" }, { status: 500 });
  }
}
