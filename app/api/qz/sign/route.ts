import { NextResponse } from "next/server";
import { createSign } from "node:crypto";
import { requireSession } from "@/lib/api-auth";

export async function POST(request: Request) {
  const { error } = await requireSession();
  if (error) return error;
  const privateKey = process.env.QZ_PRIVATE_KEY;
  if (!privateKey) return NextResponse.json({ error: "QZ private key is not configured" }, { status: 503 });
  const body = (await request.json()) as { data?: string };
  if (!body.data) return NextResponse.json({ error: "Signing data is required" }, { status: 400 });
  const signer = createSign("RSA-SHA512");
  signer.update(body.data, "utf8");
  return new NextResponse(signer.sign(privateKey, "base64"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
