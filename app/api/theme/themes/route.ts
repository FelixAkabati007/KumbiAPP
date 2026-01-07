import { NextResponse } from "next/server";

export async function GET() {
  // Return default or mock themes
  return NextResponse.json([], { status: 200 });
}

export async function POST() {
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function PATCH() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
