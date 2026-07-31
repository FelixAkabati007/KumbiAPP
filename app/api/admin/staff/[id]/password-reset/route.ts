import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createPasswordResetToken } from "@/lib/password-manager";
import { createAuditLog } from "@/lib/audit-logger";
import crypto from "crypto";

// POST - Initiate forced password reset
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins and managers can initiate resets
    if (!["admin", "manager"].includes(session.role)) {
      return NextResponse.json(
        { error: "Only admins and managers can reset passwords" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const { reason } = body;

    if (!reason) {
      return NextResponse.json(
        { error: "Reason for password reset is required" },
        { status: 400 }
      );
    }

    // Verify staff member exists
    const staffResult = await query(
      `SELECT sp.id, sp.first_name, sp.last_name, sp.business_email
       FROM staff_profiles sp
       WHERE sp.id = $1 AND sp.is_active = true`,
      [id]
    );

    if (staffResult.rows.length === 0) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const staff = staffResult.rows[0];
    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

    // Create password reset token
    const { token, expiresAt } = await createPasswordResetToken(
      id,
      session.id,
      reason
    );

    // Log to audit trail
    await createAuditLog({
      actionType: "password_reset",
      actorId: session.id,
      actorName: session.email,
      actorRole: session.role,
      targetStaffId: id,
      targetStaffName: `${staff.first_name} ${staff.last_name}`,
      reason,
      changeDetails: {
        email: staff.business_email,
        expiresAt,
      },
      ipAddress,
    });

    return NextResponse.json(
      {
        message: "Password reset initiated",
        staffEmail: staff.business_email,
        expiresAt,
        resetToken: token, // In production, this should be sent via email, not returned
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error initiating password reset:", error);
    return NextResponse.json(
      { error: "Failed to initiate password reset" },
      { status: 500 }
    );
  }
}

// GET - Check reset token validity
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Reset token is required" },
        { status: 400 }
      );
    }

    const { id } = await context.params;
    
    // Verify token and check if it belongs to this staff member
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const tokenResult = await query(
      `SELECT prt.staff_id, prt.expires_at, prt.is_used
       FROM password_reset_tokens prt
       WHERE prt.token_hash = $1
       AND prt.staff_id = $2
       AND prt.is_used = false
       AND prt.expires_at > NOW()`,
      [tokenHash, id]
    );

    if (tokenResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    const tokenData = tokenResult.rows[0];

    return NextResponse.json(
      {
        valid: true,
        expiresAt: tokenData.expires_at,
        message: "Token is valid. You can now set a new password.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error validating reset token:", error);
    return NextResponse.json(
      { error: "Failed to validate reset token" },
      { status: 500 }
    );
  }
}
