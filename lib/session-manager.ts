import { query } from "@/lib/db";
import crypto from "crypto";

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const DEVICE_FINGERPRINT_LENGTH = 64;

/**
 * Generate a device fingerprint based on device characteristics
 */
export function generateDeviceFingerprint(
  userAgent: string,
  ipAddress: string
): string {
  const combined = `${userAgent}${ipAddress}`;
  return crypto
    .createHash("sha256")
    .update(combined)
    .digest("hex")
    .substring(0, DEVICE_FINGERPRINT_LENGTH);
}

/**
 * Create a new session for shift-based access
 */
export async function createSession(
  staffId: string,
  deviceFingerprint: string,
  ipAddress: string,
  userAgent: string
): Promise<{ sessionToken: string; expiresIn: number }> {
  // Check for existing active sessions on this device
  const existingSession = await query(
    `SELECT id FROM staff_sessions 
     WHERE device_fingerprint = $1 
     AND is_active = true 
     AND logged_out_at IS NULL 
     LIMIT 1`,
    [deviceFingerprint]
  );

  if (existingSession.rows && existingSession.rows.length > 0) {
    throw new Error(
      "Another user is already logged in on this device. Please log out first."
    );
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");

  try {
    await query(
      `INSERT INTO staff_sessions (
        staff_id,
        device_fingerprint,
        session_token,
        ip_address,
        user_agent,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, true)`,
      [staffId, deviceFingerprint, sessionToken, ipAddress, userAgent]
    );

    // Register device if not already registered
    await query(
      `INSERT INTO device_registrations (device_fingerprint, last_used_by, last_used_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (device_fingerprint) 
       DO UPDATE SET last_used_by = $2, last_used_at = NOW()`,
      [deviceFingerprint, staffId]
    );

    return { sessionToken, expiresIn: 24 * 60 * 60 }; // 1 day
  } catch (error) {
    console.error("Error creating session:", error);
    throw new Error("Failed to create session");
  }
}

/**
 * Validate session and check for inactivity
 */
export async function validateSession(
  sessionToken: string
): Promise<{ staffId: string; requiresReauth: boolean } | null> {
  try {
    const result = await query(
      `SELECT ss.staff_id, ss.last_activity, ss.inactivity_warned, sp.user_id
       FROM staff_sessions ss
       JOIN staff_profiles sp ON ss.staff_id = sp.id
       WHERE ss.session_token = $1 
       AND ss.is_active = true 
       AND ss.logged_out_at IS NULL`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];
    const lastActivity = new Date(session.last_activity);
    const now = new Date();
    const inactivityDuration = now.getTime() - lastActivity.getTime();

    // Check if session has been inactive for more than 15 minutes
    if (inactivityDuration > INACTIVITY_TIMEOUT_MS) {
      // Automatically log out the session
      await logoutSession(sessionToken);
      return null;
    }

    // Update last activity
    await query(
      `UPDATE staff_sessions 
       SET last_activity = NOW() 
       WHERE session_token = $1`,
      [sessionToken]
    );

    // Check if we need to warn about inactivity (approaching 15 minutes)
    const requiresReauth = inactivityDuration > 12 * 60 * 1000; // Warn at 12 minutes

    if (requiresReauth && !session.inactivity_warned) {
      await query(
        `UPDATE staff_sessions 
         SET inactivity_warned = true 
         WHERE session_token = $1`,
        [sessionToken]
      );
    }

    return { staffId: session.staff_id, requiresReauth };
  } catch (error) {
    console.error("Error validating session:", error);
    return null;
  }
}

/**
 * End a user session (logout)
 */
export async function logoutSession(sessionToken: string): Promise<void> {
  try {
    await query(
      `UPDATE staff_sessions 
       SET is_active = false, logged_out_at = NOW() 
       WHERE session_token = $1`,
      [sessionToken]
    );
  } catch (error) {
    console.error("Error logging out session:", error);
    throw new Error("Failed to logout session");
  }
}

/**
 * Force logout all sessions for a device
 */
export async function forceLogoutDevice(deviceFingerprint: string): Promise<void> {
  try {
    await query(
      `UPDATE staff_sessions 
       SET is_active = false, logged_out_at = NOW() 
       WHERE device_fingerprint = $1 
       AND is_active = true`,
      [deviceFingerprint]
    );
  } catch (error) {
    console.error("Error force logging out device:", error);
    throw new Error("Failed to force logout device");
  }
}

/**
 * Get active sessions for a staff member
 */
export async function getActiveSessions(
  staffId: string
): Promise<Record<string, unknown>[]> {
  try {
    const result = await query(
      `SELECT * FROM staff_sessions 
       WHERE staff_id = $1 
       AND is_active = true 
       AND logged_out_at IS NULL 
       ORDER BY created_at DESC`,
      [staffId]
    );

    return result.rows || [];
  } catch (error) {
    console.error("Error getting active sessions:", error);
    return [];
  }
}

/**
 * Clear session-specific user data upon logout
 */
export async function clearSessionData(sessionToken: string): Promise<void> {
  try {
    // Invalidate the session
    await logoutSession(sessionToken);
    
    // Additional session cleanup can be done here
    // e.g., clearing cached data, temporary tokens, etc.
  } catch (error) {
    console.error("Error clearing session data:", error);
    throw new Error("Failed to clear session data");
  }
}
