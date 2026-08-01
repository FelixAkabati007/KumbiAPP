import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-logger";
import { v4 as uuidv4 } from "uuid";

// GET - List pending approval requests (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status") || "pending";
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const result = await query(
      `SELECT 
        sar.id,
        sar.request_type,
        sar.status,
        sar.action_data,
        sp_req.first_name as requester_first_name,
        sp_req.last_name as requester_last_name,
        sp_req.business_email as requester_email,
        sp_target.first_name as target_first_name,
        sp_target.last_name as target_last_name,
        sp_target.business_email as target_email,
        sar.created_at,
        sar.updated_at
       FROM staff_approval_requests sar
       JOIN staff_profiles sp_req ON sar.requested_by = sp_req.id
       LEFT JOIN staff_profiles sp_target ON sar.staff_member_id = sp_target.id
       WHERE sar.status = $1
       ORDER BY sar.created_at ASC
       LIMIT $2 OFFSET $3`,
      [statusParam, limit, offset]
    );

    return NextResponse.json({
      data: result.rows || [],
      total: result.rowCount,
    });
  } catch (error) {
    console.error("Error fetching approval requests:", error);
    return NextResponse.json(
      { error: "Failed to fetch approval requests" },
      { status: 500 }
    );
  }
}

// POST - Create new approval request (manager only)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "manager") {
      return NextResponse.json(
        { error: "Only managers can request staff modifications" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { requestType, staffMemberId, actionData } = body;

    if (!requestType || !actionData) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get manager's staff profile
    const managerResult = await query(
      `SELECT id FROM staff_profiles WHERE user_id = $1`,
      [session.id]
    );

    if (managerResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Manager profile not found" },
        { status: 400 }
      );
    }

    const managerId = managerResult.rows[0].id;
    const requestId = uuidv4();
    const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

    try {
      await query(
        `INSERT INTO staff_approval_requests (
          id, request_type, requested_by, staff_member_id, action_data, status
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          requestId,
          requestType,
          managerId,
          staffMemberId || null,
          JSON.stringify(actionData),
          "pending",
        ]
      );

      // Log to audit trail
      await createAuditLog({
        actionType: "staff_updated",
        actorId: session.id,
        actorName: session.email,
        actorRole: session.role,
        targetStaffId: staffMemberId,
        changeDetails: {
          requestType,
          requestId,
          status: "pending_approval",
        },
        ipAddress,
        reason: "Manager requested staff modification - awaiting admin approval",
      });

      return NextResponse.json(
        {
          message: "Approval request created and queued for admin review",
          requestId,
        },
        { status: 201 }
      );
    } catch (error) {
      throw error;
    }
  } catch (error) {
    console.error("Error creating approval request:", error);
    return NextResponse.json(
      { error: "Failed to create approval request" },
      { status: 500 }
    );
  }
}
