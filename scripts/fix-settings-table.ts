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

async function fixSettingsTable() {
  console.log("🛠️  Fixing Settings Table...");
  const client = await pool.connect();

  try {
    // 1. Create Table
    console.log("Creating 'settings' table if not exists...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
          id INT PRIMARY KEY DEFAULT 1,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
          CONSTRAINT single_row CHECK (id = 1)
      );
    `);
    console.log("✅ Table 'settings' verified/created.");

    // 2. Check for existing row
    const checkRes = await client.query("SELECT id FROM settings WHERE id = 1");
    
    if (checkRes.rowCount === 0) {
      console.log("⚠️ Settings row (id=1) missing. Inserting default empty object...");
      await client.query(`
        INSERT INTO settings (id, data) VALUES (1, '{}'::jsonb);
      `);
      console.log("✅ Default settings row inserted.");
    } else {
      console.log("✅ Settings row (id=1) already exists.");
    }

    console.log("\n🚀 Fix complete! The 'settings' table is ready.");

  } catch (error) {
    console.error("❌ Fix failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixSettingsTable();
