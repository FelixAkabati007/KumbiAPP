type SendEmailParams = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

const EMAIL_FROM =
  process.env.EMAIL_FROM || "no-reply@kumbisaly-heritage-restaurant.local";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_ENABLED =
  (process.env.EMAIL_ENABLED || "false").toLowerCase() === "true";

export async function sendEmail({ to, subject, text, html }: SendEmailParams) {
  if (!EMAIL_ENABLED) {
    const preview = { to, subject, text, html };
    console.info("[Email Disabled] Preview:", preview);
    return { success: true, preview };
  }

  if (RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to,
        subject,
        html: html || undefined,
        text: text || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Email send failed: ${res.status} ${body}`);
    }
    return { success: true };
  }

  if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
    // Minimal SMTP over fetch is non-trivial; require nodemailer if SMTP is needed.
    // For now, warn and fallback to preview.
    console.warn(
      "SMTP configuration provided but SMTP client not implemented; falling back to preview."
    );
    const preview = { to, subject, text, html };
    console.info("[Email Preview]", preview);
    return { success: true, preview };
  }

  // Fallback
  const preview = { to, subject, text, html };
  console.info("[Email Fallback Preview]", preview);
  return { success: true, preview };
}

export function buildVerificationEmail(link: string) {
  const subject = "Verify your email address";
  const text = `Welcome to Kumbisaly Heritage Restaurant POS!\n\nPlease verify your email by opening this link:\n${link}\n\nThis link expires soon.\nIf you did not sign up, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;color:#111">
      <h2 style="margin:0 0 16px;">Verify your email</h2>
      <p>Welcome to Kumbisaly Heritage Restaurant POS!</p>
      <p>Please click the button below to verify your email. This link expires soon.</p>
      <p style="margin:24px 0;">
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#EA580C;color:#fff;border-radius:6px;text-decoration:none">Verify Email</a>
      </p>
      <p>If the button above does not work, copy and paste this URL into your browser:</p>
      <p><a href="${link}">${link}</a></p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="font-size:12px;color:#666">If you did not create an account, you can safely ignore this email.</p>
    </div>
  `;
  return { subject, text, html };
}

export function buildPasswordResetEmail(link: string) {
  const subject = "Reset your password";
  const text = `Reset your password for Kumbisaly Heritage Restaurant POS.\n\nPlease click the link below to reset your password:\n${link}\n\nThis link expires in 1 hour.\nIf you did not request a password reset, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#fff;color:#111">
      <h2 style="margin:0 0 16px;">Reset your password</h2>
      <p>You requested a password reset for Kumbisaly Heritage Restaurant POS.</p>
      <p>Please click the button below to reset your password. This link expires in 1 hour.</p>
      <p style="margin:24px 0;">
        <a href="${link}" style="display:inline-block;padding:10px 16px;background:#EA580C;color:#fff;border-radius:6px;text-decoration:none">Reset Password</a>
      </p>
      <p>If the button above does not work, copy and paste this URL into your browser:</p>
      <p><a href="${link}">${link}</a></p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
      <p style="font-size:12px;color:#666">If you did not request a password reset, you can safely ignore this email.</p>
    </div>
  `;
  return { subject, text, html };
}
