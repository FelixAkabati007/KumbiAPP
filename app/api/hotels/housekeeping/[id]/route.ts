import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Update housekeeping task status
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { status, assignedTo, notes, priority } = await request.json();

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

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating housekeeping task:", error);
    return NextResponse.json(
      { error: "Failed to update housekeeping task" },
      { status: 500 }
    );
  }
}
