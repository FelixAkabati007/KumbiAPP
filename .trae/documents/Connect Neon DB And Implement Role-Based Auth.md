## Current Issues
- Wrong env var: `.env.local` has `DB_URL` pointing to a REST endpoint; driver needs `postgres://...`.
- Auth is mock-based in [auth-provider.tsx](file:///d:/KHHREST/components/auth-provider.tsx); no secure backend.
- Missing `users` table and auth routes; role enforcement is UI-only.

## Environment Configuration
- Add to `.env.local`:
  - `DATABASE_URL=postgres://USER:PASSWORD@HOST/neondb?sslmode=require`
  - `JWT_SECRET=<32+ char random secret>`
- Remove/ignore `DB_URL` or keep as fallback; driver now reads `DATABASE_URL` first in [db.ts](file:///d:/KHHREST/lib/db.ts).

## Database Setup
- Ensure tables exist via [setup-db](file:///d:/KHHREST/app/api/setup-db/route.ts):
  - `users(id, email, username, password_hash, name, role, created_at, updated_at)`
  - Existing operational tables (`transaction_logs`, `refundrequests`, `kitchenorders`, `orderitems`).
- Seed initial admin user (one-time script or API call).

## Backend Auth API
- Implement routes (created under `app/api/auth/*`):
  - [login](file:///d:/KHHREST/app/api/auth/login/route.ts): verify credentials, set HTTP-only JWT cookie.
  - [signup](file:///d:/KHHREST/app/api/auth/signup/route.ts): hash password, insert user, set cookie.
  - [me](file:///d:/KHHREST/app/api/auth/me/route.ts): return current user based on cookie.
  - [logout](file:///d:/KHHREST/app/api/auth/logout/route.ts): clear session.
- Helpers in [auth.ts](file:///d:/KHHREST/lib/auth.ts): bcrypt hashing, JWT sign/verify, cookie session.

## Frontend Integration
- Replace demo auth with real API in [auth-provider.tsx](file:///d:/KHHREST/components/auth-provider.tsx):
  - Load session with `/api/auth/me` on mount.
  - Call `/api/auth/login`, `/api/auth/signup`, `/api/auth/logout` for actions.

## Role Enforcement
- Use [role-guard.tsx](file:///d:/KHHREST/components/role-guard.tsx) to gate pages/components by `user.role`.
- Add middleware policy in [middleware.ts](file:///d:/KHHREST/middleware.ts):
  - Protect `/pos`, `/kitchen`, `/reports`, `/settings` by roles (admin, manager, cashier, chef).
  - Redirect unauthenticated users to `/login`.

## Verification Steps
- Update `.env.local` with valid Neon `DATABASE_URL` and `JWT_SECRET`.
- Restart dev server.
- Hit `http://localhost:3000/api/setup-db` to create tables.
- Sign up via `/api/auth/signup` or UI; confirm cookie and role.
- Test protected pages render per role, and unauthorized routes redirect.
- Check DB connectivity: [health](file:///d:/KHHREST/app/api/health/route.ts) and sample queries.

## Migration Notes
- Ensure any code referencing `DB_URL` uses `DATABASE_URL` or relies on fallback already added in [db.ts](file:///d:/KHHREST/lib/db.ts).
- If desired, swap to NextAuth later; current JWT flow is production-ready for Neon.

## Risks & Mitigations
- Bad `DATABASE_URL` causes `28P01 password authentication failed`: fix credentials and ensure `sslmode=require`.
- Protect JWT secret; never log or expose.
- Add rate limiting for auth endpoints if deployed.

## Next Actions (upon approval)
- Update `.env.local` with Neon connection string and `JWT_SECRET`.
- Run setup: visit `/api/setup-db`.
- Seed admin; validate login, role gates, and DB operations across app.
