import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { saveCanonicalSettings, SettingsVersionConflict } from "@/lib/canonical-settings-service";

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
    if (!session || !["admin", "manager"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await saveCanonicalSettings({
      request: req,
      actorId: session.id,
      actorRole: session.role,
      patch: await req.json(),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof SettingsVersionConflict) {
      return NextResponse.json(
        { error: error.message, code: "SETTINGS_VERSION_CONFLICT", version: error.version },
        { status: 409 },
      );
    }
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
