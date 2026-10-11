import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { getCanonicalMenuLedger } from "@/lib/canonical-menu-ledger";

export async function GET() {
  const access = await requirePermission("guestFolio");
  if (access.error) return access.error;
  try {
    return NextResponse.json(await getCanonicalMenuLedger({ activeOnly: true }));
  } catch (error) {
    console.error("[v0] Canonical folio menu load failed:", error);
    return NextResponse.json({ error: "Failed to load active food and beverage items" }, { status: 500 });
  }
}
