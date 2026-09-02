import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

// Update a maintenance ticket
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requirePermission("maintenance");
    if (error) return error;

    const { id } = await context.params;
    const { status, assignedTo, notes, severity } = await request.json();

    let sql = `UPDATE maintenance_tickets SET updated_at = NOW()`;
    const values: (string | null)[] = [];

    if (status) {
      values.push(status);
      sql += `, status = $${values.length}`;

      if (status === "resolved" || status === "completed") {
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

    if (severity) {
      values.push(severity);
      sql += `, severity = $${values.length}`;
    }

    values.push(id);
    sql += ` WHERE id = $${values.length} RETURNING *`;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Maintenance ticket not found" },
        { status: 404 }
      );
    }

    const updatedTicket = result.rows[0];
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [session.id, "maintenance_ticket_updated", "maintenance_ticket", id, JSON.stringify({ status, assignedTo, notesChanged: notes !== undefined, severity })],
    );
    if (status || assignedTo !== undefined) {
      await query(
        `INSERT INTO notifications (recipient_user_id, title, message, type)
         SELECT id, $1, $2, $3 FROM users WHERE role IN ('admin', 'manager') AND id <> $4`,
        [`Maintenance ticket ${updatedTicket.ticket_number} updated`, `Status or assignment changed by ${session.email}.`, "maintenance", session.id],
      );
    }
    return NextResponse.json(updatedTicket);
  } catch (error) {
    console.error("Error updating maintenance ticket:", error);
    return NextResponse.json(
      { error: "Failed to update maintenance ticket" },
      { status: 500 }
    );
  }
}

// Delete a maintenance ticket
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requirePermission("maintenance");
    if (error) return error;

    const { id } = await context.params;
    const result = await query(
      `DELETE FROM maintenance_tickets WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Maintenance ticket not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting maintenance ticket:", error);
    return NextResponse.json(
      { error: "Failed to delete maintenance ticket" },
      { status: 500 }
    );
  }
}
