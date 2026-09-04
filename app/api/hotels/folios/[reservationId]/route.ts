import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth";

const paramsSchema = z.object({
  reservationId: z.string().uuid({ message: "Invalid reservation id" }),
});

const addChargeSchema = z.object({
  chargeType: z.enum(["service", "food", "other"]),
  amount: z.coerce
    .number()
    .positive({ message: "Amount must be greater than zero" })
    .max(1_000_000, { message: "Amount is too large" }),
  description: z.string().max(255).optional(),
});

const chargeColumn: Record<z.infer<typeof addChargeSchema>["chargeType"], string> = {
  service: "service_charges",
  food: "food_charges",
  other: "other_charges",
};

// Get a guest's folio (room/service/food/other charges + balance) for a reservation
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reservationId: string }> }
) {
  try {
    const { error: authError } = await requirePermission("guestFolio");
    if (authError) return authError;

    const paramsResult = paramsSchema.safeParse(await context.params);
    if (!paramsResult.success) {
      return NextResponse.json({ error: "Invalid reservation id" }, { status: 400 });
    }
    const { reservationId } = paramsResult.data;

    const result = await query(
      `
      SELECT gf.*, r.reservation_number, g.first_name, g.last_name, rm.room_number
      FROM guest_folios gf
      JOIN reservations r ON r.id = gf.reservation_id
      JOIN guests g ON g.id = r.guest_id
      LEFT JOIN rooms rm ON rm.id = r.room_id
      WHERE gf.reservation_id = $1
      `,
      [reservationId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Folio not found" }, { status: 404 });
    }

    const items = await query(
      `SELECT id, category, description, quantity, unit_amount, total_amount, source_type, source_id, created_at
       FROM guest_folio_items WHERE reservation_id = $1 ORDER BY created_at ASC`,
      [reservationId]
    );

    return NextResponse.json({ ...result.rows[0], items: items.rows });
  } catch (error) {
    console.error("Error fetching guest folio:", error);
    return NextResponse.json(
      { error: "Failed to fetch guest folio" },
      { status: 500 }
    );
  }
}

// Add a charge (service/food/other) to a guest's folio and recalculate totals/balance
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ reservationId: string }> }
) {
  try {
    const { error: authError } = await requirePermission("guestFolio");
    if (authError) return authError;

    const paramsResult = paramsSchema.safeParse(await context.params);
    if (!paramsResult.success) {
      return NextResponse.json({ error: "Invalid reservation id" }, { status: 400 });
    }
    const { reservationId } = paramsResult.data;

    const body = await request.json();
    const validationResult = addChargeSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message || "Invalid charge data" },
        { status: 400 }
      );
    }
    const { chargeType, amount } = validationResult.data;
    const column = chargeColumn[chargeType];

    const result = await transaction(async (client) => {
      const folioResult = await client.query(
        `SELECT id FROM guest_folios WHERE reservation_id = $1 FOR UPDATE`,
        [reservationId]
      );
      const folio = folioResult.rows[0];
      if (!folio) return null;

      await client.query(
        `INSERT INTO guest_folio_items
          (reservation_id, folio_id, category, description, quantity, unit_amount, total_amount, source_type)
         VALUES ($1, $2, $3, $4, 1, $5, $5, 'folio')`,
        [reservationId, folio.id, chargeType, validationResult.data.description || `${chargeType} charge`, amount]
      );

      const updated = await client.query(
        `UPDATE guest_folios
         SET ${column} = COALESCE(${column}, 0) + $1,
             total_charges = COALESCE(room_charge, 0) + COALESCE(service_charges, 0) + COALESCE(food_charges, 0) + COALESCE(other_charges, 0) + $1,
             balance = GREATEST(0, COALESCE(room_charge, 0) + COALESCE(service_charges, 0) + COALESCE(food_charges, 0) + COALESCE(other_charges, 0) + $1 - COALESCE(paid_amount, 0)),
             last_updated = NOW()
         WHERE reservation_id = $2 RETURNING *`,
        [amount, reservationId]
      );
      return updated.rows[0] || null;
    });

    if (!result) {
      return NextResponse.json({ error: "Folio not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating guest folio:", error);
    return NextResponse.json(
      { error: "Failed to update guest folio" },
      { status: 500 }
    );
  }
}
