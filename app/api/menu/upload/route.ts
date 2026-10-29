import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveDatabaseBlob } from "@/lib/blob-storage";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || !["admin", "manager", "restaurantManager"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "An image file is required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, and WebP images are supported" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "Image must be 5MB or smaller" }, { status: 400 });
    }

    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const pathname = `menu-items/${crypto.randomUUID()}.${extension}`;
    let blobUrl: string;

    try {
      const blob = await put(pathname, file, {
        access: "public",
        addRandomSuffix: false,
        contentType: file.type,
      });
      blobUrl = blob.url;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("No token found") || errorMsg.includes("BLOB_READ_WRITE_TOKEN") || !process.env.BLOB_READ_WRITE_TOKEN) {
        const dbBlob = await saveDatabaseBlob(pathname, file, file.type);
        blobUrl = dbBlob.url;
      } else {
        throw err;
      }
    }

    return NextResponse.json({ url: blobUrl });
  } catch (error) {
    console.error("Menu image upload failed:", error);
    return NextResponse.json({ error: "Failed to upload menu image" }, { status: 500 });
  }
}
