import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || !["kitchen", "admin", "manager"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await query(`
    SELECT mi.id, mi.name, mi.description,
      COALESCE(json_agg(DISTINCT jsonb_build_object(
        'id', ri.id, 'name', i.name, 'quantity', ri.quantity, 'unit', ri.unit,
        'available', COALESCE(i.quantity, 0), 'inventoryUnit', i.unit
      )) FILTER (WHERE ri.id IS NOT NULL), '[]') AS ingredients,
      COALESCE((SELECT json_agg(jsonb_build_object(
        'id', rs.id, 'stepNumber', rs.step_number, 'instruction', rs.instruction,
        'durationMinutes', rs.duration_minutes
      ) ORDER BY rs.step_number) FROM recipe_steps rs WHERE rs.menu_item_id = mi.id), '[]') AS steps
    FROM menu_items mi
    LEFT JOIN recipe_ingredients ri ON ri.menu_item_id = mi.id
    LEFT JOIN inventory i ON i.id = ri.inventory_item_id
    WHERE mi.is_available = true
    GROUP BY mi.id
    ORDER BY mi.name ASC
  `);

  return NextResponse.json(result.rows);
}
