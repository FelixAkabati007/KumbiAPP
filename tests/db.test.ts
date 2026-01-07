import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

describe("Database Schema Integration Tests", () => {
  let pool: Pool;

  beforeAll(() => {
    if (!connectionString) {
      throw new Error("DATABASE_URL not set");
    }
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should connect to the database", async () => {
    const client = await pool.connect();
    const res = await client.query("SELECT NOW()");
    expect(res.rows).toHaveLength(1);
    client.release();
  });

  it("should have all required tables", async () => {
    const client = await pool.connect();
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = res.rows.map((r: any) => r.table_name);
    
    expect(tables).toContain("users");
    expect(tables).toContain("menu_items");
    expect(tables).toContain("orders");
    expect(tables).toContain("transactions");
    expect(tables).toContain("inventory");
    
    client.release();
  });

  it("should allow inserting a test category", async () => {
    const client = await pool.connect();
    const testSlug = `test-cat-${Date.now()}`;
    try {
        const res = await client.query(
            "INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING *",
            [`Test Category ${Date.now()}`, testSlug]
        );
        expect(res.rows[0].slug).toBe(testSlug);
        
        // Clean up
        await client.query("DELETE FROM categories WHERE slug = $1", [testSlug]);
    } finally {
        client.release();
    }
  });
});
