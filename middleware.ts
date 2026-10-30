import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  getProtectedApiAllowedRoles,
  getProtectedPageAllowedRoles,
  type UserRole,
} from "@/lib/roles";

function getJwtSecret(): string {
  return (
    process.env.JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "your-secret-key-change-me"
  );
}

const DEBUG_TEST_ROUTES = [
  "/env-test",
  "/test-minimal",
  "/test-simple",
  "/barcode-test",
  "/thermal-test",
];

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

    // 1b. Check RBAC for API via Canonical Role Matrix
    const apiAllowedRoles = getProtectedApiAllowedRoles(normalizedApiPath);

    if (apiAllowedRoles) {
      // Allow internal server-to-server realtime publish with x-internal-realtime-key
      const internalKey = req.headers.get("x-internal-realtime-key");
      const validInternalCall =
        normalizedApiPath === "/api/realtime" &&
        req.method === "POST" &&
        internalKey &&
        internalKey === getJwtSecret();

      if (!validInternalCall) {
        const token = req.cookies.get("auth_token")?.value;
        if (!token) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
          const secret = new TextEncoder().encode(getJwtSecret());
          const { payload } = await jwtVerify(token, secret);
          const userRole = payload.role as UserRole;

          if (!apiAllowedRoles.includes(userRole)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
        } catch {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
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

  // 2. Check for Protected Page Routes (including debug/test routes in production)
  const isDebugRoute =
    process.env.NODE_ENV === "production" &&
    DEBUG_TEST_ROUTES.some((route) => originalPathname.startsWith(route));
  const allowedRoles: UserRole[] | null = isDebugRoute
    ? ["admin"]
    : getProtectedPageAllowedRoles(originalPathname);

  if (allowedRoles) {
    const token = req.cookies.get("auth_token")?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("from", originalPathname);
      return NextResponse.redirect(url);
    }

    try {
      const secret = new TextEncoder().encode(getJwtSecret());
      const { payload } = await jwtVerify(token, secret);
      const userRole = payload.role as UserRole;

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
