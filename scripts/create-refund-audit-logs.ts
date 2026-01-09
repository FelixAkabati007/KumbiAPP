import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config(); // Fallback to .env

async function createRefundAuditLogsTable() {
  const { query } = await import("../lib/db");
  console.log("Creating refund_audit_logs table...");

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS refund_audit_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          refund_id UUID REFERENCES refundrequests(id) ON DELETE CASCADE,
          action VARCHAR(50) NOT NULL,
          actor VARCHAR(255),
          message TEXT,
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_refund_audit_logs_refund_id ON refund_audit_logs(refund_id);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_refund_audit_logs_created_at ON refund_audit_logs(created_at);
    `);

    console.log("✅ refund_audit_logs table created successfully.");
  } catch (error) {
    console.error("❌ Failed to create table:", error);
    process.exit(1);
  }
}

createRefundAuditLogsTable();
