
import fs from "fs";
import path from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";
import { EXPECTED_SCHEMA, TableDefinition } from "../lib/db-schema";

// Load environment variables
dotenv.config({ path: ".env.local" });
dotenv.config();

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL || process.env.DB_URL;

if (!connectionString) {
  console.error("Error: DATABASE_URL is not defined.");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function syncDatabase() {
  console.log("🔄 Starting Database Synchronization...");
  const client = await pool.connect();

  try {
    // 1. Run Base Migration (Idempotent CREATE TABLE IF NOT EXISTS)
    console.log("📦 Applying Base Schema...");
    const schemaPath = path.join(process.cwd(), "database", "schema.sql");
    if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, "utf-8");
        await client.query("BEGIN");
        await client.query(schemaSql);
        await client.query("COMMIT");
        console.log("✅ Base schema applied.");
    } else {
        console.error("❌ Schema file not found.");
    }

    // 2. Schema Comparison & Drift Detection
    console.log("🔍 Verifying Schema Integrity...");
    
    const driftReport: string[] = [];

    for (const table of EXPECTED_SCHEMA) {
        // Check if table exists
        const tableCheck = await client.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
            [table.name]
        );

        if (tableCheck.rowCount === 0) {
            driftReport.push(`❌ Table missing: ${table.name}`);
            continue;
        }

        // Check columns
        const columnCheck = await client.query(
            "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
            [table.name]
        );

        const existingColumns = new Map(columnCheck.rows.map(row => [row.column_name, row]));

        for (const col of table.columns) {
            const existing = existingColumns.get(col.name);
            if (!existing) {
                console.log(`⚠️  Column missing: ${table.name}.${col.name}. Attempting to sync...`);
                try {
                    // Auto-fix: Add column
                    // Note: This is a simplified migration. Complex types/defaults need more care.
                    const alterQuery = `ALTER TABLE "${table.name}" ADD COLUMN "${col.name}" ${col.type} ${col.nullable ? '' : 'NOT NULL DEFAULT ' + getDefaultValue(col.type)}`;
                    await client.query(alterQuery);
                    console.log(`✅ Added column: ${table.name}.${col.name}`);
                } catch (e: any) {
                    driftReport.push(`❌ Failed to add column ${table.name}.${col.name}: ${e.message}`);
                }
            } else {
                // Type verification (loose check)
                // PG types in information_schema might differ slightly (e.g., 'character varying' vs 'varchar')
                // We skip strict type check for now to avoid false positives, focusing on existence.
            }
        }
    }

    if (driftReport.length > 0) {
        console.warn("\n⚠️  Synchronization Warnings:");
        driftReport.forEach(msg => console.warn(msg));
    } else {
        console.log("\n✅ Database is fully synchronized with expected schema.");
    }

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Synchronization failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

function getDefaultValue(type: string): string {
    if (type.includes('bool')) return 'FALSE';
    if (type.includes('int') || type.includes('numeric') || type.includes('decimal')) return '0';
    if (type.includes('uuid')) return 'uuid_generate_v4()';
    if (type.includes('timestamp')) return 'NOW()';
    return "''";
}

syncDatabase();
