import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await query<{ theme?: string }>("SELECT data->>'theme' AS theme FROM settings WHERE id = 1");
  return NextResponse.json({ key: result.rows[0]?.theme || "system", themeId: null, expiresAt: null });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !["admin", "manager"].includes(session.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await request.json();
  const key = body?.key;
  if (!["light", "dark", "system"].includes(key)) return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
  const current = await query<{ data: Record<string, unknown>; version: number }>("SELECT data, version FROM settings WHERE id = 1");
  const data = { ...(current.rows[0]?.data || {}), theme: key };
  const version = Number(current.rows[0]?.version || 1) + 1;
  await query("UPDATE settings SET data = $1::jsonb, version = $2, updated_at = NOW() WHERE id = 1", [JSON.stringify(data), version]);
  return NextResponse.json({ ok: true, key, version });
}
