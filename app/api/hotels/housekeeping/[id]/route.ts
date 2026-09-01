import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Update housekeeping task status
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("housekeeping");
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const { status, assignedTo, notes, priority } = await request.json();
    const isHousekeepingOnly = auth.session.role === "housekeeping";
    const allowedStatuses = new Set(["pending", "in_progress", "completed", "on_hold"]);

    if (status && !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Invalid housekeeping status" }, { status: 400 });
    }
    if (isHousekeepingOnly && (assignedTo !== undefined || priority !== undefined)) {
      return NextResponse.json(
        { error: "Housekeeping staff may update status and notes only" },
        { status: 403 }
      );
    }

    let sql = `UPDATE housekeeping_tasks SET updated_at = NOW()`;
    const values: (string | null)[] = [];

    if (status) {
      values.push(status);
      sql += `, status = $${values.length}`;

      // If task is completed, set completed_at
      if (status === "completed") {
        sql += `, completed_at = NOW()`;
      }
    }

    if (assignedTo !== undefined) {
      values.push(assignedTo);
      sql += `, assigned_to = $${values.length}`;
    }

    if (notes !== undefined) {
      values.push(notes);
      sql += `, notes = $${values.length}`;
    }

    if (priority) {
      values.push(priority);
      sql += `, priority = $${values.length}`;
    }

    values.push(id);
    sql += ` WHERE id = $${values.length} RETURNING *`;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Housekeeping task not found" },
        { status: 404 }
      );
    }

    const task = result.rows[0];
    await query(
      `INSERT INTO hotel_activity_ledger (event_type, entity_type, entity_id, room_id, amount, description, metadata)
       VALUES ($1, 'housekeeping_task', $2, $3, 0, $4, $5)`,
      [status ? `housekeeping_${status}` : "housekeeping_updated", String(task.id), task.room_id ?? null, `Housekeeping task ${task.id} updated${status ? ` to ${status}` : ""}`, JSON.stringify({ source: "hotel", status, assignedTo, priority })]
    );
    return NextResponse.json(task);
  } catch (error) {
    console.error("Error updating housekeeping task:", error);
    return NextResponse.json(
      { error: "Failed to update housekeeping task" },
      { status: 500 }
    );
  }
}
