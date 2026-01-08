import { NextResponse } from "next/server";
import { getSystemEvents } from "@/lib/sync";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");

    const result = await getSystemEvents(since || undefined);

    return NextResponse.json({
      events: result.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
