import { NextResponse } from "next/server";
import { z } from "zod";
import { query, transaction } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/api-auth";

const sourceSchema = z.object({
  transactionId: z.string().trim().min(1),
  source: z.enum(["hotel", "restaurant", "event", "shared"]),
  reason: z.string().trim().min(10).max(500),
});

export async function GET(request: Request) {
  const access = await requireFinanceAccess();
  if (access.error) return access.error;
  const params = new URL(request.url).searchParams;
  const resolver = params.get("resolver")?.trim() || null;
  const source = params.get("source")?.trim() || null;
  const from = params.get("from")?.trim() || null;
  const to = params.get("to")?.trim() || null;
  try {
    const result = await query(`SELECT a.entity_id AS transaction_id, a.user_id, COALESCE(u.name, u.email, a.user_id::text) AS resolver, a.details, a.created_at FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.action = 'RESOLVE_FINANCE_CLASSIFICATION' AND ($1::text IS NULL OR a.user_id::text = $1 OR COALESCE(u.name, u.email, '') ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR a.details->>'assignedSource' = $2) AND ($3::timestamptz IS NULL OR a.created_at >= $3::timestamptz) AND ($4::timestamptz IS NULL OR a.created_at < ($4::date + INTERVAL '1 day')) ORDER BY a.created_at DESC LIMIT 100`, [resolver, source, from, to]);
    return NextResponse.json(result.rows.map((row) => ({ transactionId: row.transaction_id, resolver: row.resolver, assignedSource: row.details?.assignedSource ?? null, originalSource: row.details?.originalSource ?? null, reason: row.details?.reason ?? "", resolvedAt: row.created_at })));
  } catch (error) {
    console.error("[v0] Failed to load finance classification history", error);
    return NextResponse.json({ error: "Failed to load classification history" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const access = await requireFinanceAccess();
  if (access.error) return access.error;
  if (access.session.role !== "finance" && !access.actingAuthority) {
    return NextResponse.json({ error: "Only Finance users can resolve classification exceptions" }, { status: 403 });
  }

  const parsed = sourceSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A valid source and a reason of at least 10 characters are required" }, { status: 400 });
  const { transactionId, source, reason } = parsed.data;

  try {
    const result = await transaction(async (client) => {
      const current = await client.query(`SELECT transaction_id, metadata FROM transaction_logs WHERE transaction_id = $1 FOR UPDATE`, [transactionId]);
      if (!current.rows[0]) return null;
      const metadata = current.rows[0].metadata && typeof current.rows[0].metadata === "object" ? current.rows[0].metadata : {};
      const nextMetadata = {
        ...metadata,
        source,
        classificationResolvedAt: new Date().toISOString(),
        classificationResolvedBy: access.session.id,
        classificationReason: reason,
        originalSource: typeof metadata.originalSource === "string" ? metadata.originalSource : typeof metadata.source === "string" ? metadata.source : null,
      };
      await client.query(`UPDATE transaction_logs SET metadata = $1::jsonb WHERE transaction_id = $2`, [JSON.stringify(nextMetadata), transactionId]);
      await client.query(`INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES ($1, 'RESOLVE_FINANCE_CLASSIFICATION', 'TRANSACTION', $2, $3::jsonb)`, [access.session.id, transactionId, JSON.stringify({ transactionId, assignedSource: source, reason, originalSource: nextMetadata.originalSource })]);
      return { transactionId, source, reason };
    });
    if (!result) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[v0] Failed to resolve finance classification", error);
    return NextResponse.json({ error: "Failed to resolve finance classification" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
