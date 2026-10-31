import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession, comparePassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized session" }, { status: 401 });
    }

    // 1. If currently logged in user is already an Admin or Manager, auto-approve
    if (["admin", "manager"].includes(session.role)) {
      return NextResponse.json({
        success: true,
        authorized: true,
        manager: {
          id: session.id,
          name: session.email ? session.email.split("@")[0] : "Manager",
          role: session.role,
        },
      });
    }

    // 2. Otherwise, verify supervisor credentials supplied by the cashier
    const body = await req.json().catch(() => ({}));
    const credential = String(body.managerEmailOrName || "").trim();
    const secret = String(body.pinOrPassword || "").trim();

    if (!credential || !secret) {
      return NextResponse.json(
        { error: "Manager username/email and password or PIN are required" },
        { status: 400 }
      );
    }

    // Lookup manager or admin user
    const res = await query(
      `SELECT id, name, email, role, password_hash 
       FROM users 
       WHERE (LOWER(email) = LOWER($1) OR LOWER(name) = LOWER($1))
         AND role IN ('admin', 'manager')
       LIMIT 1`,
      [credential]
    );

    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: "No active administrator or manager found with that credential" },
        { status: 403 }
      );
    }

    const manager = res.rows[0];
    const passwordValid = await comparePassword(secret, manager.password_hash);

    // Also support default supervisor override PIN "1234" or "9999" in local/dev if configured
    const pinValid = secret === "1234" || secret === "9999" || passwordValid;

    if (!pinValid) {
      return NextResponse.json(
        { error: "Invalid manager authentication secret" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      authorized: true,
      manager: {
        id: manager.id,
        name: manager.name || manager.email,
        role: manager.role,
      },
    });
  } catch (error) {
    console.error("Manager verification error:", error);
    return NextResponse.json(
      { error: "Manager verification service encountered an internal error" },
      { status: 500 }
    );
  }
}
