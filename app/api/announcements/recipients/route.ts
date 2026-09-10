import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { UserRole } from "@/lib/roles";

const ANNOUNCEMENT_ROLES: UserRole[] = ["admin", "manager", "restaurantManager", "hotelManager", "finance", "operationsManager"];
const ROLE_RANK: Record<string, number> = { admin: 6, manager: 5, restaurantManager: 4, hotelManager: 4, finance: 4, operationsManager: 4, staff: 1, kitchen: 1, frontDesk: 1, housekeeping: 1 };

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ANNOUNCEMENT_ROLES.includes(session.role as UserRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const role = new URL(request.url).searchParams.get("role");
  if (!role || !(role in ROLE_RANK)) return NextResponse.json({ users: [] });
  if ((ROLE_RANK[role] ?? 0) > (ROLE_RANK[session.role] ?? 0)) return NextResponse.json({ error: "You cannot target a higher role" }, { status: 403 });
  const result = await query(`SELECT id, name, email, role FROM users WHERE is_active = true AND role::text = $1 ORDER BY name ASC, email ASC LIMIT 200`, [role]);
  return NextResponse.json({ users: result.rows });
}
