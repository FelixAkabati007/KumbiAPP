import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { z } from "zod";

// Base64 data URLs inflate size by ~33%; cap the encoded string so the
// decoded image stays within a reasonable ~6MB bound (client already
// enforces 5MB on the original file before encoding).
const MAX_AVATAR_DATA_URL_LENGTH = 8 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_PREFIXES = [
  "data:image/png",
  "data:image/jpeg",
  "data:image/jpg",
  "data:image/webp",
  "data:image/gif",
];

const avatarSchema = z.object({
  avatar: z
    .string()
    .nullable()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => {
        if (!value) return true; // empty/null clears the avatar
        if (value.length > MAX_AVATAR_DATA_URL_LENGTH) return false;
        // Predefined avatar paths (e.g. "/placeholder-user.jpg") are also allowed
        if (value.startsWith("/")) return true;
        return ALLOWED_IMAGE_MIME_PREFIXES.some((prefix) =>
          value.startsWith(prefix),
        );
      },
      { message: "Avatar must be a valid image (png, jpeg, webp, gif) under the size limit" },
    ),
});

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json();
    const result = avatarSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Invalid data" },
        { status: 400 },
      );
    }

    const { avatar } = result.data;

    // Update user's avatar
    await query(
      `
      UPDATE users 
      SET avatar_url = $1, updated_at = NOW()
      WHERE id = $2
    `,
      [avatar || null, session.id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update avatar:", error);
    return NextResponse.json(
      { error: "Failed to update avatar" },
      { status: 500 }
    );
  }
}
