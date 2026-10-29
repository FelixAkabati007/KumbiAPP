import { getBlob } from "@/lib/blob-storage";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

const managerRoles = ["admin", "manager", "operationsManager"];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pathname = request.nextUrl.searchParams.get("pathname");
  if (!pathname) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const owner = await query(`SELECT staff_id FROM leave_requests WHERE medical_report_path = $1 LIMIT 1`, [pathname]);
  if (!owner.rowCount || (owner.rows[0].staff_id !== session.id && !managerRoles.includes(session.role))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await getBlob(pathname, { access: "private" });
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.etag } });
  const body: BodyInit = result.stream
    ? (result.stream as ReadableStream<Uint8Array>)
    : result.data
    ? new Uint8Array(result.data)
    : "";
  return new NextResponse(body, { headers: { "Content-Type": result.contentType || "application/octet-stream", "Cache-Control": "private, no-cache", ETag: result.etag } });
}
