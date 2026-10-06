import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { canonicalizeReceipt } from "@/lib/canonical-receipts";
import { upsertCanonicalReceipt } from "@/lib/server/canonical-receipts-repository";

export async function POST(request: Request) {
  const auth = await requireSession();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const identity = body?.identity ?? body;
    if (!identity?.entityId || !identity?.receiptNumber) {
      return NextResponse.json({ error: "entityId and receiptNumber are required" }, { status: 400 });
    }
    const receipt = canonicalizeReceipt({
      ...identity,
      printMethod: body.printMethod ?? identity.printMethod,
      payload: body.payload ?? {},
    });
    const result = await upsertCanonicalReceipt({ ...receipt.identity, printMethod: receipt.printMethod, payload: receipt.payload, requestedBy: auth.session.id });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[v0] canonical receipt persistence failed", error);
    return NextResponse.json({ error: "Unable to persist canonical receipt" }, { status: 500 });
  }
}
