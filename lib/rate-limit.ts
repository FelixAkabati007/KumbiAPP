import { query } from "./db";

/**
 * Records a signup attempt for rate limiting purposes.
 * Includes a probabilistic cleanup mechanism to remove old records.
 */
export async function recordSignupAttempt(
  email: string | null,
  ip: string | null
): Promise<void> {
  try {
    // Record the attempt
    await query("INSERT INTO signup_attempts (email, ip) VALUES ($1, $2)", [
      email || null,
      ip || null,
    ]);

    // Cleanup is now handled by a scheduled job or dedicated cleanup endpoint
    // to avoid slowing down user requests.
  } catch (err) {
    // Log but don't throw - we don't want to block user registration due to metrics failure
    console.warn("Failed to record signup attempt", err);
  }
}

/**
 * Checks if a user is rate limited based on Email OR IP address.
 * Returns true if the limit is exceeded.
 */
export async function isRateLimited(
  email: string | null,
  ip: string | null,
  windowMinutes = 60,
  maxAttempts = 5
): Promise<boolean> {
  // If neither identifier is provided, we can't rate limit
  if (!email && !ip) return false;

  try {
    // Optimized query:
    // We check for any records that match EITHER the email OR the IP within the window.
    // This prevents a user from rotating IPs to spam the same email,
    // or rotating emails to spam from the same IP.
    const res = await query<{ count: string }>(
      `
      SELECT COUNT(*)::text as count
      FROM signup_attempts
      WHERE created_at > NOW() - make_interval(mins => $1)
        AND (
          ($2::text IS NOT NULL AND email = $2::text)
          OR 
          ($3::text IS NOT NULL AND ip = $3::text)
        )
      `,
      [windowMinutes, email || null, ip || null]
    );

    const count = Number(res.rows[0]?.count || "0");
    return count >= maxAttempts;
  } catch (err) {
    console.error("Rate limit check failed:", err);
    // Fail open (allow request) if DB check fails, to prevent DoS if DB is struggling
    // Alternatively, fail closed (return true) for high security.
    // Failing open is usually better for UX.
    return false;
  }
}

/**
 * Internal function to clean up old rate limit records.
 * Deletes records older than 24 hours.
 */
export async function cleanupOldRecords() {
  await query(
    "DELETE FROM signup_attempts WHERE created_at < NOW() - INTERVAL '24 hours'"
  );
}
