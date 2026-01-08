import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const avatarSchema = z.object({
  avatar: z.string().nullable().optional().or(z.literal("")),
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
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
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
