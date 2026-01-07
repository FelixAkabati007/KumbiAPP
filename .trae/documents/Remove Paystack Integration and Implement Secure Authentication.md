## Scope & Objectives
- Remove all Paystack code and configuration while preserving non-Paystack features.
- Strengthen signup/login with secure validation, hashing, email verification, sessions and tests.
- Maintain cash payments, receipts, inventory updates, and system integrations.
- Provide rollback steps to restore Paystack quickly if needed.

## Paystack Removal
- Code removal:
  - Delete service and routes: [paystack-service.ts](file:///d:/KHHREST/lib/services/paystack-service.ts), [initialize](file:///d:/KHHREST/app/api/paystack/initialize/route.ts), [verify](file:///d:/KHHREST/app/api/paystack/verify/route.ts), [refund](file:///d:/KHHREST/app/api/paystack/refund/route.ts).
  - Refactor [payment-service.ts](file:///d:/KHHREST/lib/services/payment-service.ts#L210-L331):
    - Remove mobile/card branch, Paystack polling, and API calls.
    - Keep "cash" flow intact (transaction logging, inventory updates, receipt printing).
    - For card/mobile, either return a descriptive unsupported error or plug in a provider-neutral stub with the same PaymentResult shape.
- UI cleanup:
  - Remove any component states/messages that assume Paystack Checkout (no window.open, no authorization_url flows) in payment UIs like [PaymentProcessor](file:///d:/KHHREST/components/payment/payment-processor.tsx).
  - Ensure buttons and labels reflect cash-only (or provider-neutral) behavior.
- Environment & config:
  - Remove PAYSTACK_* variables from all env files and docs (.env.local/.env.production, [kkrest.md.txt](file:///d:/KHHREST/kkrest.md.txt#L62-L69)).
- Database & logging:
  - Keep generic transaction_logs usage. Remove channel-specific assumptions; log payment_method using the current method (cash or stub).
  - No schema drop required; ensure removed routes no longer write Paystack metadata.
- Tests & docs:
  - Remove or update tests that rely on Paystack routes or flows.
  - Update documentation to reflect cash-only or provider-neutral payments.

## Secure Authentication Enhancements
- Server-side routes:
  - Review and harden [signup](file:///d:/KHHREST/app/api/auth/signup/route.ts), [login](file:///d:/KHHREST/app/api/auth/login/route.ts), [verify-email](file:///d:/KHHREST/app/api/auth/verify-email/route.ts), [me](file:///d:/KHHREST/app/api/auth/me/route.ts).
  - Input validation (zod), sanitization, and consistent error responses.
  - Password hashing with bcryptjs; enforce strong password policy.
  - Email verification tokens (single-use, hashed, TTL) and verified gate on login.
  - Rate limiting on signup/login to prevent brute-force.
  - Session management: HTTP-only JWT cookie, rotation on login, secure flags in production.
- Client-side:
  - Ensure required fields and validation in [sign-up-form.tsx](file:///d:/KHHREST/components/sign-up-form.tsx) and [sign-in-form.tsx](file:///d:/KHHREST/components/sign-in-form.tsx).
  - Robust error handling and user feedback via toasts and inline messages.
  - Update [auth-provider.tsx](file:///d:/KHHREST/components/auth-provider.tsx) to rely on /api/auth/* endpoints; handle token expiry and logout.
- Tests:
  - Unit tests for validators, hashing, token issuance/verification.
  - Integration tests for signup/login/verify-email paths and session cookie behavior ([tests/auth/*](file:///d:/KHHREST/tests/auth)).
  - Negative tests: duplicate email/username, weak password, unverified login, rate-limit exceeded.
- Documentation:
  - Update setup instructions for auth env (JWT_SECRET), flows, and security practices.

## Rollback Plan
- Keep a separate branch/tag with Paystack code before removal.
- Provide a patch script to re-add deleted files and revert payment-service changes.
- Document steps to reintroduce PAYSTACK_* envs and routes.

## Deliverables & Verification
- Code changes implementing removal/refactor and auth hardening.
- Green unit/integration tests; adjust coverage thresholds if required.
- Updated docs reflecting removal and new auth flow.
- Manual validation: run dev server, perform signup, verify email, login, and cash payment; confirm transaction log entries and receipt printing.

## Risks & Mitigations
- Payment method regression: clearly mark non-cash as unsupported or replace with stub; ensure UI and tests align.
- Auth security: enforce cookie flags, input validation, and rate limits; avoid logging sensitive data.
- Environment drift: remove stale PAYSTACK keys and update example envs accordingly.
