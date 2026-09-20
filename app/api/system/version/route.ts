import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

const releaseChanges = [
  "Transactional dashboard handoffs and checkout reconciliation",
  "Event security, venue/service receipt generation, and operational notifications",
  "Booking cancellation audit reasons with role-targeted notifications",
  "Inventory and menu availability improvements",
];

export async function GET() {
  const build = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || "development";
  return NextResponse.json(
    {
      version: packageJson.version,
      build,
      branch: process.env.VERCEL_GIT_COMMIT_REF || "local",
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      changes: releaseChanges,
      source: process.env.VERCEL_GIT_COMMIT_SHA ? "Vercel deployment metadata" : "local runtime metadata",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
