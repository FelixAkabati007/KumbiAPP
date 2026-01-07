
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const res = await query(
      "DELETE FROM signup_attempts WHERE created_at < NOW() - INTERVAL '24 hours'"
    );
    return NextResponse.json({ success: true, deleted: res.rowCount });
  } catch (error) {
    console.error("Cleanup failed:", error);
    return NextResponse.json({ success: false, error: "Cleanup failed" }, { status: 500 });
  }
}
