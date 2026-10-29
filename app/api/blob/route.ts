import { NextRequest, NextResponse } from "next/server";
import { getDatabaseBlob } from "@/lib/blob-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get("pathname");
    if (!pathname) {
      return NextResponse.json({ error: "Missing pathname parameter" }, { status: 400 });
    }

    const blob = await getDatabaseBlob(pathname);
    if (!blob || !blob.data) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === blob.etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: blob.etag } });
    }

    return new NextResponse(new Uint8Array(blob.data), {
      status: 200,
      headers: {
        "Content-Type": blob.contentType || "application/octet-stream",
        "Content-Length": String(blob.size),
        ETag: blob.etag,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving blob from database:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
