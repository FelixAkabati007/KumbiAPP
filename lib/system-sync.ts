import { query } from "@/lib/db";

export interface SystemState {
  key: string;
  last_updated: string;
  version: string;
}

let systemStateTableEnsured = false;

async function ensureSystemStateTable(): Promise<void> {
  if (systemStateTableEnsured) return;
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS system_state (
         key VARCHAR(100) PRIMARY KEY,
         last_updated TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
         version VARCHAR(100) NOT NULL DEFAULT gen_random_uuid()::text
       )`
    );
    systemStateTableEnsured = true;
  } catch {
    // Non-fatal if running against mocked/read-only DB
  }
}

/**
 * Updates the synchronization state for a given key.
 * Triggers a version change which clients can detect.
 * Uses PostgreSQL native gen_random_uuid()::text so uuid-ossp is never required.
 */
export async function updateSystemState(key: string): Promise<void> {
  try {
    await ensureSystemStateTable();

    await query(
      `INSERT INTO system_state (key, last_updated, version)
       VALUES ($1::varchar, NOW(), gen_random_uuid()::text)
       ON CONFLICT (key)
       DO UPDATE SET last_updated = NOW(), version = gen_random_uuid()::text`,
      [key]
    );

    // Always update 'global' key when any specific key updates
    if (key !== "global") {
      await query(
        `INSERT INTO system_state (key, last_updated, version)
         VALUES ('global', NOW(), gen_random_uuid()::text)
         ON CONFLICT (key)
         DO UPDATE SET last_updated = NOW(), version = gen_random_uuid()::text`
      );
    }
  } catch (error) {
    console.error(`Failed to update system state for key ${key}:`, error);
  }
}

/**
 * Retrieves the current version state of the system.
 */
export async function getSystemState(): Promise<Record<string, string>> {
  try {
    await ensureSystemStateTable();
    const result = await query<SystemState>(
      "SELECT key, version::text AS version FROM system_state"
    );
    const state: Record<string, string> = {};
    result.rows.forEach((row) => {
      state[row.key] = row.version;
    });
    return state;
  } catch (error) {
    console.error("Failed to get system state:", error);
    return {};
  }
}
