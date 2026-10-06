import { query } from "@/lib/db";
import { AppSettings, getSettings as getDefaultSettings } from "@/lib/settings";

export async function getServerSettings(): Promise<AppSettings> {
  try {
    const [settingsRes, profileRes] = await Promise.all([
      query("SELECT data, version FROM settings WHERE id = 1"),
      query("SELECT restaurant_name, owner_name, email, phone, address, logo FROM restaurant_profile WHERE id = 1"),
    ]);
    const dbSettings = (settingsRes.rows[0]?.data ?? {}) as Partial<AppSettings>;
    const profile = profileRes.rows[0];
    const defaults = getDefaultSettings();
    const settings: AppSettings = {
      ...defaults,
      ...dbSettings,
      version: Number(settingsRes.rows[0]?.version ?? 1),
      account: profile
        ? {
            restaurantName: profile.restaurant_name ?? "",
            ownerName: profile.owner_name ?? "",
            email: profile.email ?? "",
            phone: profile.phone ?? "",
            address: profile.address ?? "",
            logo: profile.logo ?? "",
          }
        : defaults.account,
      notifications: { ...defaults.notifications, ...(dbSettings.notifications ?? {}) },
      system: {
        ...defaults.system,
        ...(dbSettings.system ?? {}),
        cashDrawer: { ...defaults.system.cashDrawer, ...(dbSettings.system?.cashDrawer ?? {}) },
        barcodeScanner: { ...defaults.system.barcodeScanner, ...(dbSettings.system?.barcodeScanner ?? {}) },
        thermalPrinter: { ...defaults.system.thermalPrinter, ...(dbSettings.system?.thermalPrinter ?? {}) },
        secondaryPrinter: dbSettings.system?.secondaryPrinter
          ? { ...defaults.system.secondaryPrinter, ...dbSettings.system.secondaryPrinter }
          : defaults.system.secondaryPrinter,
        refunds: { ...defaults.system.refunds, ...(dbSettings.system?.refunds ?? {}) },
      },
      security: { ...defaults.security, ...(dbSettings.security ?? {}) },
    };
    return settings;
  } catch (error) {
    console.error("Failed to fetch server settings:", error);
    return getDefaultSettings();
  }
}
