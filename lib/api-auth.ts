import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hasPermission, type AppSection, type UserRole } from "@/lib/roles";

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
