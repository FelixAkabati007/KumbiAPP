import fs from "fs";
import path from "path";

// Load .env.local manually for this script
const envLocalPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envLocalPath)) {
  const envConfig = fs.readFileSync(envLocalPath, "utf8");
  envConfig.split("\n").forEach((line) => {
    if (line.trim().startsWith("#")) return;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

console.log("DATABASE_URL present:", !!process.env.DATABASE_URL);

async function main() {
  try {
    const { query } = await import("../lib/db");
    console.log("Initializing DB...");

    const results = [];

    // 1. Enable UUID extension
    try {
      await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
      results.push("UUID extension enabled");
      console.log("UUID extension enabled");
    } catch (e) {
      results.push(`UUID extension error: ${e}`);
      console.error(`UUID extension error: ${e}`);
    }

    // 2. Create Settings Table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS public.settings (
          id INT PRIMARY KEY DEFAULT 1,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
          CONSTRAINT single_row CHECK (id = 1)
        );
      `);
      results.push("Settings table created");
      console.log("Settings table created");
    } catch (e) {
      results.push(`Settings table error: ${e}`);
      console.error(`Settings table error: ${e}`);
    }

    // 3. Create Kitchen Orders Table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS public.kitchenorders (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          ordernumber VARCHAR NOT NULL UNIQUE,
          total NUMERIC NOT NULL,
          ordertype VARCHAR NOT NULL,
          tablenumber VARCHAR,
          customername VARCHAR,
          paymentmethod VARCHAR NOT NULL,
          status VARCHAR NOT NULL DEFAULT 'pending',
          priority VARCHAR NOT NULL DEFAULT 'normal',
          createdat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
          updatedat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
          estimatedtime INT,
          notes TEXT,
          chefnotes TEXT
        );
      `);
      results.push("KitchenOrders table created");
      console.log("KitchenOrders table created");
    } catch (e) {
      results.push(`KitchenOrders table error: ${e}`);
      console.error(`KitchenOrders table error: ${e}`);
    }

    // 4. Create Menu Items Table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS public.menuitems (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR NOT NULL,
          description TEXT,
          price NUMERIC NOT NULL,
          category VARCHAR NOT NULL,
          barcode VARCHAR,
          instock BOOLEAN NOT NULL DEFAULT true,
          image VARCHAR,
          created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
          updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
        );
      `);
      results.push("MenuItems table created");
      console.log("MenuItems table created");
    } catch (e) {
      results.push(`MenuItems table error: ${e}`);
      console.error(`MenuItems table error: ${e}`);
    }

    // 5. Create Kitchen Order Items Table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS public.kitchen_orderitems (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          kitchenorderid UUID NOT NULL,
          menuitemid UUID,
          name VARCHAR NOT NULL,
          description TEXT,
          price NUMERIC NOT NULL,
          category VARCHAR NOT NULL,
          barcode VARCHAR,
          instock BOOLEAN NOT NULL DEFAULT true,
          image VARCHAR,
          quantity INT NOT NULL,
          status VARCHAR DEFAULT 'pending',
          preptime INT,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
          CONSTRAINT kitchen_orderitems_kitchenorderid_fkey FOREIGN KEY (kitchenorderid) REFERENCES public.kitchenorders(id) ON DELETE CASCADE,
          CONSTRAINT kitchen_orderitems_menuitemid_fkey FOREIGN KEY (menuitemid) REFERENCES public.menuitems(id) ON DELETE SET NULL
        );
      `);
      results.push("KitchenOrderItems table created");
      console.log("KitchenOrderItems table created");
    } catch (e) {
      results.push(`KitchenOrderItems table error: ${e}`);
      console.error(`KitchenOrderItems table error: ${e}`);
    }

    // 6. Create Indexes
    try {
      await query(`CREATE INDEX IF NOT EXISTS idx_kitchenorders_status ON public.kitchenorders(status);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_kitchenorders_date ON public.kitchenorders(createdat);`);
      results.push("Indexes created");
      console.log("Indexes created");
    } catch (e) {
      results.push(`Indexes error: ${e}`);
      console.error(`Indexes error: ${e}`);
    }

    console.log("Initialization complete:", results);
    process.exit(0);

  } catch (error) {
    console.error("Initialization failed:", error);
    process.exit(1);
  }
}

main();
