# Neon Connection Implementation

## Install Client

```
npm install @neondatabase/serverless
```

## Configuration

Use environment variables:

- `DATABASE_URL` (Connection string from Neon Dashboard)
  Example: `postgres://user:pass@ep-project-123456.region.aws.neon.tech/neondb?sslmode=require`

## Client Initialization

See `lib/db.ts` for initialization with connection pooling and error handling.

## Error Handling

- `lib/db.ts` logs errors and handles connection timeouts.
- Ensure `DATABASE_URL` is set in `.env.local`.

## Connectivity Test

- Endpoint: `GET /env-test`
- Returns status of database connection.

## Production Env

- Set `DATABASE_URL` in Vercel project settings or similar.
- Do not commit secrets; use CI secrets.

## RLS Policies

- Neon is standard Postgres. You can define RLS policies in SQL.
- Application logic typically handles authorization via API routes.

## Migrations

- Schema in `database-schema.sql`.
- Apply via `psql` or external migration tools.

## Notes

- Connection pooling is critical for serverless environments. `@neondatabase/serverless` handles this with Neon's infrastructure.
- Always access the database from server-side code (API routes, Server Actions, or `getServerSideProps`).
