import { NextResponse } from "next/server";
import sharp from "sharp";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fallback = () => NextResponse.redirect(new URL("/favicon.svg", "http://localhost"));

export async function GET() {
  try {
    const result = await query("SELECT logo FROM restaurant_profile WHERE id = 1");
    const logo = result.rows[0]?.logo as string | null | undefined;
    if (!logo) return fallback();

    let input: Buffer;
    if (logo.startsWith("data:")) {
      const [, encoded] = logo.split(",", 2);
      input = Buffer.from(encoded || "", "base64");
    } else {
      const response = await fetch(logo, { cache: "no-store" });
      if (!response.ok) return fallback();
      input = Buffer.from(await response.arrayBuffer());
    }

    const output = await sharp(input)
      .resize(64, 64, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache, must-revalidate",
        ETag: `W/\"${output.length}-${result.rows[0]?.logo?.length || 0}\"`,
      },
    });
  } catch (error) {
    console.error("Dynamic favicon error:", error);
    return fallback();
  }
}
