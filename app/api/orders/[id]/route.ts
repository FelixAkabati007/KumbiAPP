import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, priority, chefNotes } = body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (chefNotes !== undefined) {
      updates.push(`chefnotes = $${paramIndex++}`);
      values.push(chefNotes);
    }

    if (updates.length === 0) {
      return NextResponse.json({ message: "No updates provided" });
    }

    // Add updated_at
    updates.push(`updated_at = timezone('utc', now())`);

    // Add ID to values
    values.push(id);

    const queryText = `
      UPDATE kitchenorders
      SET ${updates.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(queryText, values);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, order: result.rows[0] });
  } catch (error) {
    console.error("Failed to update order:", error);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}
