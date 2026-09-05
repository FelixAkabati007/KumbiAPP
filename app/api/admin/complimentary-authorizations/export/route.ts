import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await query(
      `SELECT a.id, a.guest_name, a.scope, a.approved_amount, a.valid_from, a.valid_until, a.reason, a.ceo_reference, a.status, a.created_at,
        COALESCE(SUM(u.amount_used), 0) AS used_amount,
        a.approved_amount - COALESCE(SUM(u.amount_used), 0) AS remaining_amount,
        COUNT(u.id)::int AS usage_count
       FROM public.complimentary_authorizations a
       LEFT JOIN public.complimentary_authorization_usage u ON u.authorization_id = a.id
       GROUP BY a.id ORDER BY a.created_at DESC LIMIT 1000`,
    );
    const headers = ["ID", "Guest", "Scope", "Approved Amount (GHS)", "Used Amount (GHS)", "Remaining (GHS)", "Usage Count", "Valid From", "Valid Until", "Reason", "CEO Reference", "Status", "Created At"];
    const rows = result.rows.map((row) => [row.id, row.guest_name, row.scope, row.approved_amount, row.used_amount, row.remaining_amount, row.usage_count, row.valid_from, row.valid_until, row.reason, row.ceo_reference, row.status, row.created_at].map(csvCell).join(","));
    const csv = [headers.map(csvCell).join(","), ...rows].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="vip-complimentary-authorizations.csv"' } });
  } catch (error) {
    console.error("Failed to export complimentary authorizations:", error);
    return NextResponse.json({ error: "Failed to export authorizations" }, { status: 500 });
  }
}
