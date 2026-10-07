import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getHotelInvariantDetails } from "@/lib/services/hotel-invariants";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    return NextResponse.json(await getHotelInvariantDetails(), {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Failed to generate hotel invariant report", error);
    return NextResponse.json({ error: "Failed to generate hotel invariant report" }, { status: 500 });
  }
}
