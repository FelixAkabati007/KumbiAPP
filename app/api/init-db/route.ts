import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { ensureCoreSchemaAndIndexes } from "@/lib/db/ensure-core-indexes";

export async function GET() {
  try {
    const { error } = await requireRole("admin");
    if (error) return error;

    const results: string[] = [];

    // 1. Enable UUID extension
    try {
      await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
      results.push("UUID extension enabled");
    } catch (e) {
      results.push(`UUID extension error: ${e}`);
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
    } catch (e) {
      results.push(`Settings table error: ${e}`);
    }

    // 3. Create Kitchen Orders Table (canonical column names created_at / updated_at)
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
          created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
          estimatedtime INT,
          notes TEXT,
          chefnotes TEXT,
          performed_by UUID,
          kitchen_closed_at TIMESTAMPTZ
        );
      `);
      results.push("KitchenOrders table verified");
    } catch (e) {
      results.push(`KitchenOrders table error: ${e}`);
    }

    // 4. Create Menu Items Table
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS public.menu_items (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR NOT NULL,
          description TEXT,
          price NUMERIC NOT NULL,
          category_id UUID,
          barcode VARCHAR,
          is_available BOOLEAN NOT NULL DEFAULT true,
          image_url TEXT,
          created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
          updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
        );
      `);
      results.push("MenuItems table verified");
    } catch (e) {
      results.push(`MenuItems table error: ${e}`);
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
          CONSTRAINT kitchen_orderitems_kitchenorderid_fkey FOREIGN KEY (kitchenorderid) REFERENCES public.kitchenorders(id) ON DELETE CASCADE
        );
      `);
      results.push("KitchenOrderItems table verified");
    } catch (e) {
      results.push(`KitchenOrderItems table error: ${e}`);
    }

    // 6. Create Indexes & Canonical Roles
    try {
      await query(
        `CREATE INDEX IF NOT EXISTS idx_kitchenorders_status ON public.kitchenorders(status);`,
      );
      await query(
        `CREATE INDEX IF NOT EXISTS idx_kitchenorders_date ON public.kitchenorders(created_at);`,
      );
      await ensureCoreSchemaAndIndexes();
      results.push("Core schema, roles, and composite indexes verified");
    } catch (e) {
      results.push(`Indexes error: ${e}`);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Database initialization failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Database initialization failed",
        details: String(error),
      },
      { status: 500 },
    );
  }
}
