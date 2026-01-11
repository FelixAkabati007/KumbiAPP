import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { z } from "zod";

// Validation schema
const updateItemSchema = z.object({
  status: z.enum(["pending", "preparing", "ready", "served"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Validate input
    const validationResult = updateItemSchema.safeParse(body);
    if (!validationResult.success) {
      console.error("Validation failed:", validationResult.error);
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    const { status } = validationResult.data;

    // console.log(`[API] Updating order item ${id} to status: ${status}`);

    // Update the item status
    const result = await query(
      `UPDATE kitchen_orderitems 
       SET status = $1 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );
    // const duration = Date.now() - startTime;
    // console.log(`[API] Database update took ${duration}ms`);

    if (result.rowCount === 0) {
      console.warn(`[API] Order item ${id} not found in database`);
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const updatedItem = result.rows[0];

    // Also update the parent order's updated_at timestamp to ensure consistency
    // This helps polling mechanisms detect the change
    if (updatedItem.kitchenorderid) {
      await query(
        `UPDATE kitchenorders 
             SET updated_at = NOW() 
             WHERE id = $1`,
        [updatedItem.kitchenorderid]
      );
      // console.log(`[API] Touched parent order ${updatedItem.kitchenorderid}`);
    }

    // console.log(`[API] Successfully updated item ${id} status to ${status}`);

    return NextResponse.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error("[API] Failed to update order item:", error);
    return NextResponse.json(
      {
        error: "Failed to update order item",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
