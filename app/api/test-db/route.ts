import { NextResponse } from "next/server";
import { checkConnection, query } from "@/lib/db";

export async function GET() {
  try {
    // 1. Check basic connectivity
    const isConnected = await checkConnection();
    if (!isConnected) {
      return NextResponse.json(
        { success: false, error: "Failed to connect to Neon database" },
        { status: 500 },
      );
    }

    // 2. Get server version and current database
    const versionRes = await query("SELECT version()");
    const dbNameRes = await query("SELECT current_database()");

    // 3. List tables (information_schema)
    const tablesRes = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    return NextResponse.json({
      success: true,
      message: "Successfully connected to Neon database",
      info: {
        version: versionRes.rows[0].version,
        database: dbNameRes.rows[0].current_database,
        tables: tablesRes.rows.map((r) => r.table_name),
        connectionPool: "Active",
      },
    });
  } catch (error) {
    console.error("Database test failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: error,
      },
      { status: 500 },
    );
  }
}
