import { NextResponse } from "next/server";
import { getSystemState } from "@/lib/system-sync";

export const dynamic = "force-dynamic";

export async function GET() {
  // console.log("API: Fetching system state...");
  const state = await getSystemState();
  // console.log("API: System State result:", state);
  return NextResponse.json(state);
}
