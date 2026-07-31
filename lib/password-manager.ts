import { query } from "@/lib/db";
import { hashPassword, comparePassword } from "@/lib/auth";
import crypto from "crypto";

/**
 * Validates password complexity requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePasswordComplexity(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Create a password reset token that expires in 1 hour
 */
export async function createPasswordResetToken(
  staffId: string,
  initiatedBy: string,
  reason: string
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  try {
    await query(
      `INSERT INTO password_reset_tokens (
        staff_id,
        token_hash,
        initiated_by,
        reset_reason,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5)`,
      [staffId, tokenHash, initiatedBy, reason, expiresAt]
    );

    return { token, expiresAt };
  } catch (error) {
    console.error("Error creating password reset token:", error);
    throw new Error("Failed to create password reset token");
  }
}

/**
 * Verify and invalidate a password reset token
 */
export async function verifyResetToken(token: string): Promise<string | null> {
  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  try {
    const result = await query(
      `SELECT staff_id FROM password_reset_tokens 
       WHERE token_hash = $1 
       AND is_used = false 
       AND expires_at > NOW() 
       LIMIT 1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const staffId = result.rows[0].staff_id;

    // Mark token as used
    await query(
      `UPDATE password_reset_tokens 
       SET is_used = true, used_at = NOW() 
       WHERE token_hash = $1`,
      [tokenHash]
    );

    return staffId;
  } catch (error) {
    console.error("Error verifying reset token:", error);
    return null;
  }
}

/**
 * Check if password was used in last 5 passwords
 */
export async function checkPasswordReuse(
  staffId: string,
  newPassword: string
): Promise<boolean> {
  try {
    const result = await query(
      `SELECT 
        password_hash, 
        last_password_1, 
        last_password_2, 
        last_password_3, 
        last_password_4, 
        last_password_5 
       FROM staff_profiles 
       WHERE id = $1`,
      [staffId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const staff = result.rows[0];
    const previousPasswords = [
      staff.password_hash,
      staff.last_password_1,
      staff.last_password_2,
      staff.last_password_3,
      staff.last_password_4,
      staff.last_password_5,
    ].filter(Boolean);

    for (const hashedPassword of previousPasswords) {
      const matches = await comparePassword(newPassword, hashedPassword);
      if (matches) {
        return true; // Password was reused
      }
    }

    return false; // Password is unique
  } catch (error) {
    console.error("Error checking password reuse:", error);
    throw new Error("Failed to check password reuse");
  }
}

/**
 * Update staff password and rotate password history
 */
export async function updateStaffPassword(
  staffId: string,
  newPassword: string
): Promise<void> {
  const validation = validatePasswordComplexity(newPassword);

  if (!validation.isValid) {
    throw new Error(`Password validation failed: ${validation.errors.join(", ")}`);
  }

  const isReused = await checkPasswordReuse(staffId, newPassword);
  if (isReused) {
    throw new Error(
      "Cannot reuse any of your last 5 passwords. Please choose a different password."
    );
  }

  const newHash = await hashPassword(newPassword);

  try {
    // Get current password history
    const result = await query(
      `SELECT 
        password_hash, 
        last_password_1, 
        last_password_2, 
        last_password_3, 
        last_password_4 
       FROM staff_profiles 
       WHERE id = $1`,
      [staffId]
    );

    if (result.rows.length === 0) {
      throw new Error("Staff member not found");
    }

    const staff = result.rows[0];

    // Rotate password history (shift old passwords down)
    await query(
      `UPDATE staff_profiles 
       SET password_hash = $1,
           last_password_1 = $2,
           last_password_2 = $3,
           last_password_3 = $4,
           last_password_4 = $5,
           last_password_5 = $6,
           password_changed_at = NOW(),
           updated_at = NOW()
       WHERE id = $7`,
      [
        newHash,
        staff.password_hash,
        staff.last_password_1,
        staff.last_password_2,
        staff.last_password_3,
        staff.last_password_4,
        staffId,
      ]
    );
  } catch (error) {
    console.error("Error updating password:", error);
    throw new Error("Failed to update password");
  }
}
