import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-me";

// Define role-based access control for routes.
// NOTE: Object key order matters — more specific paths must be listed
// before broader prefixes so the first `startsWith` match wins.
const routePermissions: Record<string, string[]> = {
  "/admin": ["admin"],
  // Sign-up is an account-creation surface and must be restricted to admins.
  "/sign-up": ["admin"],
  "/signup": ["admin"],
  "/settings": ["admin", "manager"],
  "/pos": ["admin", "manager", "staff", "kitchen"],
  "/kitchen": ["admin", "manager", "kitchen"],
  "/inventory": ["admin", "manager", "kitchen"],
  "/reports": ["admin", "manager", "finance"],
  "/finance": ["admin", "manager", "finance"],
  "/menu": ["admin", "manager"],
  "/refunds": ["admin", "manager", "staff", "finance"],
  "/order-display": ["admin", "manager", "staff", "kitchen"],
  "/receipt": ["admin", "manager", "staff", "kitchen", "finance", "frontDesk"],
  "/payments": ["admin", "manager", "finance"],
  "/system": ["admin", "manager"],
  "/operations": ["admin", "manager", "operationsManager"],
  // Hospitality module routes
  "/hotels/rooms": ["admin", "manager", "frontDesk", "housekeeping"],
  "/hotels/reservations": ["admin", "manager", "frontDesk"],
  "/hotels/check-in": ["admin", "manager", "frontDesk"],
  "/hotels/check-out": ["admin", "manager", "frontDesk"],
  "/hotels/housekeeping": ["admin", "manager", "frontDesk", "housekeeping"],
  "/hotels/maintenance": ["admin", "manager", "operationsManager", "frontDesk", "housekeeping"],
};

// Define RBAC for API routes.
// NOTE: Object key order matters — more specific paths must be listed
// before broader prefixes so the first `startsWith` match wins.
const apiPermissions: Record<string, string[]> = {
  // Managers may submit staff-modification approval requests; the route
  // itself enforces the finer-grained GET (admin) vs POST (manager) split.
  "/api/admin/staff-approvals": ["admin", "manager"],
  "/api/admin": ["admin"],
  "/api/inventory": ["admin", "manager", "kitchen"],
  "/api/menu": ["admin", "manager", "staff", "kitchen"],
  "/api/refunds": ["admin", "manager", "staff", "finance"],
  "/api/orders": ["admin", "manager", "staff", "kitchen"],
  "/api/receipts": ["admin", "manager", "staff", "finance", "frontDesk"],
  "/api/reports": ["admin", "manager", "finance"],
  "/api/finance": ["admin", "manager", "finance"],
  "/api/payroll": ["admin", "manager", "finance"],
  "/api/transactions": ["admin", "manager", "finance"],
  "/api/system": ["admin", "manager", "staff", "kitchen"],
  // Hospitality module API routes
  "/api/hotels/rooms": ["admin", "manager", "frontDesk", "housekeeping"],
  "/api/hotels/room-types": ["admin", "manager", "frontDesk"],
  "/api/hotels/reservations": ["admin", "manager", "frontDesk"],
  "/api/hotels/check-in": ["admin", "manager", "frontDesk"],
  "/api/hotels/check-out": ["admin", "manager", "frontDesk"],
  "/api/hotels/checked-in": ["admin", "manager", "frontDesk"],
  "/api/hotels/folios": ["admin", "manager", "frontDesk"],
  "/api/hotels/guests": ["admin", "manager", "frontDesk"],
  "/api/hotels/housekeeping": ["admin", "manager", "frontDesk", "housekeeping"],
  "/api/hotels/maintenance": ["admin", "manager", "operationsManager", "frontDesk", "housekeeping"],
  // Note: "/api/settings" is intentionally NOT gated here. GET is public so
  // the logo/branding can render on unauthenticated screens (login, sign-up);
  // the route handler itself enforces admin-only writes (POST).
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Handle Favicon
  if (pathname === "/favicon.ico") {
    const url = req.nextUrl.clone();
    url.pathname = "/favicon.svg";
    return NextResponse.rewrite(url);
  }

  // 2. Exclude Public API Routes.
  // Signup is the exception: account creation must be admin-gated, so it
  // falls through to the protected API route check below instead of being
  // treated as a public auth endpoint like login/logout.
  if (
    (pathname.startsWith("/api/auth") && pathname !== "/api/auth/signup") ||
    pathname.startsWith("/api/public")
  ) {
    return NextResponse.next();
  }

  // 3. Check for Protected API Routes
  const protectedApiRoute =
    pathname === "/api/auth/signup"
      ? "/api/auth/signup"
      : Object.keys(apiPermissions).find((route) => pathname.startsWith(route));

  const apiAllowedRoles =
    pathname === "/api/auth/signup" ? ["admin"] : apiPermissions[protectedApiRoute || ""];

  if (protectedApiRoute) {
    const token = req.cookies.get("auth_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      const userRole = payload.role as string;

      if (!apiAllowedRoles.includes(userRole)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 4. Check for Protected Page Routes
  // Find if the current path matches any protected route prefix
  const protectedRoute = Object.keys(routePermissions).find((route) =>
    pathname.startsWith(route)
  );

  if (protectedRoute) {
    const token = req.cookies.get("auth_token")?.value;

    if (!token) {
      // Redirect to login if no token
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }

    try {
      // Verify JWT
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      const userRole = payload.role as string;
      const allowedRoles = routePermissions[protectedRoute];

      // Check Role Access
      if (!allowedRoles.includes(userRole)) {
        // Redirect to unauthorized if role not allowed
        const url = req.nextUrl.clone();
        url.pathname = "/unauthorized";
        return NextResponse.redirect(url);
      }
    } catch {
      // Token invalid or expired
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
