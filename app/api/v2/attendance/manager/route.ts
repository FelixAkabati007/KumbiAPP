import { NextResponse } from "next/server";
import { GET as legacyGET, PATCH as legacyPATCH } from "@/app/api/attendance/manager/route";

export const dynamic = "force-dynamic";

const headers = { "X-API-Version": "2", "Cache-Control": "no-store" };

export async function GET() {
  const response = await legacyGET();
  const body = await response.json();
  return NextResponse.json({ apiVersion: "2", ...body }, { status: response.status, headers });
}

export async function PATCH(request: Request) {
  const response = await legacyPATCH(request);
  const body = await response.json();
  return NextResponse.json({ apiVersion: "2", ...body }, { status: response.status, headers });
}

export function OPTIONS() {
  return NextResponse.json({ apiVersion: "2", status: "ok" }, { headers });
}

/**
 * The v2 review contract keeps the legacy manager workflow compatible while
 * giving clients an explicit version to migrate to.
 */
