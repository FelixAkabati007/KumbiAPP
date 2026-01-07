import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query("SELECT data FROM settings WHERE id = 1");
    if (result.rows.length > 0) {
      const settingsData = result.rows[0].data;
      // Ensure we return an empty object if data is null/undefined to prevent client crashes
      return NextResponse.json(settingsData || {});
    }
    // Return empty object instead of empty JSON to satisfy typed clients
    return NextResponse.json({});
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json();
    
    // Basic validation
    if (!data || typeof data !== 'object') {
       return NextResponse.json({ error: "Invalid settings data" }, { status: 400 });
    }

    await query(`
      INSERT INTO settings (id, data, updated_at)
      VALUES (1, $1, NOW())
      ON CONFLICT (id) DO UPDATE
      SET data = $1, updated_at = NOW()
    `, [JSON.stringify(data)]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
