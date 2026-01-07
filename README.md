## Project Overview

This is a Next.js application that uses Neon (Serverless Postgres) for backend data storage and authentication.

## Requirements

- Node.js 18+ (recommend LTS)
- npm or pnpm
- A Neon project with `DATABASE_URL`

## Environment Configuration

1. Create a `.env.local` file in the project root.
2. Copy values from `.env.example` and set at minimum:
   - `DATABASE_URL`
3. Optional: configure additional variables used by the app as needed.

For detailed setup, refer to `SETUP_GUIDE.md`.

## Run Locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000/` in your browser.

## Build and Start (Production)

```bash
npm run build
npm start
```

## Neon Integration

- Database schema and migrations are in `database-schema.sql`.
- Database connection is handled via `@neondatabase/serverless`.

## Troubleshooting

- Use `/env-test` and `/env-debug` routes to verify environment configuration.
- Check `SETUP_GUIDE.md` and `BUGS_FIXED.md` for common issues and fixes.

## Notes

- Docker and Docker Compose have been removed. All backend functionality relies on Neon Serverless Postgres.
