import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getOrCreateVapidKeys,
  removeWebPushSubscription,
  saveWebPushSubscription,
  type WebPushSubscriptionInput,
} from "@/lib/web-push";
import { getUnreadNotificationCount } from "@/lib/server-notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [vapid, unreadCount] = await Promise.all([
      getOrCreateVapidKeys(),
      getUnreadNotificationCount(session.id),
    ]);

    return NextResponse.json(
      {
        publicKey: vapid.publicKey,
        unreadCount,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[notifications/push] Failed loading VAPID public key:", error);
    return NextResponse.json({ error: "Unable to initialize push notifications" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      subscription?: WebPushSubscriptionInput;
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    } | null;

    const sub: WebPushSubscriptionInput | null = body?.subscription?.endpoint
      ? body.subscription
      : body?.endpoint && body?.keys?.p256dh && body?.keys?.auth
      ? {
          endpoint: body.endpoint,
          keys: {
            p256dh: body.keys.p256dh,
            auth: body.keys.auth,
          },
        }
      : null;

    if (!sub) {
      return NextResponse.json({ error: "Valid push subscription is required" }, { status: 400 });
    }

    await saveWebPushSubscription({
      userId: session.id,
      userRole: session.role,
      subscription: sub,
      userAgent: request.headers.get("user-agent"),
    });

    const unreadCount = await getUnreadNotificationCount(session.id);

    return NextResponse.json(
      { ok: true, unreadCount },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[notifications/push] Failed saving push subscription:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to register push subscription" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  const endpoint = body?.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
  }

  await removeWebPushSubscription(endpoint, session?.id);
  return NextResponse.json({ ok: true });
}
