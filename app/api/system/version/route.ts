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
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA;
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || process.env.GIT_BRANCH || "local";
  const build = commitSha || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || "development";
  return NextResponse.json(
    {
      version: packageJson.version,
      build,
      branch,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      changes: releaseChanges,
      source: commitSha ? "deployment commit metadata" : "local runtime metadata",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
