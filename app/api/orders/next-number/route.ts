
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET() {
  try {
    const { error } = await requirePermission("pos");
    if (error) return error;

    const accraDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Accra",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const dateStr = accraDate.replace(/-/g, "");
    const prefix = `ORD-${dateStr}-`;

    // Derive next sequential number from existing ORD-YYYYMMDD-XXXX records (schema-safe across created_at/createdat)
    const res = await query<{ max_seq: string | null; total_matching: string | null }>(
      `SELECT
         MAX(
           CASE
             WHEN SUBSTRING(ordernumber FROM '^ORD-[0-9]{8}-([0-9]+)') IS NOT NULL
             THEN SUBSTRING(ordernumber FROM '^ORD-[0-9]{8}-([0-9]+)')::bigint
             ELSE 0
           END
         )::text AS max_seq,
         COUNT(*)::text AS total_matching
       FROM kitchenorders
       WHERE ordernumber LIKE $1`,
      [`${prefix}%`],
    );

    const maxSeq = Number(res.rows[0]?.max_seq || 0);
    const totalMatching = Number(res.rows[0]?.total_matching || 0);
    const nextSeq = Math.max(maxSeq, totalMatching) + 1;

    // Format: ORD-YYYYMMDD-XXXX
    const orderNumber = `${prefix}${nextSeq.toString().padStart(4, "0")}`;

    return NextResponse.json({ orderNumber });
  } catch (error) {
    console.error("Failed to generate order number:", error);
    // Fallback
    const fallback = `ORD-${Date.now()}`;
    return NextResponse.json({ orderNumber: fallback });
  }
}
