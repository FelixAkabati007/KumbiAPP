import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/api-auth";

export async function GET() {
  const access = await requireFinanceAccess();
  if (access.error) return access.error;

  return NextResponse.json({
    role: access.session.role,
    actingAuthority: Boolean(access.actingAuthority),
    authorityLabel:
      access.actingAuthority
        ? "Acting Finance Authority"
        : access.session.role === "finance"
          ? "Finance Manager / CFO"
          : "General Manager Oversight",
  });
}
