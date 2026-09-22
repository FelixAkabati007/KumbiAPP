import { NextResponse } from "next/server";
import { getAuthoritativeNow, getPropertyTimeZone } from "@/lib/property-time";

export async function GET() {
  const now = await getAuthoritativeNow();
  return NextResponse.json({
    iso: now.toISOString(),
    timeZone: getPropertyTimeZone(),
    source: "aisense-public-datetime-api",
  }, { headers: { "Cache-Control": "no-store" } });
}
