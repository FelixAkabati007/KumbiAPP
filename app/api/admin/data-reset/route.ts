import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";

const RESETTABLES = [
  "attendance_adjustments", "attendance_exceptions", "attendance_permission_requests", "attendance_records",
  "audit_logs", "booking_groups", "complaint_messages", "complaints", "event_quote_items", "event_quotes",
  "event_staff_assignments", "events", "expense_approvals", "expenses", "guest_folio_items", "guest_folios",
  "guests", "hotel_activity_ledger", "hotel_receipts", "housekeeping_tasks", "kitchen_orderitems", "kitchenorders",
  "leave_requests", "maintenance_tickets", "notifications", "notification_logs", "order_items", "orders",
  "payroll", "payroll_records", "performance_events", "refund_audit_logs", "refund_requests", "refundrequests",
  "reservation_room_changes", "reservations", "salesdata", "staff_audit_logs", "staff_schedule_assignments",
  "staff_shifts", "staff_termination_cases", "system_events", "transaction_logs", "transactions",
] as const;

const PRESERVED = ["users", "staff_profiles", "attendance_feature_permissions", "categories", "inventory", "menu_items", "recipe_ingredients", "recipe_steps", "rooms", "room_types", "settings", "system_settings", "system_state", "restaurant_profile"];

async function requireAdmin() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const result = await query<{ role: string }>("SELECT role::text FROM users WHERE id = $1 AND is_active = true", [session.id]);
  if (result.rows[0]?.role !== "admin") throw new Error("Admin access required");
  return session.id;
}

async function getResetOrder() {
  const dependencies = await query<{ child: string; parent: string }>(
    `SELECT child.relname AS child, parent.relname AS parent
     FROM pg_constraint constraint_row
     JOIN pg_class child ON child.oid = constraint_row.conrelid
     JOIN pg_class parent ON parent.oid = constraint_row.confrelid
     WHERE constraint_row.contype = 'f'
       AND child.relname = ANY($1::text[])
       AND parent.relname = ANY($1::text[])`,
    [RESETTABLES]
  );
  const childrenByParent = new Map<string, string[]>();
  for (const { child, parent } of dependencies.rows) {
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), child]);
  }
  const ordered: string[] = [];
  const visited = new Set<string>();
  const visit = (table: string) => {
    if (visited.has(table)) return;
    visited.add(table);
    for (const child of childrenByParent.get(table) ?? []) visit(child);
    ordered.push(table);
  };
  for (const table of RESETTABLES) visit(table);
  return ordered;
}

async function counts() {
  const entries = await Promise.all(RESETTABLES.map(async (table) => {
    const result = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM \"${table}\"`);
    return { table, count: Number(result.rows[0]?.count ?? 0) };
  }));
  return entries;
}

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ resetTables: await counts(), preservedTables: PRESERVED, accountsPreserved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare reset preview";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 403 });
  }
}

export async function POST(request: Request) {
  try {
    const actorId = await requireAdmin();
    const body = (await request.json().catch(() => null)) as { confirmation?: string } | null;
    if (body?.confirmation !== "RESET OPERATIONAL DATA") return NextResponse.json({ error: "Type RESET OPERATIONAL DATA to confirm" }, { status: 400 });
    const result = await transaction(async (client) => {
      const cleared: { table: string; count: number }[] = [];
      for (const table of await getResetOrder()) {
        const deleted = await client.query(`DELETE FROM \"${table}\"`);
        cleared.push({ table, count: deleted.rowCount ?? 0 });
      }
      await client.query(`INSERT INTO audit_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4)`, [actorId, "operational_data_reset", "system", JSON.stringify({ cleared })]);
      return cleared;
    });
    return NextResponse.json({ success: true, cleared: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reset operational data";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 403 });
  }
}

export const dynamic = "force-dynamic";
