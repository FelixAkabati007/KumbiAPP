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
  "/pos": ["admin", "manager", "restaurantManager", "staff", "kitchen"],
  "/kitchen": ["admin", "manager", "restaurantManager", "kitchen"],
  "/inventory": ["admin", "manager", "kitchen"],
  "/reports": ["admin", "manager", "finance"],
  "/finance": ["admin", "manager", "finance"],
  "/expenses": ["admin", "manager", "finance"],
  "/menu": ["admin", "manager"],
  "/refunds": ["admin", "manager", "staff", "finance"],
  "/order-display": ["admin", "manager", "staff", "kitchen"],
  "/receipt": ["admin", "manager", "staff", "kitchen", "finance", "frontDesk"],
  "/payments": ["admin", "manager", "finance"],
  "/system": ["admin", "manager"],
  "/operations": ["admin", "manager", "operationsManager"],
  "/complaints": ["admin", "manager", "finance", "staff", "kitchen", "frontDesk", "housekeeping", "operationsManager"],
  // Hospitality module routes
  "/hotels/rooms": ["admin", "manager", "hotelManager", "frontDesk", "housekeeping"],
  "/hotels/reservations": ["admin", "manager", "hotelManager", "frontDesk"],
  "/hotels/check-in": ["admin", "manager", "hotelManager", "frontDesk"],
  "/hotels/check-out": ["admin", "manager", "hotelManager", "frontDesk"],
  "/hotels/housekeeping": ["admin", "manager", "hotelManager", "frontDesk", "housekeeping"],
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
  "/api/expenses": ["admin", "manager", "finance"],
  "/api/payroll": ["admin", "manager", "finance"],
  "/api/transactions": ["admin", "manager", "finance"],
  // Release metadata is read-only and available to every authenticated role.
  "/api/release": ["admin", "manager", "restaurantManager", "staff", "kitchen", "finance", "frontDesk", "hotelManager", "housekeeping", "operationsManager"],
  "/api/system": ["admin", "manager", "restaurantManager", "staff", "kitchen", "finance", "frontDesk", "hotelManager", "housekeeping", "operationsManager"],
  // Hospitality module API routes
  "/api/hotels/rooms": ["admin", "manager", "hotelManager", "frontDesk", "housekeeping"],
  "/api/hotels/room-types": ["admin", "manager", "hotelManager", "frontDesk"],
  "/api/hotels/reservations": ["admin", "manager", "hotelManager", "frontDesk"],
  "/api/hotels/check-in": ["admin", "manager", "hotelManager", "frontDesk"],
  "/api/hotels/check-out": ["admin", "manager", "hotelManager", "frontDesk"],
  "/api/hotels/checked-in": ["admin", "manager", "hotelManager", "frontDesk"],
  "/api/hotels/folios": ["admin", "manager", "hotelManager", "frontDesk"],
  "/api/hotels/guests": ["admin", "manager", "frontDesk"],
  "/api/hotels/housekeeping": ["admin", "manager", "frontDesk", "housekeeping"],
  "/api/hotels/maintenance": ["admin", "manager", "operationsManager", "frontDesk", "housekeeping"],
  "/api/complaints": ["admin", "manager", "finance", "staff", "kitchen", "frontDesk", "housekeeping", "operationsManager"],
  // Note: "/api/settings" is intentionally NOT gated here. GET is public so
  // the logo/branding can render on unauthenticated screens (login, sign-up);
  // the route handler itself enforces admin-only writes (POST).
};

const CURRENT_API_VERSION = "v1";
const LEGACY_API_SUNSET = "2027-10-11T00:00:00Z";

function withApiLifecycleHeaders(response: NextResponse, version: string, deprecated = false) {
  response.headers.set("X-API-Version", version);
  response.headers.set("Vary", "X-API-Version");
  if (deprecated) {
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", LEGACY_API_SUNSET);
    response.headers.set("Link", `</api/v1>; rel="successor-version"`);
  }
  return response;
}

export async function middleware(req: NextRequest) {
  const originalPathname = req.nextUrl.pathname;
  const versionedApiPrefix = `/api/${CURRENT_API_VERSION}`;
  const isV1Api = originalPathname === versionedApiPrefix || originalPathname.startsWith(`${versionedApiPrefix}/`);
  const isV2Api = originalPathname === "/api/v2" || originalPathname.startsWith("/api/v2/");
  const isLegacyApi = originalPathname.startsWith("/api/") && !isV1Api && !isV2Api;

  // Normalized API resource path for RBAC checking (always begins with /api/...)
  let normalizedApiPath: string | null = null;
  if (isV1Api) {
    const sub = originalPathname.slice(versionedApiPrefix.length);
    normalizedApiPath = `/api${sub === "" ? "" : sub}`;
  } else if (isV2Api) {
    const sub = originalPathname.slice("/api/v2".length);
    normalizedApiPath = `/api${sub === "" ? "" : sub}`;
  } else if (isLegacyApi) {
    normalizedApiPath = originalPathname;
  }

  // 1. API Route processing (Auth, RBAC, Versioning & Rewrite)
  if (normalizedApiPath) {
    // 1a. Exclude Public API Routes
    if (
      (normalizedApiPath.startsWith("/api/auth") && normalizedApiPath !== "/api/auth/signup") ||
      normalizedApiPath.startsWith("/api/public")
    ) {
      if (isV1Api) {
        const res = NextResponse.rewrite(new URL(normalizedApiPath + req.nextUrl.search, req.url));
        return withApiLifecycleHeaders(res, "1", false);
      }
      return isLegacyApi
        ? withApiLifecycleHeaders(NextResponse.next(), "1", true)
        : withApiLifecycleHeaders(NextResponse.next(), isV2Api ? "2" : "1", false);
    }

    // 1b. Check RBAC for API
    const protectedApiRoute =
      normalizedApiPath === "/api/auth/signup"
        ? "/api/auth/signup"
        : Object.keys(apiPermissions).find((route) => normalizedApiPath!.startsWith(route));

    const apiAllowedRoles =
      normalizedApiPath === "/api/auth/signup" ? ["admin"] : apiPermissions[protectedApiRoute || ""];

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

    // 1c. Route resolution / rewrite
    if (isV2Api) {
      return withApiLifecycleHeaders(NextResponse.next(), "2", false);
    }

    if (isV1Api) {
      // Check if a dedicated route file exists under app/api/v1 (e.g. inventory conversions & units)
      const hasDedicatedRoute =
        originalPathname.startsWith("/api/v1/inventory/conversions") ||
        originalPathname.startsWith("/api/v1/inventory/units");

      if (hasDedicatedRoute) {
        return withApiLifecycleHeaders(NextResponse.next(), "1", false);
      }

      // Transparently rewrite /api/v1/:path to /api/:path
      const rewriteResponse = NextResponse.rewrite(new URL(normalizedApiPath + req.nextUrl.search, req.url));
      return withApiLifecycleHeaders(rewriteResponse, "1", false);
    }

    if (isLegacyApi) {
      return withApiLifecycleHeaders(NextResponse.next(), "1", true);
    }
  }

  // 2. Check for Protected Page Routes
  const protectedRoute = Object.keys(routePermissions).find((route) =>
    originalPathname.startsWith(route)
  );

  if (protectedRoute) {
    const token = req.cookies.get("auth_token")?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("from", originalPathname);
      return NextResponse.redirect(url);
    }

    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      const userRole = payload.role as string;
      const allowedRoles = routePermissions[protectedRoute];

      if (!allowedRoles.includes(userRole)) {
        const url = req.nextUrl.clone();
        url.pathname = "/unauthorized";
        return NextResponse.redirect(url);
      }
    } catch {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
