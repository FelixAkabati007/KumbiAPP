import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { hasPermission, isAdmin, type AppSection, type UserRole } from "@/lib/roles";

export type ApiSession = {
  id: string;
  email: string;
  role: UserRole;
};

type AuthResult =
  | { session: ApiSession; error: null }
  | { session: null; error: NextResponse };

/**
 * Verifies the request has a valid session cookie. Use this on every route
 * that reads or writes app data — routes with no session check at all are
 * reachable by anyone with the URL, logged in or not, regardless of what
 * the client-side UI shows or hides.
 */
export async function requireSession(): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session: session as ApiSession, error: null };
}

/**
 * Verifies the request has a valid session AND that the session's role is
 * permitted for the given app section (per lib/roles.ts). Use this on
 * routes tied to a specific role-gated feature (rooms, refunds, kitchen,
 * etc.) so the server enforces the same rule the UI's RoleGuard shows.
 */
export async function requirePermission(
  section: AppSection
): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!hasPermission(session.role as UserRole, section)) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Forbidden: you do not have access to this feature" },
        { status: 403 }
      ),
    };
  }
  return { session: session as ApiSession, error: null };
}

/**
 * Verifies the request has a valid session AND that the session's role is
 * one of the allowed roles. Use this for admin/manager-only operations
 * that aren't tied to a single AppSection (e.g. staff management).
 */
export async function requireAdmin(): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdmin(session.role)) {
    return { session: null, error: NextResponse.json({ error: "Forbidden: administrators only" }, { status: 403 }) };
  }
  return { session: session as ApiSession, error: null };
}

export type ManagerialArea = "hotel" | "finance" | "restaurant" | "operations";

export type ManagerialAccess = {
  session: ApiSession;
  actingAuthority: boolean;
  authorityRole: UserRole;
  coveredRole: UserRole;
};

export const managerialAreaRoles: Record<ManagerialArea, UserRole> = {
  hotel: "hotelManager",
  finance: "finance",
  restaurant: "restaurantManager",
  operations: "operationsManager",
};

/**
 * Returns the effective authority for a business area. A General Manager
 * automatically covers an area only while its dedicated manager account is
 * not active; no placeholder account or stored-role mutation is created.
 */
export async function getManagerialAccess(area: ManagerialArea): Promise<
  | { access: ManagerialAccess; error: null }
  | { access: null; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { access: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const coveredRole = managerialAreaRoles[area];
  const hasDedicatedManager = Boolean(
    (await query(
      `SELECT EXISTS (SELECT 1 FROM users WHERE role = $1 AND is_active = true) AS has_manager`,
      [coveredRole],
    )).rows[0]?.has_manager,
  );

  if (session.role === "admin") {
    return {
      access: { session: session as ApiSession, actingAuthority: false, authorityRole: "admin", coveredRole },
      error: null,
    };
  }

  if (session.role === coveredRole) {
    return {
      access: { session: session as ApiSession, actingAuthority: false, authorityRole: coveredRole, coveredRole },
      error: null,
    };
  }

  if (session.role === "manager" && !hasDedicatedManager) {
    return {
      access: { session: session as ApiSession, actingAuthority: true, authorityRole: "manager", coveredRole },
      error: null,
    };
  }

  return {
    access: null,
    error: NextResponse.json({ error: `Forbidden: ${area} access is restricted` }, { status: 403 }),
  };
}

export async function requireFinanceAccess(): Promise<AuthResult & { actingAuthority?: boolean }> {
  const result = await getManagerialAccess("finance");
  if (result.error) return { session: null, error: result.error };
  return { session: result.access.session, error: null, actingAuthority: result.access.actingAuthority };
}

export async function requireRole(
  ...roles: UserRole[]
): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!roles.includes(session.role as UserRole)) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Forbidden: insufficient role" },
        { status: 403 }
      ),
    };
  }
  return { session: session as ApiSession, error: null };
}
