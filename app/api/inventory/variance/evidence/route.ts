import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const access = await requireRole("admin", "manager", "restaurantManager");
  if (access.error) return access.error;
  const pathname = request.nextUrl.searchParams.get("pathname");
  if (!pathname || !pathname.startsWith("inventory-evidence/")) return NextResponse.json({ error: "Invalid evidence reference" }, { status: 400 });
  try {
    const allowed = await query("SELECT 1 FROM audit_logs WHERE action = 'SUBMIT_INVENTORY_VARIANCE' AND details->>'evidencePathname' = $1 LIMIT 1", [pathname]);
    if (!allowed.rows[0]) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    const result = await get(pathname, { access: "private", ifNoneMatch: request.headers.get("if-none-match") ?? undefined });
    if (!result) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag } });
    return new NextResponse(result.stream, { headers: { "Content-Type": result.blob.contentType, ETag: result.blob.etag, "Cache-Control": "private, no-cache" } });
  } catch {
    return NextResponse.json({ error: "Failed to load evidence" }, { status: 500 });
  }
}
