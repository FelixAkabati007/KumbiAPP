import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { publishRealtime } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLOSING_ROLES = ["manager", "restaurantManager"] as const;

export async function POST() {
  const { session, error } = await requireRole(...CLOSING_ROLES);
  if (error) return error;

  try {
    const result = await query(
      `UPDATE public.kitchenorders
       SET kitchen_closed_at = NOW(), kitchen_closed_by = $1, updated_at = NOW()
       WHERE kitchen_closed_at IS NULL
       RETURNING id`,
      [session.id],
    );

    await publishRealtime("orders.updated", "kitchen-day-closed");

    return NextResponse.json({
      success: true,
      closedOrders: result.rowCount ?? 0,
      closedByRole: session.role,
    });
  } catch (error) {
    console.error("Failed to close kitchen day:", error);
    return NextResponse.json({ error: "Failed to close kitchen day" }, { status: 500 });
  }
}

export async function GET() {
  const { session, error } = await requireRole(...CLOSING_ROLES);
  if (error) return error;

  const result = await query(
    `SELECT COUNT(*)::int AS active_orders FROM public.kitchenorders WHERE kitchen_closed_at IS NULL`,
  );

  return NextResponse.json({ activeOrders: result.rows[0]?.active_orders ?? 0, role: session.role });
}
