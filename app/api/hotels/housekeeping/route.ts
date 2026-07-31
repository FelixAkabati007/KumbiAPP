import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Get all housekeeping tasks
export async function GET(request: NextRequest) {
  try {
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
    const response = NextResponse.json(result.rows);
    response.headers.set('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
    return response;
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
    const { roomId, taskType, priority, assignedTo, notes } =
      await request.json();

    if (!roomId || !taskType) {
      return NextResponse.json(
        { error: "Room ID and task type are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `
      INSERT INTO housekeeping_tasks (room_id, task_type, priority, assigned_to, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [roomId, taskType, priority || "normal", assignedTo || null, notes || null]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating housekeeping task:", error);
    return NextResponse.json(
      { error: "Failed to create housekeeping task" },
      { status: 500 }
    );
  }
}
