import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  const build = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || "development";
  return NextResponse.json({ version: packageJson.version, build }, { headers: { "Cache-Control": "no-store" } });
}
