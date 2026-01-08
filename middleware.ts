import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-me";

// Define role-based access control for routes
const routePermissions: Record<string, string[]> = {
  "/admin": ["admin"],
  "/settings": ["admin", "manager"],
  "/pos": ["admin", "manager", "staff"],
  "/kitchen": ["admin", "manager", "kitchen"],
  "/inventory": ["admin", "manager", "kitchen"],
  "/reports": ["admin", "manager"],
  "/menu": ["admin", "manager"],
  "/refunds": ["admin", "manager", "staff"],
  "/order-display": ["admin", "manager", "staff", "kitchen"],
  "/receipt": ["admin", "manager", "staff"],
  "/system": ["admin", "manager"],
};

// Define RBAC for API routes
const apiPermissions: Record<string, string[]> = {
  "/api/admin": ["admin"],
  "/api/settings": ["admin", "manager"],
  "/api/inventory": ["admin", "manager", "kitchen"],
  "/api/menu": ["admin", "manager", "staff"],
  "/api/refunds": ["admin", "manager", "staff"],
  "/api/orders": ["admin", "manager", "staff", "kitchen"],
  "/api/reports": ["admin", "manager"],
  "/api/system": ["admin", "manager", "staff", "kitchen"],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Handle Favicon
  if (pathname === "/favicon.ico") {
    const url = req.nextUrl.clone();
    url.pathname = "/favicon.svg";
    return NextResponse.rewrite(url);
  }

  // 2. Exclude Public API Routes
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/public")) {
    return NextResponse.next();
  }

  // 3. Check for Protected API Routes
  const protectedApiRoute = Object.keys(apiPermissions).find((route) =>
    pathname.startsWith(route)
  );

  if (protectedApiRoute) {
    const token = req.cookies.get("auth_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      const userRole = payload.role as string;
      const allowedRoles = apiPermissions[protectedApiRoute];

      if (!allowedRoles.includes(userRole)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch (error) {
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
    } catch (error) {
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
