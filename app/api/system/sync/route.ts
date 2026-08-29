import { NextResponse } from "next/server";
import { getSystemState } from "@/lib/system-sync";
import { requireSession } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  // console.log("API: Fetching system state...");
  const state = await getSystemState();
  // console.log("API: System State result:", state);
  return NextResponse.json(state);
}
