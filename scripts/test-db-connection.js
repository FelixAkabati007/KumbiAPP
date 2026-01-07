const { Pool, neonConfig } = require("@neondatabase/serverless");
const ws = require("ws");
const fs = require("fs");
const path = require("path");

// Load .env file manually
const envPath = path.resolve(__dirname, "..", ".env");
const envLocalPath = path.resolve(__dirname, "..", ".env.local");

console.log("Checking env files at:", envPath, envLocalPath);

const loadEnv = (filePath) => {
  if (fs.existsSync(filePath)) {
    console.log("Found:", filePath);
    const envConfig = fs.readFileSync(filePath, "utf8");
    envConfig.split("\n").forEach((line) => {
      // Skip comments
      if (line.trim().startsWith("#")) return;
      
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, ""); // Remove quotes
        if (!process.env[key]) {
          console.log("Setting:", key);
          process.env[key] = value;
        }
      }
    });
  } else {
    console.log("Not found:", filePath);
  }
};

loadEnv(envPath);
loadEnv(envLocalPath);

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not defined");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function checkDb() {
  try {
    console.log("Connecting to DB...");
    const client = await pool.connect();
    console.log("Connected.");

    console.log("Checking tables...");
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    console.log(
      "Tables found:",
      res.rows.map((r) => r.table_name),
    );

    client.release();
    await pool.end();
  } catch (err) {
    console.error("DB Error:", err);
    process.exit(1);
  }
}

checkDb();
