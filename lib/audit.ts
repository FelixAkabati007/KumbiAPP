import { query } from "@/lib/db";

export interface AuditLogParams {
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  performedBy?: string;
  ipAddress?: string;
}

/**
 * Logs an administrative action to the audit_logs table.
 */
export async function logAudit({
  action,
  entityType,
  entityId,
  details,
  performedBy,
  ipAddress,
}: AuditLogParams): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (
        action, 
        entity_type, 
        entity_id, 
        details, 
        performed_by, 
        ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        action,
        entityType,
        entityId || null,
        details ? JSON.stringify(details) : null,
        performedBy || null,
        ipAddress || null,
      ]
    );
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // We don't throw here to avoid failing the main action if logging fails
    // But in a strict compliance env, we might want to throw.
  }
}
