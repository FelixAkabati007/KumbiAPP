import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await query("SELECT logo FROM restaurant_profile WHERE id = 1");
  const logo = result.rows[0]?.logo;
  const icon = typeof logo === "string" && logo.length > 0 ? "/favicon.ico" : "/app-icon.png";

  return NextResponse.json({
    name: "Kumbisaly Heritage Restaurant POS",
    short_name: "Kumbisaly POS",
    description: "Point of Sale, inventory, finance, and operations management for Kumbisaly Heritage Restaurant.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: icon, sizes: "64x64", type: "image/png", purpose: "any maskable" },
      { src: icon, sizes: "32x32", type: "image/png", purpose: "any" },
    ],
  }, { headers: { "Cache-Control": "no-store" } });
}
