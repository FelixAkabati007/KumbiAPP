import { updateSystemState } from "@/lib/system-sync";

type SyncEntity = "inventory" | "menu" | "orders" | "settings";

const encoder = new TextEncoder();

const globalForRealtime = globalThis as unknown as {
  __kumbiRealtimeClients?: Set<ReadableStreamDefaultController<Uint8Array>>;
};

export function getRealtimeClients(): Set<ReadableStreamDefaultController<Uint8Array>> {
  if (!globalForRealtime.__kumbiRealtimeClients) {
    globalForRealtime.__kumbiRealtimeClients = new Set();
  }
  return globalForRealtime.__kumbiRealtimeClients;
}

export function broadcastSSEPayload(topic: string, resource: string | null = null): number {
  const clients = getRealtimeClients();
  const payload = encoder.encode(
    `event: ${topic}\ndata: ${JSON.stringify({
      topic,
      resource,
      at: new Date().toISOString(),
    })}\n\n`,
  );

  let delivered = 0;
  for (const client of Array.from(clients)) {
    try {
      client.enqueue(payload);
      delivered += 1;
    } catch {
      clients.delete(client);
    }
  }
  return delivered;
}

function mapTopicToSyncEntity(topic: string, resource?: string): SyncEntity {
  const combined = `${topic} ${resource ?? ""}`.toLowerCase();
  if (combined.includes("inventory") || combined.includes("variance") || combined.includes("stock")) {
    return "inventory";
  }
  if (combined.includes("menu")) {
    return "menu";
  }
  if (combined.includes("order") || combined.includes("kitchen")) {
    return "orders";
  }
  return "settings";
}

export async function publishRealtime(topic: string, resource: string) {
  try {
    // 1. Immediate in-process SSE broadcast (zero network loopback latency)
    broadcastSSEPayload(topic, resource);

    // 2. Bump canonical PostgreSQL sync cursor so cross-instance/polling clients also sync
    const syncEntity = mapTopicToSyncEntity(topic, resource);
    await updateSystemState(syncEntity).catch(() => undefined);
  } catch {
    // Non-fatal in background notification path
  }
}
