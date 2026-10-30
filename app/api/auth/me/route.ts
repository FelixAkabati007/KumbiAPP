import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { findDefaultAccountByEmail } from "@/lib/default-accounts";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null });
    }

    try {
      const result = await query(
        `SELECT id, email, name, role, avatar_url
         FROM users
         WHERE id::text = $1 OR LOWER(email) = LOWER($2)
         LIMIT 1`,
        [String(session.id), String(session.email || "")],
      );
      if (result.rows.length > 0) {
        return NextResponse.json({ user: result.rows[0] });
      }
    } catch (dbErr) {
      console.warn("Auth me DB lookup warning (using session fallback):", dbErr);
    }

    // Fallback to signed JWT session + default account metadata so valid sessions never drop out
    const defaultAcct = findDefaultAccountByEmail(session.email);
    return NextResponse.json({
      user: {
        id: session.id,
        email: session.email,
        name: defaultAcct?.name || session.email.split("@")[0] || "Authenticated User",
        role: session.role || defaultAcct?.role || "staff",
        avatar_url: null,
      },
    });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ user: null });
  }
}
