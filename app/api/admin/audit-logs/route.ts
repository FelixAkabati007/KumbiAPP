import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAuditLogs, exportAuditLogs } from "@/lib/audit-logger";

// GET - Retrieve audit logs with filters
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can view audit logs
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const actionType = url.searchParams.get("actionType");
    const actorId = url.searchParams.get("actorId");
    const targetStaffId = url.searchParams.get("targetStaffId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");
    const format = url.searchParams.get("format"); // "json" or "csv"
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const filters: any = { limit, offset };

    if (actionType) filters.actionType = actionType;
    if (actorId) filters.actorId = actorId;
    if (targetStaffId) filters.targetStaffId = targetStaffId;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    if (format === "csv") {
      // Export as CSV
      const csvBuffer = await exportAuditLogs(filters);
      return new NextResponse(csvBuffer, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="audit-logs.csv"',
        },
      });
    }

    // Return as JSON
    const logs = await getAuditLogs(filters);

    return NextResponse.json(
      {
        data: logs,
        total: logs.length,
        filters,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}
