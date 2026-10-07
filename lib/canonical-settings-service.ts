import { z } from "zod";
import type { PoolClient } from "@neondatabase/serverless";
import { transaction } from "@/lib/db";
import { updateSystemState } from "@/lib/system-sync";

const accountSchema = z.object({
  restaurantName: z.string().max(200).optional(),
  ownerName: z.string().max(200).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  phone: z.string().max(64).optional(),
  address: z.string().max(500).optional(),
  logo: z.string().max(200000).optional(),
}).strict();

export const canonicalSettingsPatchSchema = z.object({
  account: accountSchema.optional(),
  theme: z.enum(["system", "light", "dark"]).optional(),
  notifications: z.record(z.string().max(80), z.boolean()).optional(),
  system: z.record(z.string().max(80), z.unknown()).optional(),
  security: z.object({
    requireLogin: z.boolean().optional(),
    sessionTimeout: z.number().int().min(1).max(1440).optional(),
    twoFactorAuth: z.boolean().optional(),
  }).strict().optional(),
  businessName: z.string().max(200).optional(),
  businessAddress: z.string().max(500).optional(),
  businessPhone: z.string().max(64).optional(),
  businessEmail: z.union([z.string().email(), z.literal("")]).optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
}).strict();

export class SettingsVersionConflict extends Error {
  constructor(readonly version: number) {
    super("Settings changed by another administrator");
    this.name = "SettingsVersionConflict";
  }
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function saveCanonicalSettings({ request, actorId, actorRole, patch }: {
  request: Request;
  actorId: string;
  actorRole: string;
  patch: unknown;
}) {
  const parsed = canonicalSettingsPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false as const, status: 400, body: { error: "Invalid settings data", details: parsed.error.flatten() } };
  }
  const input = parsed.data;
  const restrictedPatch = actorRole === "manager"
    ? { expectedVersion: input.expectedVersion, account: input.account ? {
        restaurantName: input.account.restaurantName,
        ownerName: input.account.ownerName,
        phone: input.account.phone,
        address: input.account.address,
        logo: input.account.logo,
      } : undefined, notifications: input.notifications, theme: input.theme }
    : input;
  return persistCanonicalSettings({ request, actorId, actorRole, patch: restrictedPatch });
}

async function persistCanonicalSettings({ request, actorId, actorRole, patch }: {
  request: Request;
  actorId: string;
  actorRole: string;
  patch: z.infer<typeof canonicalSettingsPatchSchema>;
}) {
  const { account, expectedVersion, ...settings } = patch;
  const result = await transaction(async (client: PoolClient) => {
    const current = await client.query<{ data: Record<string, unknown>; version: number }>("SELECT data, version FROM settings WHERE id = 1 FOR UPDATE");
    const currentVersion = Number(current.rows[0]?.version ?? 1);
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) throw new SettingsVersionConflict(currentVersion);
    const beforeData = current.rows[0]?.data ?? {};
    const mergedData = { ...beforeData, ...settings };
    const nextVersion = currentVersion + 1;

    if (account) {
      await client.query(`INSERT INTO restaurant_profile (id, restaurant_name, owner_name, email, phone, address, logo, updated_at)
        VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (id) DO UPDATE SET restaurant_name = EXCLUDED.restaurant_name, owner_name = EXCLUDED.owner_name,
        email = EXCLUDED.email, phone = EXCLUDED.phone, address = EXCLUDED.address, logo = EXCLUDED.logo, updated_at = NOW()`,
        [account.restaurantName ?? "", account.ownerName ?? "", account.email ?? "", account.phone ?? "", account.address ?? "", account.logo ?? ""]);
    }

    const saved = await client.query(`INSERT INTO settings (id, data, version, updated_at) VALUES (1, $1::jsonb, $2, NOW())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = NOW()
      WHERE settings.version = $3 RETURNING version`, [JSON.stringify(mergedData), nextVersion, currentVersion]);
    if (saved.rowCount !== 1) throw new SettingsVersionConflict(currentVersion);

    const eventPayload = {
      version: nextVersion,
      actorRole,
      changedFields: Object.keys(settings),
      accountChanged: Boolean(account),
      requestId: request.headers.get("x-request-id") || crypto.randomUUID(),
    };
    await client.query(`INSERT INTO settings_change_log (settings_version, performed_by, action, before_data, after_data, ip_address)
      VALUES ($1, $2, 'UPDATE_SETTINGS', $3::jsonb, $4::jsonb, $5)`,
      [nextVersion, actorId, JSON.stringify(beforeData), JSON.stringify(mergedData), clientIp(request)]);
    await client.query(`INSERT INTO operational_outbox
      (aggregate_type, aggregate_id, event_type, payload, idempotency_key, status, attempts, available_at)
      VALUES ('settings', '1', 'settings.updated', $1::jsonb, $2, 'pending', 0, NOW())`,
      [JSON.stringify(eventPayload), `settings:1:${nextVersion}`]);
    await client.query(`INSERT INTO system_events (event_type, payload) VALUES ('settings.updated', $1::jsonb)`, [JSON.stringify(eventPayload)]);
    return { version: nextVersion };
  });
  await updateSystemState("settings");
  return { ok: true as const, status: 200, body: { success: true, version: result.version } };
}
