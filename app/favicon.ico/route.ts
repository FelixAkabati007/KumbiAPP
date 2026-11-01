import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { query } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

let cachedDefaultFavicon: Buffer | null = null;

async function getDefaultFavicon(): Promise<Buffer> {
  if (cachedDefaultFavicon) return cachedDefaultFavicon;
  try {
    const filePath = path.join(process.cwd(), "public", "favicon.svg");
    const svgBuffer = await fs.readFile(filePath);
    cachedDefaultFavicon = await sharp(svgBuffer)
      .resize(64, 64, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    return cachedDefaultFavicon;
  } catch {
    // Return minimal 1x1 transparent PNG if file reading fails
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64"
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    let logo: string | null | undefined = null;

    try {
      const result = await query<{ logo: string | null }>(
        "SELECT logo FROM restaurant_profile WHERE id = 1 LIMIT 1"
      );
      logo = result.rows[0]?.logo;
    } catch {
      // DB might be temporarily unavailable
    }

    if (!logo) {
      try {
        const settingsRes = await query<{ data: { account?: { logo?: string } } }>(
          "SELECT data FROM settings WHERE id = 1 LIMIT 1"
        );
        logo = settingsRes.rows[0]?.data?.account?.logo;
      } catch {
        // ignore
      }
    }

    let input: Buffer | null = null;

    if (logo && logo.startsWith("data:")) {
      const [, encoded] = logo.split(",", 2);
      if (encoded) {
        input = Buffer.from(encoded, "base64");
      }
    } else if (logo && (logo.startsWith("http://") || logo.startsWith("https://"))) {
      try {
        const response = await fetch(logo, { cache: "no-store" });
        if (response.ok) {
          input = Buffer.from(await response.arrayBuffer());
        }
      } catch {
        // ignore
      }
    } else if (logo && logo.startsWith("/")) {
      try {
        const localPath = path.join(process.cwd(), "public", logo.replace(/^\//, ""));
        input = await fs.readFile(localPath);
      } catch {
        // ignore
      }
    }

    if (!input) {
      const defaultBuffer = await getDefaultFavicon();
      return new NextResponse(new Uint8Array(defaultBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      });
    }

    const output = await sharp(input)
      .resize(64, 64, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        ETag: `W/"${output.length}-${(logo || "").slice(0, 32).length}"`,
      },
    });
  } catch (error) {
    console.error("Dynamic favicon error:", error);
    const defaultBuffer = await getDefaultFavicon();
    return new NextResponse(new Uint8Array(defaultBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache",
      },
    });
  }
}
