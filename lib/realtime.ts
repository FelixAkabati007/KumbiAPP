export async function publishRealtime(topic: string, resource: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await fetch(`${origin}/api/realtime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, resource }),
    cache: "no-store",
  }).catch(() => undefined);
}
