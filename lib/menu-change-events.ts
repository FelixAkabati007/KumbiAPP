import { query, type DatabaseClient } from "@/lib/db";

type MenuChangeInput = { menuItemId: string; eventType: string; before: Record<string, unknown>; after: Record<string, unknown>; changedFields: string[]; reason?: string | null; session: { id: string; name?: string | null; email?: string | null; role: string }; correlationId?: string };

export async function recordMenuChange(input: MenuChangeInput, client?: DatabaseClient) {
  const { menuItemId, eventType, before, after, changedFields, reason, session, correlationId = crypto.randomUUID() } = input;
  if (client) {
    await client.query(`INSERT INTO menu_change_events (menu_item_id, event_type, before_snapshot, after_snapshot, changed_fields, reason, staff_id, staff_name, staff_role, correlation_id, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (idempotency_key) DO NOTHING`, [menuItemId, eventType, JSON.stringify(before), JSON.stringify(after), JSON.stringify(changedFields), reason || null, session.id, session.name || session.email || session.id, session.role, correlationId, correlationId]);
    return;
  }
  await query(`INSERT INTO menu_change_events (menu_item_id, event_type, before_snapshot, after_snapshot, changed_fields, reason, staff_id, staff_name, staff_role, correlation_id, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (idempotency_key) DO NOTHING`, [menuItemId, eventType, JSON.stringify(before), JSON.stringify(after), JSON.stringify(changedFields), reason || null, session.id, session.name || session.email || session.id, session.role, correlationId, correlationId]);
}
