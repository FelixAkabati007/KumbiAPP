import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

async function generateTicketNumber(): Promise<string> {
  const result = await query(
    `SELECT COUNT(*) as count FROM maintenance_tickets WHERE created_at > NOW() - INTERVAL '1 day'`
  );
  const count = (result.rows[0]?.count || 0) + 1;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `MT${date}${String(count).padStart(4, "0")}`;
}

// Get all maintenance tickets with optional filtering
export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission("maintenance");
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const roomId = searchParams.get("roomId");

    let sql = `
      SELECT mt.*, r.room_number, u.name as assigned_to_name
      FROM maintenance_tickets mt
      LEFT JOIN rooms r ON mt.room_id = r.id
      LEFT JOIN users u ON mt.assigned_to = u.id
    `;
    const params: string[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push(`mt.status = $${params.length + 1}`);
      params.push(status);
    }

    if (severity) {
      conditions.push(`mt.severity = $${params.length + 1}`);
      params.push(severity);
    }

    if (roomId) {
      conditions.push(`mt.room_id = $${params.length + 1}`);
      params.push(roomId);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    sql += ` ORDER BY
      CASE mt.severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      mt.created_at DESC LIMIT 500`;

    const result = await query(sql, params);
    const response = NextResponse.json(result.rows);
    response.headers.set(
      "Cache-Control",
      "public, max-age=30, s-maxage=60, stale-while-revalidate=300"
    );
    return response;
  } catch (error) {
    console.error("Error fetching maintenance tickets:", error);
    return NextResponse.json(
      { error: "Failed to fetch maintenance tickets" },
      { status: 500 }
    );
  }
}

// Create a new maintenance ticket
export async function POST(request: NextRequest) {
  try {
    const { session, error } = await requirePermission("maintenance");
    if (error) return error;
    const { roomId, issueDescription, severity, assignedTo, notes } =
      await request.json();

    let routedRecipient = assignedTo || null;
    if (session.role === "housekeeping" && !routedRecipient) {
      const recipientResult = await query(
        `SELECT id FROM users
         WHERE is_active = true AND role IN ('manager', 'admin')
         ORDER BY CASE role WHEN 'manager' THEN 0 ELSE 1 END, last_login DESC NULLS LAST, created_at ASC
         LIMIT 1`,
      );
      routedRecipient = recipientResult.rows[0]?.id || null;
      if (!routedRecipient) {
        return NextResponse.json({ error: "No active Manager or Admin is available to receive this ticket" }, { status: 503 });
      }
    }

    if (!["admin", "manager", "operationsManager", "housekeeping"].includes(session.role)) {
      return NextResponse.json({ error: "Only Admins, Managers, or Housekeeping can issue maintenance tickets" }, { status: 403 });
    }

    if (!roomId || !issueDescription) {
      return NextResponse.json(
        { error: "Room and issue description are required" },
        { status: 400 }
      );
    }

    const ticketNumber = await generateTicketNumber();

    const result = await query(
      `
      INSERT INTO maintenance_tickets (
        ticket_number, room_id, issue_description, severity, assigned_to, notes, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        ticketNumber,
        roomId,
        issueDescription,
        severity || "normal",
        routedRecipient,
        notes || null,
        session.id,
      ]
    );

    const ticket = result.rows[0];
    await query(
      `INSERT INTO notifications (recipient_user_id, title, message, type)
       SELECT id, $1, $2, $3 FROM users
       WHERE (role IN ('admin', 'manager', 'operationsManager') OR id = $5) AND id <> $4`,
      [
        `New maintenance ticket ${ticketNumber}`,
        `${severity || "normal"} priority ticket created for room ${roomId}.`,
        "maintenance",
        session.id,
        routedRecipient,
      ],
    );
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [session.id, "maintenance_ticket_routed", "maintenance_ticket", ticket.id, JSON.stringify({ recipientId: routedRecipient, routing: session.role === "housekeeping" ? "manager_first_admin_fallback" : "direct_assignment" })],
    );
    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    console.error("Error creating maintenance ticket:", error);
    return NextResponse.json(
      { error: "Failed to create maintenance ticket" },
      { status: 500 }
    );
  }
}
