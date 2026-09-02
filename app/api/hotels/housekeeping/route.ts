import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Get all housekeeping tasks
export async function GET(request: NextRequest) {
  try {
    const { error } = await requirePermission("housekeeping");
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const roomId = searchParams.get("roomId");

    let sql = `
      SELECT ht.*, r.room_number, u.name as assigned_to_name
      FROM housekeeping_tasks ht
      LEFT JOIN rooms r ON ht.room_id = r.id
      LEFT JOIN users u ON ht.assigned_to = u.id
    `;
    const params: (string | undefined)[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push(`ht.status = $${params.length + 1}`);
      params.push(status);
    }

    if (roomId) {
      conditions.push(`ht.room_id = $${params.length + 1}`);
      params.push(roomId);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    sql += ` ORDER BY ht.priority DESC, ht.created_at ASC LIMIT 500`;

    const result = await query(sql, params);
    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Error fetching housekeeping tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch housekeeping tasks" },
      { status: 500 }
    );
  }
}

// Create housekeeping task
export async function POST(request: NextRequest) {
  try {
    const { session, error } = await requirePermission("housekeeping");
    if (error) return error;
    if (session.role !== "admin" && session.role !== "manager") {
      return NextResponse.json({ error: "Only Admins and Managers can issue cleaning tasks" }, { status: 403 });
    }

    const { roomId, taskType, priority, assignedTo, notes } = await request.json();

    if (!roomId || !taskType) {
      return NextResponse.json(
        { error: "Room ID and task type are required" },
        { status: 400 }
      );
    }

    const roomResult = await query(`SELECT status FROM rooms WHERE id = $1 AND is_active = true`, [roomId]);
    if (roomResult.rows[0]?.status !== "dirty") {
      return NextResponse.json({ error: "Cleaning tasks can only be created for dirty rooms" }, { status: 409 });
    }

    if (assignedTo) {
      const staffResult = await query(`SELECT id FROM users WHERE id = $1 AND role = 'housekeeping' AND is_active = true`, [assignedTo]);
      if (staffResult.rowCount !== 1) {
        return NextResponse.json({ error: "Assigned account must be an active housekeeping user" }, { status: 400 });
      }
    }

    const result = await query(
      `
      INSERT INTO housekeeping_tasks (room_id, task_type, priority, assigned_to, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [roomId, taskType, priority || "normal", assignedTo || null, notes || null]
    );

    const task = result.rows[0];
    await query(
      `INSERT INTO notifications (recipient_user_id, title, message, type)
       SELECT id, $1, $2, $3 FROM users
       WHERE (role IN ('admin', 'manager') OR id = $5) AND id <> $4`,
      [
        `New cleaning task for room ${roomId}`,
        `${priority || "normal"} priority ${taskType} task assigned for housekeeping.` ,
        "housekeeping",
        session.id,
        assignedTo || null,
      ],
    );
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating housekeeping task:", error);
    return NextResponse.json(
      { error: "Failed to create housekeeping task" },
      { status: 500 }
    );
  }
}
