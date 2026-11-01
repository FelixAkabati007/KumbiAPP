import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface PublicBrandResponse {
  restaurantName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  logo: string;
  updatedAt: string;
}

export async function GET() {
  try {
    // 1. First attempt to fetch from restaurant_profile (source of truth for profile/brand)
    const profileRes = await query<{
      restaurant_name: string | null;
      owner_name: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      logo: string | null;
      updated_at: string | null;
    }>(
      `SELECT restaurant_name, owner_name, email, phone, address, logo, updated_at
       FROM restaurant_profile
       WHERE id = 1
       LIMIT 1`
    );

    let brand: PublicBrandResponse = {
      restaurantName: "Kumbisaly Heritage Restaurant",
      ownerName: "",
      email: "info.kumbisalyheritagehotel@gmail.com",
      phone: "0535975442",
      address: "Offinso - Abofour, Ashanti, Ghana.",
      logo: "",
      updatedAt: new Date().toISOString(),
    };

    if (profileRes.rows.length > 0) {
      const row = profileRes.rows[0];
      brand = {
        restaurantName: row.restaurant_name?.trim() || brand.restaurantName,
        ownerName: row.owner_name?.trim() || brand.ownerName,
        email: row.email?.trim() || brand.email,
        phone: row.phone?.trim() || brand.phone,
        address: row.address?.trim() || brand.address,
        logo: row.logo?.trim() || "",
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : brand.updatedAt,
      };
    }

    // 2. If logo or name is empty in restaurant_profile, check settings JSONB
    if (!brand.logo || brand.restaurantName === "Kumbisaly Heritage Restaurant") {
      try {
        const settingsRes = await query<{ data: { account?: Partial<PublicBrandResponse> }; updated_at: string }>(
          `SELECT data, updated_at FROM settings WHERE id = 1 LIMIT 1`
        );
        if (settingsRes.rows.length > 0 && settingsRes.rows[0].data?.account) {
          const acc = settingsRes.rows[0].data.account;
          if (!brand.logo && acc.logo) brand.logo = acc.logo.trim();
          if (brand.restaurantName === "Kumbisaly Heritage Restaurant" && acc.restaurantName) {
            brand.restaurantName = acc.restaurantName.trim();
          }
        }
      } catch {
        // Ignore settings query error if offline/fallback
      }
    }

    return NextResponse.json(brand, {
      headers: {
        "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
        "X-Brand-Version": brand.updatedAt,
      },
    });
  } catch (error) {
    console.error("Public brand GET error:", error);
    return NextResponse.json(
      {
        restaurantName: "Kumbisaly Heritage Restaurant",
        ownerName: "",
        email: "info.kumbisalyheritagehotel@gmail.com",
        phone: "0535975442",
        address: "Offinso - Abofour, Ashanti, Ghana.",
        logo: "",
        updatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-cache" },
      }
    );
  }
}
