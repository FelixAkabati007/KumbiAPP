import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Get all guests
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");

    let sql = `SELECT * FROM guests ORDER BY created_at DESC`;
    const params: string[] = [];

    if (search) {
      sql = `
        SELECT * FROM guests 
        WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1
        ORDER BY created_at DESC
      `;
      params.push(`%${search}%`);
    }

    const result = await query(sql, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching guests:", error);
    return NextResponse.json(
      { error: "Failed to fetch guests" },
      { status: 500 }
    );
  }
}

// Create a new guest
export async function POST(request: NextRequest) {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      idType,
      idNumber,
      country,
      address,
    } = await request.json();

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `
      INSERT INTO guests (first_name, last_name, email, phone, id_type, id_number, country, address)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [firstName, lastName, email || null, phone || null, idType || null, idNumber || null, country || null, address || null]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating guest:", error);
    return NextResponse.json(
      { error: "Failed to create guest" },
      { status: 500 }
    );
  }
}
