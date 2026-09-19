import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;
  const certificate = process.env.QZ_CERTIFICATE;
  if (!certificate) return NextResponse.json({ error: "QZ certificate is not configured" }, { status: 503 });
  return new NextResponse(certificate, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
