# Authentication and Staff Accounts

All valid application login accounts must be created through **Settings > Staff Accounts**. Public signup is disabled, development admin seeding is disabled, and legacy fixed credentials are not supported.

A login succeeds only when the submitted email matches an active `staff_profiles.business_email` joined to its `users` record, the employment status is `active`, the staff profile is active, and the stored password hash matches. Role and access decisions continue to be enforced by the server-side authorization policy.

Administrators should create, update, deactivate, and reset staff credentials from the Staff Accounts interface. Never add credentials to source code, seed routes, tests that run against a real database, or client-side configuration. Failed attempts are recorded through the authentication audit path; deprecated seed-email attempts are additionally flagged in server logs.

The server requires `JWT_SECRET` to be configured. It intentionally refuses to start with a fallback signing secret.
