import { query } from "./db";

export async function recordSignupAttempt(
  email: string | null,
  ip: string | null
) {
  try {
    await query("INSERT INTO signup_attempts (email, ip) VALUES ($1, $2)", [
      email || null,
      ip || null,
    ]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Failed to record signup attempt", err);
  }
}

export async function isRateLimited(
  email: string | null,
  ip: string | null,
  windowMinutes = 60,
  maxAttempts = 5
) {
  const res = await query<{ count: string }>(
    `
      SELECT COUNT(*)::text as count
      FROM signup_attempts
      WHERE created_at > NOW() - INTERVAL '${windowMinutes} minutes'
        AND ( ( $1::text IS NULL ) OR ( email = $1::text ) )
        AND ( ( $2::text IS NULL ) OR ( ip = $2::text ) )
    `,
    [email || null, ip || null]
  );
  const count = Number(res.rows[0]?.count || "0");
  return count >= maxAttempts;
}
