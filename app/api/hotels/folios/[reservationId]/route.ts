import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
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

    return NextResponse.json(result.rows[0]);
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

    // Recalculate total_charges and balance server-side from the updated column values
    const result = await query(
      `
      UPDATE guest_folios
      SET ${column} = COALESCE(${column}, 0) + $1,
          total_charges = room_charge + service_charges + food_charges + other_charges
            + CASE WHEN $2 = 'service' THEN $1
                   WHEN $2 = 'food' THEN $1
                   WHEN $2 = 'other' THEN $1
                   ELSE 0 END,
          balance = GREATEST(
            0,
            (room_charge + service_charges + food_charges + other_charges
              + CASE WHEN $2 = 'service' THEN $1
                     WHEN $2 = 'food' THEN $1
                     WHEN $2 = 'other' THEN $1
                     ELSE 0 END)
            - COALESCE(paid_amount, 0)
          ),
          last_updated = NOW()
      WHERE reservation_id = $3
      RETURNING *
      `,
      [amount, chargeType, reservationId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Folio not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating guest folio:", error);
    return NextResponse.json(
      { error: "Failed to update guest folio" },
      { status: 500 }
    );
  }
}
