import { query } from "@/lib/db";
import { AppSettings, getSettings as getDefaultSettings } from "@/lib/settings";

export async function getServerSettings(): Promise<AppSettings> {
  try {
    const settingsRes = await query("SELECT data FROM settings WHERE id = 1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbSettings: any = settingsRes.rows.length > 0 ? settingsRes.rows[0].data : {};
    
    const defaults = getDefaultSettings();
    
    // Deep merge system settings to ensure refunds config is complete
    const settings: AppSettings = {
        ...defaults,
        ...dbSettings,
        system: {
            ...defaults.system,
            ...(dbSettings.system || {}),
            refunds: {
                ...defaults.system.refunds,
                ...(dbSettings.system?.refunds || {})
            }
        }
    };

    return settings;
  } catch (error) {
    console.error("Failed to fetch server settings:", error);
    return getDefaultSettings();
  }
}
