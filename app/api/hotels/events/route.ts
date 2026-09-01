import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

async function getChangeToken() {
  const result = await query(`
    SELECT md5(COALESCE(string_agg(value, '|' ORDER BY value), '')) AS token
    FROM (
      SELECT 'r:' || id || ':' || status || ':' || COALESCE(updated_at::text, '') AS value FROM reservations
      UNION ALL SELECT 'rm:' || id || ':' || status || ':' || COALESCE(updated_at::text, '') FROM rooms
      UNION ALL SELECT 'hk:' || id || ':' || status || ':' || COALESCE(updated_at::text, '') FROM housekeeping_tasks
      UNION ALL SELECT 'ht:' || id || ':' || status || ':' || COALESCE(updated_at::text, '') FROM housekeeping_tickets
    ) changes
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
