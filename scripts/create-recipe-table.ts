import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("Creating recipe_ingredients table...");

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS recipe_ingredients (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
        inventory_item_id UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
        quantity DECIMAL(10, 4) NOT NULL,
        unit VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(menu_item_id, inventory_item_id)
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_menu_item ON recipe_ingredients(menu_item_id);
    `;

    console.log("Table recipe_ingredients created successfully.");
  } catch (error) {
    console.error("Failed to create table:", error);
    process.exit(1);
  }
}

main();
