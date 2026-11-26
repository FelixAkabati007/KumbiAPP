import { NextResponse } from "next/server";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { dispatchWorkforceShiftReminders } from "@/lib/workforce-schedule";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const canonicalNow = await getCanonicalTransactionTimestamp();
    const { created } = await dispatchWorkforceShiftReminders({ referenceTimestamp: canonicalNow });
    return NextResponse.json(
      { apiVersion: "2", created },
      { headers: { "X-API-Version": "2", "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    console.error("[v2/workforce] scheduled reminder failed", cause);
    return NextResponse.json({ apiVersion: "2", error: "Unable to run shift reminders" }, { status: 500 });
  }
}
