import { createClient } from "@neondatabase/neon-js";

// Ensure these environment variables are set in your .env file
const authUrl = process.env.NEON_AUTH_API_URL;

if (!authUrl && process.env.NODE_ENV !== "test") {
  console.info(
    "Note: NEON_AUTH_API_URL is not set. Using Neon PostgreSQL native authentication."
  );
}

// Initialize the Neon client
export const neonClient = createClient({
  auth: {
    url: authUrl || "https://dummy-auth-url.neon.tech", // Fallback to prevent crash during build/import if vars missing
  },
  dataApi: {
    url: "https://dummy-data-url.neon.tech",
  },
});
