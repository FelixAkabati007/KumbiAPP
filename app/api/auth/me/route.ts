import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null });
    }

    const result = await query(
      "SELECT id, email, name, role FROM users WHERE id = $1",
      [session.id]
    );
    if (result.rows.length === 0) return NextResponse.json({ user: null });

    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ user: null });
  }
}
