import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requirePermission } from "@/lib/api-auth";
import { saveDatabaseBlob } from "@/lib/blob-storage";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

export async function POST(request: NextRequest) {
  try {
    const { error } = await requirePermission("rooms");
    if (error) return error;

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file is an image
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 }
      );
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size must be less than 5MB" },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const ext = file.type.split("/")[1] ?? "jpg";
    const filename = `room-image-${timestamp}-${random}.${ext}`;

    // Upload File (Blob) directly — with fallback to database blob storage
    let blobUrl: string;
    try {
      const blob = await put(filename, file, {
        access: "public",
        addRandomSuffix: false,
      });
      blobUrl = blob.url;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("No token found") || errorMsg.includes("BLOB_READ_WRITE_TOKEN") || !process.env.BLOB_READ_WRITE_TOKEN) {
        const dbBlob = await saveDatabaseBlob(filename, file, file.type || "image/jpeg");
        blobUrl = dbBlob.url;
      } else {
        throw err;
      }
    }

    return NextResponse.json({
      url: blobUrl,
      type: "blob",
      uploaded_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}
