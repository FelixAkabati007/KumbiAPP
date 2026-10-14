import { describe, expect, it } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();
neonConfig.webSocketConstructor = ws;

const databaseUrl =
  process.env.KUMRESH_DB_DATABASE_URL || process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("inventory and menu unit conversion", () => {
  it("has valid active UOM rules for every converted inventory item", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const result = await pool.query(`
        SELECT u.inventory_id,
               u.purchase_unit,
               u.base_unit,
               u.conversion_factor_to_base,
               u.yield_factor
        FROM inventory_item_uoms u
        WHERE u.is_active = true
          AND (u.effective_to IS NULL OR u.effective_to > CURRENT_TIMESTAMP)
      `);

      for (const row of result.rows) {
        expect(row.inventory_id).toBeTruthy();
        expect(String(row.purchase_unit)).not.toBe("");
        expect(String(row.base_unit)).not.toBe("");
        expect(Number(row.conversion_factor_to_base)).toBeGreaterThan(0);
        expect(Number(row.yield_factor)).toBeGreaterThan(0);
      }
    } finally {
      await pool.end();
    }
  }, 30000);

  it("resolves menu recipe requirements through the active UOM rule", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const result = await pool.query(`
        SELECT ri.menu_item_id,
               ri.inventory_item_id,
               ri.quantity AS recipe_quantity,
               ri.unit AS recipe_unit,
               i.quantity AS stock_quantity,
               COALESCE(u.base_unit, i.base_unit, i.unit) AS stock_unit,
               COALESCE(u.conversion_factor_to_base * u.yield_factor, i.conversion_ratio, 1) AS conversion_ratio
        FROM recipe_ingredients ri
        JOIN inventory i ON i.id = ri.inventory_item_id
        LEFT JOIN LATERAL (
          SELECT base_unit, conversion_factor_to_base, yield_factor
          FROM inventory_item_uoms
          WHERE inventory_id = i.id
            AND purchase_unit = LOWER(TRIM(i.unit))
            AND is_active = true
            AND (effective_to IS NULL OR effective_to > CURRENT_TIMESTAMP)
          ORDER BY effective_from DESC
          LIMIT 1
        ) u ON true
        WHERE ri.quantity > 0
      `);

      for (const row of result.rows) {
        expect(row.menu_item_id).toBeTruthy();
        expect(row.inventory_item_id).toBeTruthy();
        expect(Number(row.recipe_quantity)).toBeGreaterThan(0);
        expect(String(row.recipe_unit)).not.toBe("");
        expect(String(row.stock_unit)).not.toBe("");
        expect(Number(row.conversion_ratio)).toBeGreaterThan(0);
        expect(Number(row.recipe_quantity) * Number(row.conversion_ratio)).toBeGreaterThan(0);
      }
    } finally {
      await pool.end();
    }
  }, 30000);

  it("completes inventory to menu to order deduction arithmetic", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const result = await pool.query(`
        SELECT i.id AS inventory_id,
               ri.menu_item_id,
               ri.quantity AS recipe_quantity,
               ri.unit AS recipe_unit,
               i.quantity AS stock_quantity,
               COALESCE(u.base_unit, i.base_unit, i.unit) AS stock_unit,
               COALESCE(u.conversion_factor_to_base * u.yield_factor, i.conversion_ratio, 1) AS conversion_ratio
        FROM inventory i
        JOIN recipe_ingredients ri ON ri.inventory_item_id = i.id
        LEFT JOIN LATERAL (
          SELECT base_unit, conversion_factor_to_base, yield_factor
          FROM inventory_item_uoms
          WHERE inventory_id = i.id
            AND purchase_unit = LOWER(TRIM(i.unit))
            AND is_active = true
            AND (effective_to IS NULL OR effective_to > CURRENT_TIMESTAMP)
          ORDER BY effective_from DESC
          LIMIT 1
        ) u ON true
        WHERE ri.quantity > 0
        LIMIT 1
      `);

      if (result.rows.length === 0) return;
      const row = result.rows[0];
      const requiredStock = Number(row.recipe_quantity) * Number(row.conversion_ratio);
      const remainingStock = Number(row.stock_quantity) - requiredStock;
      expect(row.inventory_id).toBeTruthy();
      expect(row.menu_item_id).toBeTruthy();
      expect(requiredStock).toBeGreaterThan(0);
      expect(Number.isFinite(remainingStock)).toBe(true);
    } finally {
      await pool.end();
    }
  }, 30000);

  it("has no duplicate active UOM rules for one inventory purchase unit", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const result = await pool.query(`
        SELECT inventory_id, purchase_unit, COUNT(*)::int AS active_count
        FROM inventory_item_uoms
        WHERE is_active = true
          AND (effective_to IS NULL OR effective_to > CURRENT_TIMESTAMP)
        GROUP BY inventory_id, purchase_unit
        HAVING COUNT(*) > 1
      `);

      expect(result.rows).toEqual([]);
    } finally {
      await pool.end();
    }
  }, 30000);
});
