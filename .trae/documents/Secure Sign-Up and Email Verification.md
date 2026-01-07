## Overview
- Implement a robust sign-up flow with client + server validation, hashed passwords, email verification, rate limiting, and clean UX.
- Integrate with the existing Neon/Postgres user DB and Next.js API routes while preserving current auth architecture.

## Client: Sign-Up Form
- Update [sign-up-form.tsx](file:///d:/KHHREST/components/sign-up-form.tsx) to include username, email, password, confirm password.
- Add real-time validation and helpful messages; disable submit while loading; show success/failure banners.
- Prevent weak passwords; enforce email format; match confirm password; trim/sanitize before submit.
- Call signup API; route user to a “Check your email” screen after a successful request.

## Server: Signup API
- Enhance [signup route](file:///d:/KHHREST/app/api/auth/signup/route.ts) to:
  - Validate and sanitize input (trim, normalize case, whitelist chars for username).
  - Enforce uniqueness of username/email at DB-level; return 409 on conflicts.
  - Hash password with bcryptjs (already present).
  - Set `email_verified=false` on creation; do NOT issue auth cookie yet.
  - Generate a single-use verification token (random 32 bytes), store HASH(token) with expiry (15–60 min) in DB.
  - Send verification email containing a link: `${APP_URL}/auth/verify?token=...&email=...`.
  - Apply per-IP + per-email rate limiting (e.g., 5 attempts per hour) using a Postgres-backed `signup_attempts` table.
  - Return structured JSON with user-friendly error codes.

## Email Service
- Create [lib/email.ts](file:///d:/KHHREST/lib/email.ts): provider-agnostic mailer.
  - Support SMTP via environment variables or a REST provider (e.g., Resend/SendGrid) using `fetch`.
  - Templated HTML and text emails; include brand styles.
  - In development, log the verification link instead of sending.

## Verification Workflow
- Add [verify-email API](file:///d:/KHHREST/app/api/auth/verify-email/route.ts):
  - Accept token+email; find token by email; compare HASH(token); check expiry+used.
  - Mark `email_verified=true`, delete/mark token used; then issue auth cookie (JWT) with existing [lib/auth.ts](file:///d:/KHHREST/lib/auth.ts).
- Add [verify page](file:///d:/KHHREST/app/auth/verify/page.tsx):
  - Reads `token` + `email` from query, calls API, renders success/failure states.

## Database Changes
- Update [schema.sql](file:///d:/KHHREST/database/schema.sql):
  - `users`: add `email_verified boolean DEFAULT false NOT NULL`.
  - `email_verification_tokens`: id (uuid), email (text), token_hash (text), expires_at (timestamptz), used_at (timestamptz NULL), created_at.
  - Indexes on email and expires_at.
  - `signup_attempts`: id, email, ip, created_at; index for windowed counting.

## Rate Limiting
- Implement helper in [lib/rate-limit.ts](file:///d:/KHHREST/lib/rate-limit.ts):
  - Window aggregation via SQL: count attempts in last N minutes by IP/email.
  - Return 429 with retry-after when exceeded.

## Security & Compliance
- Never store raw verification tokens; store hashed (SHA-256).
- Use CSRF-safe POST for verification if needed; otherwise validate referrer/origin.
- Normalize inputs and enforce allowlists for username; reject dangerous characters.
- JWT secrets via env; ensure strong entropy; rotate when needed.
- Limit PII in logs; redact email on errors; add retention policy comments.
- Update privacy notice and consent on the verify page (minimal text).

## Error Handling & UX
- Uniform API error codes: `validation_error`, `rate_limited`, `conflict`, `server_error`.
- Client displays friendly messages; retries suggested after rate-limit.
- Graceful dev fallback: if email service disabled, show link for local testing.

## Tests
- Unit (Vitest):
  - Validators and sanitizers, token generation + hashing, rate-limit window logic.
- Integration (Vitest + Next API):
  - Signup success/failure, duplicate user, rate-limited response.
  - Verification success: email_verified flips; auth cookie set.
  - Expired/used token paths.
- Security checks:
  - SQL injection attempts blocked; username/email normalization; timing attack mitigation (constant-time token compare where applicable).

## Configuration
- ENV: `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `RESEND_API_KEY`, `EMAIL_FROM`.
- Add feature flag `EMAIL_ENABLED` to switch between dev logging and actual send.

## Rollout
- Apply DB migrations; seed test data; run test suite.
- Staging verification: end-to-end signup + verify.
- Monitor logs for rate limit efficacy and invalid token attempts.

## Notes
- No secrets committed; use env only.
- Changes maintain existing login flow but gate authentication behind email verification.
- All new modules follow existing TypeScript and Next.js patterns.
