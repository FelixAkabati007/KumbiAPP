import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { broadcastSSEPayload, getRealtimeClients } from "@/lib/realtime";

export const runtime = "nodejs";

const encoder = new TextEncoder();

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = getRealtimeClients();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let client: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      client = controller;
      clients.add(controller);
      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"connected":true}\n\n`),
      );
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: heartbeat\ndata: {"at":"${new Date().toISOString()}"}\n\n`,
            ),
          );
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          clients.delete(controller);
        }
      }, 20_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      clients.delete(client);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  const internalKey = request.headers.get("x-internal-realtime-key");
  const expectedSecret = process.env.JWT_SECRET || "your-secret-key-change-me";
  const isInternalAuthorized = Boolean(internalKey && internalKey === expectedSecret);

  if (!isInternalAuthorized) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const event = await request.json().catch(() => null);
  if (!event || typeof event.topic !== "string") {
    return NextResponse.json(
      { error: "A realtime topic is required." },
      { status: 400 },
    );
  }

  const delivered = broadcastSSEPayload(event.topic, event.resource ?? null);
  return NextResponse.json({ published: true, delivered });
}

export const dynamic = "force-dynamic";
export const preferredRegion = "home";
