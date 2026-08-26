import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Creating feature_toggles table...");

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS feature_toggles (
        key VARCHAR(64) PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT true,
        updated_by_id UUID,
        updated_by_name VARCHAR(255),
        updated_by_role VARCHAR(50),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    // Seed the toggles this section covers, enabled by default so existing
    // behavior is unchanged until an admin/manager explicitly disables one.
    await sql`
      INSERT INTO feature_toggles (key, enabled)
      VALUES ('kitchen_display', true), ('order_board', true)
      ON CONFLICT (key) DO NOTHING;
    `;

    console.log("Table feature_toggles created and seeded successfully.");
  } catch (error) {
    console.error("Failed to create table:", error);
    process.exit(1);
  }
}

main();
