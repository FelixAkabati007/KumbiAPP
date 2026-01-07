
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;

if (!connectionString) {
  console.error("Error: DATABASE_URL is not defined.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function verifyIntegrity() {
  console.log("🧪 Starting Database Integrity Verification...");
  const client = await pool.connect();

  try {
    // 1. Connection Check
    const timeRes = await client.query("SELECT NOW() as now");
    console.log(`✅ Connection Verified. Server Time: ${timeRes.rows[0].now}`);

    // 2. Critical Tables Check
    const tables = ['users', 'orders', 'menu_items', 'settings'];
    for (const table of tables) {
        try {
            const countRes = await client.query(`SELECT COUNT(*) as count FROM "${table}"`);
            console.log(`✅ Table Access '${table}': OK (Rows: ${countRes.rows[0].count})`);
        } catch (e: any) {
            console.error(`❌ Table Access '${table}' Failed: ${e.message}`);
        }
    }

    // 3. User Role Enum Check
    try {
        await client.query("SELECT unnest(enum_range(NULL::user_role))");
        console.log("✅ Enum 'user_role' exists.");
    } catch (e) {
        console.error("❌ Enum 'user_role' missing or inaccessible.");
    }

    console.log("\n✅ Verification Complete. System is ready.");

  } catch (error) {
    console.error("❌ Verification Fatal Error:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

verifyIntegrity();
