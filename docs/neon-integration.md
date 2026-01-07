# Neon Integration Plan and Rollback Procedures

## Environment Configuration

- Set in development and production:
  - `DATABASE_URL` (Connection string with pooling enabled)
  - `JWT_SECRET` (For session management)
  - `SESSION_SECRET` (For session management)

## Database Connectivity

- Initialization: see `lib/db.ts`
- Error handling: `try/catch` blocks around database queries
- Connection pooling: handled by `@neondatabase/serverless` and Neon's server-side pooling

## Role-Based Authentication and RLS

- Roles: `owner`, `manager`, `staff`, `kitchen`, `accountant`
- Implementation: Custom middleware/logic verifying user roles against the `users` table in Neon.
- Row Level Security: Can be implemented using Postgres RLS policies if connecting via a user with restricted privileges, but typically handled in application logic for serverless apps.

## Migrations

- Schema file: `database-schema.sql`
- Apply using `psql` or a migration tool.
- Staging first, then production after validation

## Data Migration

- Export legacy data and map into `tenants`, `profiles`, `menu_items`, `sales`
- Validate counts and integrity
- Backup: `pg_dump "postgres://..." > backup.sql`

## Application Updates

- API endpoints use Neon client via `lib/db.ts`
- Frontend components use API routes which interact with Neon
- Error handling: try/catch with user feedback

## CI/CD

- Add job to apply migrations on staging
- Use environment secrets scoped to staging/production

## Monitoring and Logging

- Neon Console (Query performance, usage)
- Application logs

## Testing

- Integration tests:
  - `tests/integration/storage.test.ts`
  - `tests/integration/auth.test.ts`
- Role-based flows: test with seeded users for different roles

## Rollback Procedures

1. Create backup before migrations
2. Revert schema changes if possible (DOWN scripts)
3. Restore via `psql "postgres://..." < backup.sql`
4. Re-verify diagnostics endpoints and tests

## Notes

- Never expose `DATABASE_URL` in browser contexts (it contains the password).
- Always use server-side API routes for database operations.
