import crypto from "node:crypto";
import { query } from "@/lib/db";

export type PushQueryExecutor = <R = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<{ rows: R[]; rowCount?: number | null }>;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface WebPushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface StoredPushSubscription extends WebPushSubscriptionInput {
  id: string;
  userId: string;
  userRole: string | null;
}

export interface WebPushEnvelope {
  type: "kumbi_notification";
  notificationId?: string;
  title?: string;
  body?: string;
  category?: string;
  url?: string;
  tag?: string;
  unreadCount: number;
  silent?: boolean;
  sentAt: string;
}

let pushSchemaEnsured = false;
let cachedVapidKeys: VapidKeys | null = null;

export function decodeBase64UrlOrStandard(input: string): Buffer {
  const normalized = String(input ?? "")
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad === 0 ? normalized : normalized + "=".repeat(4 - pad);
  return Buffer.from(padded, "base64");
}

export function generateVapidKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const pubJwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
  const privJwk = privateKey.export({ format: "jwk" }) as { d: string };

  const uncompressedPublic = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(pubJwk.x, "base64url"),
    Buffer.from(pubJwk.y, "base64url"),
  ]).toString("base64url");

  return {
    publicKey: uncompressedPublic,
    privateKey: privJwk.d,
  };
}

export async function ensureWebPushSchema(
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<void> {
  if (pushSchemaEnsured && executor === (query as unknown as PushQueryExecutor)) {
    return;
  }

  await executor(
    `CREATE TABLE IF NOT EXISTS push_vapid_config (
       id INT PRIMARY KEY CHECK (id = 1),
       public_key TEXT NOT NULL,
       private_key TEXT NOT NULL,
       created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  ).catch(() => undefined);

  await executor(
    `CREATE TABLE IF NOT EXISTS web_push_subscriptions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id VARCHAR(255) NOT NULL,
       user_role VARCHAR(50),
       endpoint TEXT UNIQUE NOT NULL,
       p256dh TEXT NOT NULL,
       auth TEXT NOT NULL,
       user_agent TEXT,
       created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  ).catch(() => undefined);

  await executor(
    `CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id ON web_push_subscriptions(user_id)`,
  ).catch(() => undefined);

  await executor(
    `CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_role ON web_push_subscriptions(user_role)`,
  ).catch(() => undefined);

  if (executor === (query as unknown as PushQueryExecutor)) {
    pushSchemaEnsured = true;
  }
}

export async function getOrCreateVapidKeys(
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<VapidKeys> {
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@kumbisaly.com";

  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim(),
      privateKey: process.env.VAPID_PRIVATE_KEY.trim(),
      subject,
    };
  }

  if (cachedVapidKeys && executor === (query as unknown as PushQueryExecutor)) {
    return cachedVapidKeys;
  }

  await ensureWebPushSchema(executor);

  const existing = await executor<{ public_key: string; private_key: string }>(
    `SELECT public_key, private_key FROM push_vapid_config WHERE id = 1 LIMIT 1`,
  ).catch(() => ({ rows: [] as Array<{ public_key: string; private_key: string }> }));

  if (existing.rows[0]?.public_key && existing.rows[0]?.private_key) {
    const keys: VapidKeys = {
      publicKey: existing.rows[0].public_key,
      privateKey: existing.rows[0].private_key,
      subject,
    };
    if (executor === (query as unknown as PushQueryExecutor)) {
      cachedVapidKeys = keys;
    }
    return keys;
  }

  const generated = generateVapidKeyPair();
  await executor(
    `INSERT INTO push_vapid_config (id, public_key, private_key)
     VALUES (1, $1::text, $2::text)
     ON CONFLICT (id) DO NOTHING`,
    [generated.publicKey, generated.privateKey],
  ).catch(() => undefined);

  const confirmed = await executor<{ public_key: string; private_key: string }>(
    `SELECT public_key, private_key FROM push_vapid_config WHERE id = 1 LIMIT 1`,
  ).catch(() => ({ rows: [] as Array<{ public_key: string; private_key: string }> }));

  const finalKeys: VapidKeys = {
    publicKey: confirmed.rows[0]?.public_key || generated.publicKey,
    privateKey: confirmed.rows[0]?.private_key || generated.privateKey,
    subject,
  };

  if (executor === (query as unknown as PushQueryExecutor)) {
    cachedVapidKeys = finalKeys;
  }
  return finalKeys;
}

export function createVapidAuthorizationHeader(
  endpoint: string,
  vapid: VapidKeys,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): string {
  const parsed = new URL(endpoint);
  const audience = `${parsed.protocol}//${parsed.host}`;

  const headerB64 = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" }), "utf8").toString("base64url");
  const payloadB64 = Buffer.from(
    JSON.stringify({
      aud: audience,
      exp: nowEpochSeconds + 12 * 3600,
      sub: vapid.subject,
    }),
    "utf8",
  ).toString("base64url");

  const pubBytes = decodeBase64UrlOrStandard(vapid.publicKey);
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error("Invalid uncompressed P-256 VAPID public key");
  }
  const x = pubBytes.subarray(1, 33).toString("base64url");
  const y = pubBytes.subarray(33, 65).toString("base64url");
  const d = decodeBase64UrlOrStandard(vapid.privateKey).toString("base64url");

  const privateKeyObject = crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", x, y, d },
    format: "jwk",
  });

  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput, "ascii"), {
    key: privateKeyObject,
    dsaEncoding: "ieee-p1363",
  });

  const jwt = `${signingInput}.${signature.toString("base64url")}`;
  return `vapid t=${jwt}, k=${pubBytes.toString("base64url")}`;
}

/**
 * Encrypts a UTF-8 JSON string according to RFC 8291 (Web Push Message Encryption)
 * and RFC 8188 (`aes128gcm` Content-Encoding).
 */
export function encryptWebPushPayload(
  payloadText: string,
  subscriptionKeys: { p256dh: string; auth: string },
): Buffer {
  const uaPublic = decodeBase64UrlOrStandard(subscriptionKeys.p256dh);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error("Invalid subscriber p256dh key");
  }

  const authSecret = decodeBase64UrlOrStandard(subscriptionKeys.auth);
  if (authSecret.length < 16) {
    throw new Error("Invalid subscriber auth secret");
  }

  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(); // 65-byte uncompressed point
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  const salt = crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "ascii"), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", ecdhSecret, authSecret, keyInfo, 32));

  const cekInfo = Buffer.from("Content-Encoding: aes128gcm\0", "ascii");
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, cekInfo, 16));

  const nonceInfo = Buffer.from("Content-Encoding: nonce\0", "ascii");
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, nonceInfo, 12));

  // Single final record delimited by 0x02 (RFC 8188 §2)
  const recordPlaintext = Buffer.concat([Buffer.from(payloadText, "utf8"), Buffer.from([0x02])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(recordPlaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const keyIdLen = Buffer.from([asPublic.length]);

  return Buffer.concat([salt, recordSize, keyIdLen, asPublic, ciphertext]);
}

export async function saveWebPushSubscription(
  params: {
    userId: string;
    userRole?: string | null;
    subscription: WebPushSubscriptionInput;
    userAgent?: string | null;
  },
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<void> {
  await ensureWebPushSchema(executor);
  const endpoint = String(params.subscription?.endpoint ?? "").trim();
  const p256dh = String(params.subscription?.keys?.p256dh ?? "").trim();
  const auth = String(params.subscription?.keys?.auth ?? "").trim();

  if (!endpoint || !p256dh || !auth) {
    throw new Error("Invalid Web Push subscription payload");
  }

  // Validate keys before persisting
  const pubBuf = decodeBase64UrlOrStandard(p256dh);
  const authBuf = decodeBase64UrlOrStandard(auth);
  if (pubBuf.length !== 65 || pubBuf[0] !== 0x04 || authBuf.length < 16) {
    throw new Error("Invalid Web Push cryptographic keys");
  }

  await executor(
    `INSERT INTO web_push_subscriptions (user_id, user_role, endpoint, p256dh, auth, user_agent, updated_at)
     VALUES ($1::varchar, $2::varchar, $3::text, $4::text, $5::text, $6::text, CURRENT_TIMESTAMP)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           user_role = EXCLUDED.user_role,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = COALESCE(EXCLUDED.user_agent, web_push_subscriptions.user_agent),
           updated_at = CURRENT_TIMESTAMP`,
    [
      params.userId,
      params.userRole ?? null,
      endpoint,
      p256dh,
      auth,
      params.userAgent ? params.userAgent.slice(0, 512) : null,
    ],
  );
}

export async function removeWebPushSubscription(
  endpoint: string,
  userId?: string,
  executor: PushQueryExecutor = query as unknown as PushQueryExecutor,
): Promise<void> {
  await ensureWebPushSchema(executor);
  if (!endpoint) return;
  if (userId) {
    await executor(
      `DELETE FROM web_push_subscriptions WHERE endpoint = $1::text AND user_id = $2::varchar`,
      [endpoint, userId],
    ).catch(() => undefined);
  } else {
    await executor(
      `DELETE FROM web_push_subscriptions WHERE endpoint = $1::text`,
      [endpoint],
    ).catch(() => undefined);
  }
}

export async function sendWebPushMessage(
  subscription: WebPushSubscriptionInput,
  envelope: WebPushEnvelope,
  vapid: VapidKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<{ delivered: boolean; status: number; gone: boolean }> {
  const encryptedBody = encryptWebPushPayload(JSON.stringify(envelope), subscription.keys);
  const authorization = createVapidAuthorizationHeader(subscription.endpoint, vapid);

  const response = await fetchImpl(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Content-Length": String(encryptedBody.length),
      TTL: "86400",
      Urgency: envelope.silent ? "normal" : "high",
      Authorization: authorization,
    },
    body: new Uint8Array(encryptedBody),
  });

  const gone = response.status === 404 || response.status === 410;
  return {
    delivered: response.ok,
    status: response.status,
    gone,
  };
}
