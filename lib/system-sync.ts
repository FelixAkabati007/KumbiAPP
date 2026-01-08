import { query } from "@/lib/db";

export interface SystemState {
  key: string;
  last_updated: string;
  version: string;
}

/**
 * Updates the synchronization state for a given key.
 * Triggers a version change which clients can detect.
 */
export async function updateSystemState(key: string): Promise<void> {
  try {
    // Ensure the key exists first (though we seeded them, safe to upsert)
    await query(
      `INSERT INTO system_state (key, last_updated, version)
       VALUES ($1, NOW(), uuid_generate_v4())
       ON CONFLICT (key) 
       DO UPDATE SET last_updated = NOW(), version = uuid_generate_v4()`,
      [key]
    );

    // Always update 'global' key when any specific key updates
    if (key !== "global") {
      await query(
        `UPDATE system_state SET last_updated = NOW(), version = uuid_generate_v4() WHERE key = 'global'`
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
    const result = await query<SystemState>(
      "SELECT key, version FROM system_state"
    );
    console.log(`getSystemState: Found ${result.rowCount} rows.`, result.rows);
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
