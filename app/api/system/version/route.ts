import { NextRequest, NextResponse } from "next/server";
import { getReleasePayload, publishSoftwareUpdate, SoftwareUpdate } from "@/lib/software-updates";
import { requireRole } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const clientBuild = request.nextUrl.searchParams.get("build");
    const payload = await getReleasePayload(clientBuild);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Failed to retrieve software release payload:", error);
    return NextResponse.json(
      { error: "Failed to retrieve software updates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const roleCheck = await requireRole("admin", "manager");
    if (roleCheck.error) return roleCheck.error;

    const body = await request.json();
    if (!body.version || !body.title) {
      return NextResponse.json(
        { error: "Version and title are required to publish an update" },
        { status: 400 }
      );
    }

    const newUpdate = await publishSoftwareUpdate({
      version: String(body.version).trim(),
      build: body.build ? String(body.build).trim() : `prod-build-${Date.now()}`,
      title: String(body.title).trim(),
      description: body.description ? String(body.description).trim() : "",
      type: body.type || "feature",
      isCritical: Boolean(body.isCritical),
      details: Array.isArray(body.details)
        ? body.details
        : Array.isArray(body.changes)
        ? body.changes
        : [body.title],
      source: body.source || "Administrator Deployment",
      releaseDate: body.releaseDate ? String(body.releaseDate) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Software update v${newUpdate.version} published successfully`,
      update: newUpdate,
    });
  } catch (error) {
    console.error("Failed to publish software update:", error);
    return NextResponse.json(
      { error: "Failed to publish software update" },
      { status: 500 }
    );
  }
}
