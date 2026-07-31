import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export type AuditActionType =
  | "staff_created"
  | "staff_updated"
  | "staff_deleted"
  | "password_reset"
  | "approval_granted"
  | "approval_rejected"
  | "login"
  | "logout"
  | "inactivity_warning";

export interface AuditLogEntry {
  actionType: AuditActionType;
  actorId: string;
  actorName: string;
  actorRole: string;
  targetStaffId?: string;
  targetStaffName?: string;
  changeDetails?: Record<string, unknown>;
  ipAddress?: string;
  deviceFingerprint?: string;
  reason?: string;
  status?: "completed" | "failed";
  errorMessage?: string;
}

export async function createAuditLog(entry: AuditLogEntry): Promise<string> {
  const actionId = `${entry.actionType}_${uuidv4().substring(0, 8)}`;
  
  try {
    await query(
      `INSERT INTO staff_audit_logs (
        action_id,
        action_type,
        actor_id,
        actor_name,
        actor_role,
        target_staff_id,
        target_staff_name,
        change_details,
        ip_address,
        device_fingerprint,
        reason,
        status,
        error_message,
        timestamp_utc
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      [
        actionId,
        entry.actionType,
        entry.actorId,
        entry.actorName,
        entry.actorRole,
        entry.targetStaffId || null,
        entry.targetStaffName || null,
        entry.changeDetails ? JSON.stringify(entry.changeDetails) : null,
        entry.ipAddress || null,
        entry.deviceFingerprint || null,
        entry.reason || null,
        entry.status || "completed",
        entry.errorMessage || null,
      ]
    );

    return actionId;
  } catch (error) {
    console.error("Error creating audit log:", error);
    throw new Error("Failed to create audit log entry");
  }
}

export async function getAuditLogs(filters: {
  actionType?: string;
  actorId?: string;
  targetStaffId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const whereConditions: string[] = [];
  const params: (string | number | Date | null)[] = [];
  let paramCount = 1;

  if (filters.actionType) {
    whereConditions.push(`action_type = $${paramCount}`);
    params.push(filters.actionType);
    paramCount++;
  }

  if (filters.actorId) {
    whereConditions.push(`actor_id = $${paramCount}`);
    params.push(filters.actorId);
    paramCount++;
  }

  if (filters.targetStaffId) {
    whereConditions.push(`target_staff_id = $${paramCount}`);
    params.push(filters.targetStaffId);
    paramCount++;
  }

  if (filters.startDate) {
    whereConditions.push(`timestamp_utc >= $${paramCount}`);
    params.push(filters.startDate);
    paramCount++;
  }

  if (filters.endDate) {
    whereConditions.push(`timestamp_utc <= $${paramCount}`);
    params.push(filters.endDate);
    paramCount++;
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  try {
    const result = await query(
      `SELECT * FROM staff_audit_logs ${whereClause} 
       ORDER BY timestamp_utc DESC 
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    return result.rows || [];
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    throw new Error("Failed to fetch audit logs");
  }
}

export async function exportAuditLogs(
  filters: Record<string, unknown>
): Promise<Buffer> {
  const logs = await getAuditLogs({ ...filters, limit: 10000 });

  // Convert to CSV format
  const headers = [
    "Action ID",
    "Action Type",
    "Actor",
    "Actor Role",
    "Target Staff",
    "Timestamp (UTC)",
    "IP Address",
    "Details",
  ];

  const rows = logs.map((log: Record<string, unknown>) => [
    log.action_id,
    log.action_type,
    log.actor_name,
    log.actor_role,
    log.target_staff_name || "-",
    log.timestamp_utc,
    log.ip_address || "-",
    log.change_details ? JSON.stringify(log.change_details) : "-",
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return Buffer.from(csv, "utf-8");
}
