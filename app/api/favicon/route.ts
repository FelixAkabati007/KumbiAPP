import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const FAVICON_DIR = path.join(process.cwd(), "public", "favicons");
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

    // Ensure favicon directory exists
    if (!existsSync(FAVICON_DIR)) {
      await mkdir(FAVICON_DIR, { recursive: true });
    }

    // Process and save the favicon
    const faviconUrls = await processAndSaveFavicon(file);

    // Persist metadata in Neon DB
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await query(
        `INSERT INTO favicons (original_name, mime_type, size, urls, data, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [file.name, file.type, file.size, JSON.stringify(faviconUrls), buffer],
      );
    } catch (dbErr) {
      console.error("Failed to persist favicon metadata:", dbErr);
      // Continue responding success; storage in /public/favicons is done
    }

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

async function processAndSaveFavicon(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const timestamp = Date.now();
  const urls: { [key: string]: string } = {};

  if (file.type === "image/svg+xml") {
    // Handle SVG files
    const svgPath = path.join(FAVICON_DIR, `favicon-${timestamp}.svg`);
    await writeFile(svgPath, buffer);

    // Convert SVG to PNG for different sizes
    const sizes = [16, 32, 48, 64, 128, 256];

    for (const size of sizes) {
      const pngBuffer = await sharp(buffer)
        .resize(size, size, { fit: "cover" })
        .png()
        .toBuffer();

      const pngPath = path.join(
        FAVICON_DIR,
        `favicon-${size}x${size}-${timestamp}.png`,
      );
      await writeFile(pngPath, pngBuffer);
      urls[`png${size}`] = `/favicons/favicon-${size}x${size}-${timestamp}.png`;
    }

    // Create ICO from 32x32 PNG
    const icoBuffer = await sharp(buffer)
      .resize(32, 32, { fit: "cover" })
      .png()
      .toBuffer();

    const icoPath = path.join(FAVICON_DIR, `favicon-${timestamp}.ico`);
    await writeFile(icoPath, icoBuffer);
    urls.ico = `/favicons/favicon-${timestamp}.ico`;
    urls.svg = `/favicons/favicon-${timestamp}.svg`;
  } else {
    // Handle PNG/ICO files
    const sizes = [16, 32, 48, 64, 128, 256];

    for (const size of sizes) {
      const resizedBuffer = await sharp(buffer)
        .resize(size, size, { fit: "cover" })
        .png()
        .toBuffer();

      const pngPath = path.join(
        FAVICON_DIR,
        `favicon-${size}x${size}-${timestamp}.png`,
      );
      await writeFile(pngPath, resizedBuffer);
      urls[`png${size}`] = `/favicons/favicon-${size}x${size}-${timestamp}.png`;
    }

    // Create ICO file (using 32x32 as base)
    const icoBuffer = await sharp(buffer)
      .resize(32, 32, { fit: "cover" })
      .png()
      .toBuffer();

    const icoPath = path.join(FAVICON_DIR, `favicon-${timestamp}.ico`);
    await writeFile(icoPath, icoBuffer);
    urls.ico = `/favicons/favicon-${timestamp}.ico`;
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
