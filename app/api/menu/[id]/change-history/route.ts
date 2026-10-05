import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

const MANAGEMENT_ROLES = ["admin", "manager", "restaurantManager"] as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireRole(...MANAGEMENT_ROLES);
  if (access.error) return access.error;
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);

  try {
    const result = await query(`SELECT e.id, e.event_type, e.before_snapshot, e.after_snapshot, e.changed_fields, e.reason, e.staff_id, e.staff_name, e.staff_role, e.correlation_id, e.idempotency_key, e.created_at, mi.name AS menu_item_name FROM menu_change_events e JOIN menu_items mi ON mi.id = e.menu_item_id WHERE e.menu_item_id = $1 ORDER BY e.created_at DESC LIMIT $2`, [id, limit]);
    if (format === "xlsx") {
      const rows = result.rows.map((event) => ({
        "Menu item": event.menu_item_name,
        "Event type": event.event_type,
        "Changed fields": JSON.stringify(event.changed_fields),
        "Before": JSON.stringify(event.before_snapshot),
        "After": JSON.stringify(event.after_snapshot),
        Reason: event.reason || "",
        "Staff ID": event.staff_id,
        "Staff name": event.staff_name,
        "Staff role": event.staff_role,
        "Correlation ID": event.correlation_id,
        "Idempotency key": event.idempotency_key,
        Timestamp: new Date(event.created_at).toISOString(),
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Menu Changes");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="menu-change-history-${id}.xlsx"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ events: result.rows });
  } catch (error) {
    console.error("[menu-change-history] failed", error);
    return NextResponse.json({ error: "Unable to load menu change history" }, { status: 500 });
  }
}
