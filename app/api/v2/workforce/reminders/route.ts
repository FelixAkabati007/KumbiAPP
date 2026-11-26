import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { managementRoles } from "@/lib/roles";
import { dispatchWorkforceShiftReminders } from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

/** Versioned shift reminder endpoint. The legacy route remains available. */
export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const body = await request.json().catch(() => ({}));
    const staffId = typeof body.staffId === "string" && body.staffId.trim() ? body.staffId.trim() : session.id;
    if (staffId !== session.id && !managementRoles.includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const canonicalNow = await getCanonicalTransactionTimestamp();
    const { created } = await dispatchWorkforceShiftReminders({
      referenceTimestamp: canonicalNow,
      staffOrUserId: staffId,
      fallbackRole: staffId === session.id ? session.role : undefined,
    });

    return NextResponse.json(
      { apiVersion: "2", created },
      { headers: { "X-API-Version": "2", "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error("[v2/workforce] reminder creation failed", cause);
    return NextResponse.json({ error: "Unable to create shift reminder" }, { status: 500 });
  }
}

export function OPTIONS() {
  return NextResponse.json({ apiVersion: "2", status: "ok" });
}
