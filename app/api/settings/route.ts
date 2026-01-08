import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { updateSystemState } from "@/lib/system-sync";

const settingsSchema = z
  .object({
    account: z
      .object({
        restaurantName: z.string().optional(),
        ownerName: z.string().optional(),
        email: z.union([z.string().email(), z.literal("")]).optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        logo: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export async function GET() {
  try {
    // Fetch settings JSONB
    const settingsRes = await query("SELECT data FROM settings WHERE id = 1");
    let settingsData =
      settingsRes.rows.length > 0 ? settingsRes.rows[0].data : {};

    // Fetch restaurant profile
    const profileRes = await query(`
      SELECT restaurant_name, owner_name, email, phone, address, logo 
      FROM restaurant_profile WHERE id = 1
    `);

    if (profileRes.rows.length > 0) {
      const profile = profileRes.rows[0];
      // Merge into settingsData.account
      settingsData = {
        ...settingsData,
        account: {
          restaurantName: profile.restaurant_name,
          ownerName: profile.owner_name,
          email: profile.email,
          phone: profile.phone,
          address: profile.address,
          logo: profile.logo,
        },
      };
    } else {
      // If no profile exists (shouldn't happen due to migration), provide defaults
      settingsData = {
        ...settingsData,
        account: settingsData.account || {
          restaurantName: "Kumbisaly Heritage Restaurant",
          ownerName: "",
          email: "",
          phone: "",
          address: "123 Main Street, Accra, Ghana",
          logo: "",
        },
      };
    }

    // Ensure we return an empty object if data is null/undefined to prevent client crashes
    return NextResponse.json(settingsData || {});
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    // Only admin can update global settings
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const json = await req.json();

    // Validate data using Zod
    const result = settingsSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid settings data", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const data = result.data;

    // Extract account data
    const account = data.account;

    // Update restaurant_profile if account data exists
    if (account) {
      await query(
        `
        INSERT INTO restaurant_profile (id, restaurant_name, owner_name, email, phone, address, logo, updated_at)
        VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id) DO UPDATE
        SET 
          restaurant_name = EXCLUDED.restaurant_name,
          owner_name = EXCLUDED.owner_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          address = EXCLUDED.address,
          logo = EXCLUDED.logo,
          updated_at = NOW()
      `,
        [
          account.restaurantName || "",
          account.ownerName || "",
          account.email || "",
          account.phone || "",
          account.address || "",
          account.logo || "",
        ]
      );
    }

    // Update settings JSONB (excluding account to keep source of truth in restaurant_profile)
    const settingsToSave = { ...data };
    delete settingsToSave.account;

    await query(
      `
      INSERT INTO settings (id, data, updated_at)
      VALUES (1, $1, NOW())
      ON CONFLICT (id) DO UPDATE
      SET data = $1, updated_at = NOW()
    `,
      [JSON.stringify(settingsToSave)]
    );

    // Audit and Sync
    await logAudit({
      performedBy: session.id,
      action: "UPDATE_SETTINGS",
      entityType: "SYSTEM_SETTINGS",
      entityId: "1",
      details: data,
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    await updateSystemState("settings");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
