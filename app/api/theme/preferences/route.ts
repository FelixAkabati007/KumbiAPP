import { NextResponse } from "next/server";

export async function GET() {
  // Return default preference
  return NextResponse.json({
    key: "light",
    themeId: null,
    expiresAt: null,
  });
}

export async function POST() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
