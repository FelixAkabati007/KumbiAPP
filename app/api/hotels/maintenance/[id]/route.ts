import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { publishRealtime } from "@/lib/realtime";

// Update a maintenance ticket
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    let authResult = await requirePermission("maintenance");
    if (authResult.error) {
      authResult = await requirePermission("operations");
      if (authResult.error) return authResult.error;
    }
    const { session } = authResult;

    const { id } = await context.params;
    const { status, assignedTo, notes, severity } = await request.json();

    let sql = `UPDATE maintenance_tickets SET updated_at = NOW()`;
    const values: (string | null)[] = [];

    if (status) {
      values.push(status);
      sql += `, status = $${values.length}`;

      if (status === "resolved" || status === "completed") {
        sql += `, completed_at = NOW()`;
      } else if (status === "open" || status === "in_progress") {
        sql += `, completed_at = NULL`;
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

    const updatedTicket = await transaction(async (client) => {
      const result = await client.query(sql, values);
      if (result.rows.length === 0) {
        return null;
      }

      const ticket = result.rows[0];

      // Restore room status to available if all open maintenance tickets for the room are resolved
      if ((status === "resolved" || status === "completed") && ticket.room_id) {
        const remainingOpen = await client.query(
          `SELECT COUNT(*) AS count FROM maintenance_tickets
           WHERE room_id = $1 AND id <> $2 AND status NOT IN ('resolved', 'closed', 'completed')`,
          [ticket.room_id, id],
        );
        if (Number(remainingOpen.rows[0]?.count || 0) === 0) {
          await client.query(
            `UPDATE rooms SET status = 'available', updated_at = NOW() WHERE id = $1 AND status = 'maintenance'`,
            [ticket.room_id],
          );
        }
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [session.id, "maintenance_ticket_updated", "maintenance_ticket", id, JSON.stringify({ status, assignedTo, notesChanged: notes !== undefined, severity })],
      );
      if (status || assignedTo !== undefined) {
        await client.query(
          `INSERT INTO notifications (recipient_user_id, title, message, type)
           SELECT id, $1, $2, $3 FROM users
           WHERE (role IN ('admin', 'manager', 'operationsManager') OR id = $5) AND id <> $4`,
          [`Maintenance ticket ${ticket.ticket_number} updated`, `Status or assignment changed by ${session.email}.`, "maintenance", session.id, ticket.assigned_to || null],
        );
      }
      return ticket;
    });

    if (!updatedTicket) {
      return NextResponse.json(
        { error: "Maintenance ticket not found" },
        { status: 404 }
      );
    }

    publishRealtime("maintenance.updated", String(id));
    if (updatedTicket.room_id) {
      publishRealtime("rooms.updated", String(updatedTicket.room_id));
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
