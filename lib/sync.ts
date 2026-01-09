import { query } from "@/lib/db";

export async function getSystemEvents(since?: string) {
  try {
    let text = "SELECT * FROM audit_logs";
    const params: (string | number)[] = [];

    if (since) {
      text += " WHERE created_at > $1";
      params.push(since);
    }

    text += " ORDER BY created_at DESC LIMIT 1000";

    const result = await query(text, params);
    return result;
  } catch (error) {
    console.error("Failed to fetch system events:", error);
    // Return empty result structure on failure to prevent crashes
    return { rows: [], rowCount: 0 };
  }
}
