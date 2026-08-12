import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Get all room types
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  try {
    const result = await query(
      `SELECT * FROM room_types WHERE is_active = true ORDER BY name ASC`
    );
    const response = NextResponse.json(result.rows);
    response.headers.set('Cache-Control', 'public, max-age=3600, s-maxage=7200, stale-while-revalidate=86400');
    return response;
  } catch (error) {
    console.error("Error fetching room types:", error);
    return NextResponse.json(
      { error: "Failed to fetch room types" },
      { status: 500 }
    );
  }
}

// Create a new room type
export async function POST(request: NextRequest) {
  try {
    const {
      name,
      description,
      basePrice,
      maxOccupants,
      amenities,
    } = await request.json();

    if (!name || basePrice === undefined || !maxOccupants) {
      return NextResponse.json(
        { error: "Name, base price, and max occupants are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `
      INSERT INTO room_types (name, description, base_price, max_occupants, amenities)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        name,
        description || null,
        basePrice,
        maxOccupants,
        amenities ? JSON.stringify(amenities) : null,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating room type:", error);
    return NextResponse.json(
      { error: "Failed to create room type" },
      { status: 500 }
    );
  }
}
