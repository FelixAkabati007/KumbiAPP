import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });
dotenv.config();

// Configure Neon to use WebSocket
neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;

if (!connectionString) {
  console.error("❌ Error: DATABASE_URL is not defined.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function fixRateLimitTable() {
  console.log("🛠️  Fixing Rate Limit Table...");
  const client = await pool.connect();

  try {
    // 1. Create Table
    console.log("Creating 'signup_attempts' table if not exists...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS signup_attempts (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          email VARCHAR(255),
          ip VARCHAR(64),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Table 'signup_attempts' verified/created.");

    // 2. Create Indexes
    console.log("Creating indexes for performance...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_signup_attempts_window ON signup_attempts(created_at);
      CREATE INDEX IF NOT EXISTS idx_signup_attempts_email ON signup_attempts(email);
      CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip ON signup_attempts(ip);
    `);
    console.log("✅ Indexes created.");

    console.log("\n🚀 Fix complete! The 'signup_attempts' table is ready.");

  } catch (error) {
    console.error("❌ Fix failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixRateLimitTable();
