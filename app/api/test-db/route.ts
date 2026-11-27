import { NextResponse } from "next/server";
import { getDatabaseConnectionCandidates, isDatabaseQuotaExceededError, query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export async function GET() {
  try {
    const { error } = await requireRole("admin");
    if (error) return error;

    if (getDatabaseConnectionCandidates().length === 0) {
      return NextResponse.json(
        { success: false, error: "No PostgreSQL connection string is configured in environment variables" },
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
        quotaExceeded: isDatabaseQuotaExceededError(error),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: isDatabaseQuotaExceededError(error) ? 503 : 500 },
    );
  }
}
