import { NextResponse } from "next/server";
import { getClient, query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { z } from "zod";
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
  .extend({
    theme: z.string().max(32).optional(),
    notifications: z.record(z.boolean()).optional(),
    system: z.record(z.unknown()).optional(),
    security: z.record(z.unknown()).optional(),
    businessName: z.string().max(200).optional(),
    businessAddress: z.string().max(500).optional(),
    businessPhone: z.string().max(64).optional(),
    businessEmail: z.union([z.string().email(), z.literal("")]).optional(),
    expectedVersion: z.number().int().positive().optional(),
  });

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch settings JSONB
    const settingsRes = await query("SELECT data, version FROM settings WHERE id = 1");
    let settingsData =
      settingsRes.rows.length > 0 && settingsRes.rows[0].data
        ? settingsRes.rows[0].data
        : {};

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
          address: "Offinso - Abofour, Ashanti, Ghana.",
          logo: "",
        },
      };
    }

    // Ensure we return an empty object if data is null/undefined to prevent client crashes
    return NextResponse.json({ ...(settingsData || {}), version: settingsRes.rows[0]?.version ?? 1 });
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
    if (!session || !["admin", "manager"].includes(session.role)) {
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
    if (session.role === "manager") {
      const allowedAccount = data.account
        ? { restaurantName: data.account.restaurantName, ownerName: data.account.ownerName, phone: data.account.phone, address: data.account.address, logo: data.account.logo }
        : undefined;
      const allowedSettings = { notifications: data.notifications, account: allowedAccount };
      Object.keys(data).forEach((key) => {
        if (!(key in allowedSettings)) delete (data as Record<string, unknown>)[key];
      });
      if (allowedAccount) data.account = allowedAccount;
    }

    const account = data.account;
    const expectedVersion = data.expectedVersion;
    const settingsToSave = { ...data };
    delete settingsToSave.account;
    delete settingsToSave.expectedVersion;
    const client = await getClient();

    try {
      await client.query("BEGIN");
      const current = await client.query<{ data: unknown; version: number }>(
        "SELECT data, version FROM settings WHERE id = 1 FOR UPDATE",
      );
      const currentVersion = current.rows[0]?.version ?? 1;
      if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Settings changed by another administrator", code: "SETTINGS_VERSION_CONFLICT", version: currentVersion },
          { status: 409 },
        );
      }

      if (account) {
        await client.query(
          `INSERT INTO restaurant_profile (id, restaurant_name, owner_name, email, phone, address, logo, updated_at)
           VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id) DO UPDATE SET restaurant_name = EXCLUDED.restaurant_name, owner_name = EXCLUDED.owner_name,
           email = EXCLUDED.email, phone = EXCLUDED.phone, address = EXCLUDED.address, logo = EXCLUDED.logo, updated_at = NOW()`,
          [account.restaurantName || "", account.ownerName || "", account.email || "", account.phone || "", account.address || "", account.logo || ""],
        );
      }

      const nextVersion = currentVersion + 1;
      const saved = await client.query(
        `INSERT INTO settings (id, data, version, updated_at) VALUES (1, $1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = NOW()
         WHERE settings.version = $3 RETURNING version`,
        [JSON.stringify(settingsToSave), nextVersion, currentVersion],
      );
      if (saved.rowCount !== 1) throw new Error("SETTINGS_VERSION_CONFLICT");

      await client.query(
        `INSERT INTO settings_change_log (settings_version, performed_by, action, before_data, after_data, ip_address)
         VALUES ($1, $2, 'UPDATE_SETTINGS', $3::jsonb, $4::jsonb, $5)`,
        [nextVersion, session.id, JSON.stringify(current.rows[0]?.data ?? {}), JSON.stringify(settingsToSave), req.headers.get("x-forwarded-for") || "unknown"],
      );
      await client.query("COMMIT");
      await updateSystemState("settings");
      return NextResponse.json({ success: true, version: nextVersion });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
