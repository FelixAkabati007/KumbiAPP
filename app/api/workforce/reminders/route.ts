import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { managementRoles } from "@/lib/roles";
import {
  dispatchWorkforceShiftReminders,
  maybeDispatchDueWorkforceReminders,
} from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

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

    if (explicitStaffId) {
      const { created } = await dispatchWorkforceShiftReminders({
        referenceTimestamp: canonicalNow,
        staffOrUserId: explicitStaffId,
        fallbackRole: explicitStaffId === session.id ? session.role : undefined,
      });
      return NextResponse.json({ created });
    }

    // Evaluate caller explicitly (supports token-only fallback sessions) + throttled property-wide sweep
    const selfRes = await dispatchWorkforceShiftReminders({
      referenceTimestamp: canonicalNow,
      staffOrUserId: session.id,
      fallbackRole: session.role,
    });
    await maybeDispatchDueWorkforceReminders(canonicalNow);

    return NextResponse.json({ created: selfRes.created });
  } catch (cause) {
    console.error("[workforce] reminder creation failed", cause);
    return NextResponse.json({ error: "Unable to create shift reminder" }, { status: 500 });
  }
}
