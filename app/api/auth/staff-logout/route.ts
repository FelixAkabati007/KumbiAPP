import { NextRequest, NextResponse } from "next/server";
import { clearSessionData, validateSession } from "@/lib/session-manager";
import { createAuditLog } from "@/lib/audit-logger";
import { cookies } from "next/headers";

// POST - Staff logout
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "No active session" },
        { status: 400 }
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

    // Validate session to get staff info for audit
    const sessionData = await validateSession(sessionToken);

    // Clear session data and logout
    await clearSessionData(sessionToken);

    // Log logout action
    if (sessionData) {
      await createAuditLog({
        actionType: "logout",
        actorId: sessionData.staffId,
        actorName: "staff", // Would ideally get from session
        actorRole: "staff",
        status: "completed",
        changeDetails: {
          sessionToken: sessionToken.substring(0, 16) + "...",
        },
        ipAddress,
      }).catch(console.error);
    }

    const response = NextResponse.json(
      { message: "Logout successful" },
      { status: 200 }
    );

    // Clear all session cookies
    response.cookies.delete("auth_token");
    response.cookies.delete("session_token");

    return response;
  } catch (error) {
    console.error("Error during logout:", error);
    return NextResponse.json(
      { error: "Logout failed" },
      { status: 500 }
    );
  }
}

// GET - Validate current session
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "No active session", isValid: false },
        { status: 401 }
      );
    }

    const sessionData = await validateSession(sessionToken);

    if (!sessionData) {
      return NextResponse.json(
        { error: "Session expired or invalid", isValid: false },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        isValid: true,
        staffId: sessionData.staffId,
        requiresReauth: sessionData.requiresReauth,
        message: sessionData.requiresReauth
          ? "Your session is about to expire due to inactivity"
          : "Session is valid",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error validating session:", error);
    return NextResponse.json(
      { error: "Failed to validate session", isValid: false },
      { status: 500 }
    );
  }
}
