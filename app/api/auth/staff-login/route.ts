import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { comparePassword, signToken } from "@/lib/auth";
import {
  createSession,
  generateDeviceFingerprint,
  forceLogoutDevice,
} from "@/lib/session-manager";
import { createAuditLog } from "@/lib/audit-logger";

// POST - Staff login with device fingerprint
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = body.email as string;
    const password = body.password as string;
    const deviceFingerprint = body.deviceFingerprint as string;
    const userAgent = body.userAgent as string | undefined;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!deviceFingerprint) {
      return NextResponse.json(
        { error: "Device fingerprint is required" },
        { status: 400 }
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

    // Find staff by business email
    const staffResult = await query(
      `SELECT sp.id, sp.user_id, sp.password_hash, sp.employment_status,
              sp.first_name, sp.last_name, u.role
       FROM staff_profiles sp
       JOIN users u ON sp.user_id = u.id
       WHERE sp.business_email = $1 AND sp.is_active = true`,
      [email]
    );

    if (staffResult.rows.length === 0) {
      // Log failed login attempt
      await createAuditLog({
        actionType: "login",
        actorId: "unknown",
        actorName: email,
        actorRole: "unknown",
        status: "failed",
        errorMessage: "Staff member not found",
        ipAddress,
        deviceFingerprint,
      }).catch(console.error);

      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const staff = staffResult.rows[0];

    // Check employment status
    if (staff.employment_status !== "active") {
      await createAuditLog({
        actionType: "login",
        actorId: staff.id,
        actorName: email,
        actorRole: staff.role,
        status: "failed",
        errorMessage: `Account is ${staff.employment_status}`,
        ipAddress,
        deviceFingerprint,
      }).catch(console.error);

      return NextResponse.json(
        { error: "Your account is not active" },
        { status: 403 }
      );
    }

    // Verify password
    const passwordMatch = await comparePassword(
      password,
      staff.password_hash
    );

    if (!passwordMatch) {
      await createAuditLog({
        actionType: "login",
        actorId: staff.id,
        actorName: email,
        actorRole: staff.role,
        status: "failed",
        errorMessage: "Invalid password",
        ipAddress,
        deviceFingerprint,
      }).catch(console.error);

      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Check for concurrent logins on this device
    try {
      const { sessionToken } = await createSession(
        staff.id,
        deviceFingerprint,
        ipAddress,
        userAgent || "unknown"
      );

      // Create JWT token
      const jwtToken = signToken({
        id: staff.user_id,
        email: email,
        role: staff.role,
      });

      // Log successful login
      await createAuditLog({
        actionType: "login",
        actorId: staff.id,
        actorName: email,
        actorRole: staff.role,
        status: "completed",
        changeDetails: {
          sessionToken: sessionToken.substring(0, 16) + "...",
        },
        ipAddress,
        deviceFingerprint,
      }).catch(console.error);

      const response = NextResponse.json(
        {
          message: "Login successful",
          user: {
            id: staff.user_id,
            email,
            name: `${staff.first_name} ${staff.last_name}`,
            role: staff.role,
          },
          token: jwtToken,
          sessionToken,
        },
        { status: 200 }
      );

      // Set HTTP-only cookie for the JWT token
      response.cookies.set("auth_token", jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60, // 1 day
      });

      // Set session token cookie
      response.cookies.set("session_token", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60, // 1 day
      });

      return response;
    } catch (sessionError: any) {
      if (
        sessionError.message &&
        sessionError.message.includes("already logged in")
      ) {
        return NextResponse.json(
          {
            error: "Another user is logged in on this device",
            code: "CONCURRENT_LOGIN_BLOCKED",
          },
          { status: 409 }
        );
      }
      throw sessionError;
    }
  } catch (error) {
    console.error("Error during staff login:", error);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}
