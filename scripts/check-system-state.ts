import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function check() {
  const { query } = await import("../lib/db");
  try {
    const res = await query("SELECT * FROM system_state");
    console.log("System State Rows:", res.rows);
  } catch (e) {
    console.error("Error:", e);
  }
}

check();
