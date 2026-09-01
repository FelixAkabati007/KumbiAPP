import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET() {
  try {
    const { error } = await requirePermission("housekeeping");
    if (error) return error;

    const result = await query(
      `SELECT u.id, u.name, u.email, u.role
       FROM users u
       WHERE u.role = 'housekeeping' AND u.is_active = true
       ORDER BY u.name ASC`,
    );

    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Error fetching housekeeping staff:", error);
    return NextResponse.json({ error: "Failed to fetch housekeeping staff" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

// Prevent accidental caching of the role-filtered directory.
void dynamic;
