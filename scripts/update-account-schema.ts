import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Starting account schema update...");

  try {
    // 1. Add avatar_url to users table
    console.log("Adding avatar_url to users table...");
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `;
    console.log("Added avatar_url to users table.");

    // 2. Create restaurant_profile table
    console.log("Creating restaurant_profile table...");
    await sql`
      CREATE TABLE IF NOT EXISTS restaurant_profile (
        id SERIAL PRIMARY KEY,
        restaurant_name TEXT DEFAULT 'Kumbisaly Heritage Restaurant',
        owner_name TEXT DEFAULT '',
        email TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        address TEXT DEFAULT 'Offinso - Abofour, Ashanti, Ghana.',
        logo TEXT DEFAULT '', -- Store Base64 or URL
        updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
        CONSTRAINT single_profile CHECK (id = 1)
      );
    `;
    console.log("Created restaurant_profile table.");

    // 3. Initialize default profile if empty
    console.log("Initializing default restaurant profile...");
    await sql`
      INSERT INTO restaurant_profile (id, restaurant_name, owner_name, email, phone, address, logo)
      VALUES (1, 'Kumbisaly Heritage Restaurant', '', '', '', 'Offinso - Abofour, Ashanti, Ghana.', '')
      ON CONFLICT (id) DO NOTHING;
    `;
    console.log("Initialized default restaurant profile.");

    // 4. Migrate data from settings table (if exists)
    console.log("Checking for existing settings data...");
    const settingsResult = await sql`SELECT data FROM settings WHERE id = 1`;
    if (settingsResult.length > 0) {
      const settings = settingsResult[0].data;
      if (settings && settings.account) {
        console.log("Migrating account data from settings JSONB...");
        const acc = settings.account;
        await sql`
          UPDATE restaurant_profile
          SET 
            restaurant_name = COALESCE(${acc.restaurantName}, restaurant_name),
            owner_name = COALESCE(${acc.ownerName}, owner_name),
            email = COALESCE(${acc.email}, email),
            phone = COALESCE(${acc.phone}, phone),
            address = COALESCE(${acc.address}, address),
            logo = COALESCE(${acc.logo}, logo),
            updated_at = NOW()
          WHERE id = 1;
        `;
        console.log("Migrated account data.");
      }
    }

    console.log("Schema update completed successfully.");
  } catch (error) {
    console.error("Schema update failed:", error);
    process.exit(1);
  }
}

main();
