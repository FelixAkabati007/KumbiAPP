import { NextResponse } from "next/server";

const counters = {
  requests: 0,
  errors: 0,
};

export async function GET() {
  counters.requests += 1;
  return NextResponse.json({
    ...counters,
    timestamp: new Date().toISOString(),
  });
}
