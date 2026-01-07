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

async function seedRoles() {
  console.log("🌱 Starting Role Seeding...");
  const client = await pool.connect();

  try {
    const commonPassword = "Password123!";
    console.log("🔐 Hashing common password...");
    const hashedPassword = await bcrypt.hash(commonPassword, 10);

    const users = [
      {
        email: "manager@kumbiapp.com",
        name: "Store Manager",
        role: "manager",
      },
      {
        email: "staff@kumbiapp.com",
        name: "Front Staff",
        role: "staff",
      },
      {
        email: "kitchen@kumbiapp.com",
        name: "Kitchen Chef",
        role: "kitchen",
      },
    ];

    for (const user of users) {
      // Check if user exists
      const checkRes = await client.query("SELECT id FROM users WHERE email = $1", [user.email]);
      
      if (checkRes.rowCount && checkRes.rowCount > 0) {
        console.log(`⚠️ User ${user.email} already exists. Skipping.`);
        continue;
      }

      // Insert user
      await client.query(`
        INSERT INTO users (email, name, role, password_hash, email_verified, is_active)
        VALUES ($1, $2, $3, $4, true, true)
      `, [user.email, user.name, user.role, hashedPassword]);

      console.log(`✅ Created user: ${user.email} (${user.role})`);
    }

    console.log("\n🎉 All test users seeded successfully!");
    console.log(`👉 Password for all users: ${commonPassword}`);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedRoles();
