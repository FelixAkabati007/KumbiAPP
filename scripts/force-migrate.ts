import fs from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;

if (!connectionString) {
  console.error("No DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({ connectionString });

const sql = `
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255),
    details JSONB,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS system_state (
    key VARCHAR(50) PRIMARY KEY,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version UUID DEFAULT uuid_generate_v4()
);

INSERT INTO system_state (key) VALUES ('global') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_state (key) VALUES ('settings') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_state (key) VALUES ('permissions') ON CONFLICT (key) DO NOTHING;
INSERT INTO system_state (key) VALUES ('users') ON CONFLICT (key) DO NOTHING;
`;

async function migrate() {
  console.log("Running partial migration...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Partial migration done.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
