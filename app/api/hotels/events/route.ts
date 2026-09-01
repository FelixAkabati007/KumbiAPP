import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

async function getChangeToken() {
  const result = await query<{ token: string }>(`
    SELECT md5(concat_ws('|',
      COALESCE((SELECT MAX(updated_at) FROM reservations), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(updated_at) FROM rooms), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(updated_at) FROM housekeeping_tasks), 'epoch'::timestamptz),
      (SELECT COUNT(*) FROM reservations),
      (SELECT COUNT(*) FROM rooms),
      (SELECT COUNT(*) FROM housekeeping_tasks)
    )) AS token
  `);
  return result.rows[0]?.token ?? "empty";
}

export async function GET(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let previousToken: string | null = null;
      const send = (event: string, data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const close = () => {
        if (!closed) { closed = true; clearInterval(interval); controller.close(); }
      };
      request.signal.addEventListener("abort", close);
      const poll = async () => {
        if (closed) return;
        try {
          const token = await getChangeToken();
          if (previousToken === null) { previousToken = token; send("ready", { token }); }
          else if (token !== previousToken) { previousToken = token; send("change", { token }); }
        } catch { send("error", { message: "Live hotel sync temporarily unavailable" }); }
      };
      const interval = setInterval(poll, 1000);
      send("connected", { intervalMs: 1000 });
      await poll();
      const heartbeat = setInterval(() => send("heartbeat", { at: Date.now() }), 15000);
      request.signal.addEventListener("abort", () => clearInterval(heartbeat));
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
