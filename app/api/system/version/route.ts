import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const build = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || packageJson.version;
  return NextResponse.json({ version: packageJson.version, build }, { headers: { "Cache-Control": "no-store" } });
}
