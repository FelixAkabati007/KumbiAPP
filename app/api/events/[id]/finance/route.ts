import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { query } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requirePermission("events");
  if (error) return error;
  const { id } = await params;
  const result = await query(
    `SELECT id, event_key, amount, direction, currency, status, source, occurred_at, payment_method, entity_type, entity_id, metadata
     FROM canonical_financial_ledger
     WHERE entity_type = 'event' AND entity_id::text = $1
     ORDER BY occurred_at DESC`,
    [id],
  );
  return NextResponse.json({ entries: result.rows });
}
