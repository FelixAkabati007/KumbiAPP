import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";

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

async function seedAdmin() {
  console.log("🌱 Starting Admin Seeding...");
  const client = await pool.connect();

  try {
    const email = "admin@kumbiapp.com";
    const password = "AdminPassword123!";
    const name = "System Admin";
    const role = "admin";

    // Check if admin exists
    const checkRes = await client.query("SELECT id, email FROM users WHERE email = $1", [email]);
    if (checkRes.rowCount && checkRes.rowCount > 0) {
        console.log(`⚠️ Admin user already exists (${checkRes.rows[0].email}). Skipping.`);
        return;
    }

    console.log("🔐 Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert admin
    // Note: username is NOT in the schema based on database/schema.sql
    const insertQuery = `
        INSERT INTO users (email, name, role, password_hash, email_verified, is_active)
        VALUES ($1, $2, $3, $4, true, true)
        RETURNING id, email, role;
    `;

    const res = await client.query(insertQuery, [email, name, role, hashedPassword]);
    const user = res.rows[0];

    console.log(`✅ Admin user created successfully:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Password: ${password}`);
    console.log(`\n👉 You can now log in with these credentials.`);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedAdmin();
