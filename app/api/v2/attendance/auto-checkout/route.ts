import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { runScheduledAutoCheckout } from "@/lib/attendance-service";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  const cronAuthorized = Boolean(process.env.CRON_SECRET) && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const { session, error } = cronAuthorized ? { session: { id: "cron", role: "admin" }, error: null } : await requireRole("admin", "manager", "operationsManager");
  if (error) return error;

  const canonicalNow = await getCanonicalTransactionTimestamp();
  try {
    const { updated, records } = await runScheduledAutoCheckout(canonicalNow);
    return NextResponse.json(
      { apiVersion: "2", updated, records, actorId: session.id },
      { headers: { "X-API-Version": "2", "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error("[attendance] automatic checkout failed", cause);
    return NextResponse.json({ apiVersion: "2", error: "Unable to complete scheduled checkout" }, { status: 500, headers: { "X-API-Version": "2" } });
  }
}

export function OPTIONS() {
  return NextResponse.json({ apiVersion: "2", status: "ok" }, { headers: { "X-API-Version": "2" } });
}
