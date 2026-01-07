
import { query } from "../lib/db";

async function run() {
  console.log("Optimizing rate limiting...");

  try {
    // Add index for faster rate limit checks
    await query(`
      CREATE INDEX IF NOT EXISTS idx_signup_attempts_created_at 
      ON signup_attempts(created_at);
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_signup_attempts_email_ip 
      ON signup_attempts(email, ip);
    `);

    console.log("Rate limiting optimization complete.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

run();
