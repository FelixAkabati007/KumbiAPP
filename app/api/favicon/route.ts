import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const BLOB_PREFIX = "brand/favicons";
const SUPPORTED_FORMATS = ["image/x-icon", "image/png", "image/svg+xml"];
const MIN_DIMENSIONS = 16;
const MAX_DIMENSIONS = 512;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("favicon") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate the file
    const validation = await validateFile(file);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: "Invalid file", details: validation.errors },
        { status: 400 },
      );
    }

    const faviconUrls = await processAndUploadFavicon(file);

    // Keep the existing profile logo as the durable source of truth used by
    // /favicon.ico and the settings account tab.
    await query(
      `INSERT INTO restaurant_profile (id, logo, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET logo = EXCLUDED.logo, updated_at = NOW()`,
      [faviconUrls.png256],
    );

    return NextResponse.json({
      success: true,
      urls: faviconUrls,
      warnings: validation.warnings,
    });
  } catch (error) {
    console.error("Favicon upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function validateFile(file: File): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file type
  if (!SUPPORTED_FORMATS.includes(file.type)) {
    errors.push(
      `Unsupported format: ${file.type}. Supported formats: ICO, PNG, SVG`,
    );
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(
      `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum: 2MB`,
    );
  }

  // For non-SVG images, check dimensions using sharp
  if (file.type !== "image/svg+xml") {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(buffer).metadata();

      if (!metadata.width || !metadata.height) {
        errors.push("Could not read image dimensions");
        return { isValid: false, errors, warnings };
      }

      if (metadata.width !== metadata.height) {
        warnings.push(
          "Image is not square. It will be cropped to square aspect ratio.",
        );
      }

      if (metadata.width < MIN_DIMENSIONS || metadata.height < MIN_DIMENSIONS) {
        errors.push(
          `Image too small: ${metadata.width}x${metadata.height}. Minimum: ${MIN_DIMENSIONS}x${MIN_DIMENSIONS}`,
        );
      }

      if (metadata.width > MAX_DIMENSIONS || metadata.height > MAX_DIMENSIONS) {
        warnings.push(
          `Large image: ${metadata.width}x${metadata.height}. Will be resized for optimal performance.`,
        );
      }
    } catch {
      errors.push("Could not process image file");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

async function processAndUploadFavicon(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const version = `${Date.now()}-${crypto.randomUUID()}`;
  const urls: Record<string, string> = {};

  for (const size of [16, 32, 48, 64, 128, 256]) {
    const resizedBuffer = await sharp(buffer)
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    const blob = await put(`${BLOB_PREFIX}/favicon-${size}-${version}.png`, resizedBuffer, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });
    urls[`png${size}`] = blob.url;
    if (size === 32) urls.ico = blob.url;
  }

  if (file.type === "image/svg+xml") {
    const svgBlob = await put(`${BLOB_PREFIX}/favicon-${version}.svg`, buffer, {
      access: "public",
      contentType: "image/svg+xml",
      addRandomSuffix: false,
    });
    urls.svg = svgBlob.url;
  }

  return urls;
}

export async function GET() {
  return NextResponse.json({
    message: "Favicon API endpoint",
    supportedFormats: SUPPORTED_FORMATS,
    maxFileSize: MAX_FILE_SIZE,
    minDimensions: MIN_DIMENSIONS,
    maxDimensions: MAX_DIMENSIONS,
  });
}
