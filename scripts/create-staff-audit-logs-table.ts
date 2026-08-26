import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

// Creates the staff_audit_logs table expected by lib/audit-logger.ts.
// This table was referenced by staff management, approvals, and the new
// feature-toggle routes but was never actually created in this database,
// causing every createAuditLog() call to throw "relation does not exist".
async function main() {
  console.log("Creating staff_audit_logs table...");

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS staff_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action_id VARCHAR(128) NOT NULL,
        action_type VARCHAR(64) NOT NULL,
        actor_id UUID,
        actor_name VARCHAR(255),
        actor_role VARCHAR(50),
        target_staff_id UUID,
        target_staff_name VARCHAR(255),
        change_details JSONB,
        ip_address VARCHAR(64),
        device_fingerprint VARCHAR(255),
        reason TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'completed',
        error_message TEXT,
        timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_action_type
        ON staff_audit_logs (action_type);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_actor_id
        ON staff_audit_logs (actor_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_target_staff_id
        ON staff_audit_logs (target_staff_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_timestamp_utc
        ON staff_audit_logs (timestamp_utc DESC);
    `;

    console.log("Table staff_audit_logs created successfully.");
  } catch (error) {
    console.error("Failed to create table:", error);
    process.exit(1);
  }
}

main();
