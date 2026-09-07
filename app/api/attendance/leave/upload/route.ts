import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maxBytes = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Select a medical report" }, { status: 400 });
  if (!allowedTypes.has(file.type) || file.size > maxBytes) return NextResponse.json({ error: "Upload a PDF, JPG, or PNG under 10 MB" }, { status: 400 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
  const blob = await put(`medical-reports/${session.id}/${crypto.randomUUID()}-${safeName}`, file, { access: "private", contentType: file.type });
  return NextResponse.json({ pathname: blob.pathname });
}
