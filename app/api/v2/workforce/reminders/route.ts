import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { managementRoles } from "@/lib/roles";
import {
  dispatchWorkforceShiftReminders,
  maybeDispatchDueWorkforceReminders,
} from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

/** Versioned shift reminder endpoint. The legacy route remains available. */
export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const body = await request.json().catch(() => ({}));
    const explicitStaffId =
      typeof body.staffId === "string" && body.staffId.trim() ? body.staffId.trim() : null;

    if (explicitStaffId && explicitStaffId !== session.id && !managementRoles.includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const canonicalNow = await getCanonicalTransactionTimestamp();

    let created = 0;
    if (explicitStaffId) {
      const res = await dispatchWorkforceShiftReminders({
        referenceTimestamp: canonicalNow,
        staffOrUserId: explicitStaffId,
        fallbackRole: explicitStaffId === session.id ? session.role : undefined,
      });
      created = res.created;
    } else {
      const selfRes = await dispatchWorkforceShiftReminders({
        referenceTimestamp: canonicalNow,
        staffOrUserId: session.id,
        fallbackRole: session.role,
      });
      created = selfRes.created;
      await maybeDispatchDueWorkforceReminders(canonicalNow);
    }

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
