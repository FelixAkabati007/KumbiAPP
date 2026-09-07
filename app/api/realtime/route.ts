import { NextResponse } from "next/server";

export const runtime = "nodejs";

const encoder = new TextEncoder();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

export function GET() {
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let client: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = controller;
      clients.add(controller);
      controller.enqueue(encoder.encode(`event: connected\ndata: {"connected":true}\n\n`));
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`event: heartbeat\ndata: {"at":"${new Date().toISOString()}"}\n\n`)), 20_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      clients.delete(client);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

export async function POST(request: Request) {
  const event = await request.json().catch(() => null);
  if (!event || typeof event.topic !== "string") return NextResponse.json({ error: "A realtime topic is required." }, { status: 400 });
  const payload = encoder.encode(`event: ${event.topic}\ndata: ${JSON.stringify({ topic: event.topic, resource: event.resource ?? null, at: new Date().toISOString() })}\n\n`);
  for (const client of Array.from(clients)) {
    try { client.enqueue(payload); } catch { clients.delete(client); }
  }
  return NextResponse.json({ published: true });
}

export const dynamic = "force-dynamic";
export const preferredRegion = "home";

void clients;
