# DEPLOY.md

This document explains how to apply the SQL migrations, enable RLS, deploy Next.js API Routes, and set secrets. Commands are PowerShell-friendly (Windows).

## Prerequisites

- Install Node.js (recommended LTS) and pnpm or npm.
- Make sure you have a Neon project and the following secrets available:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `SESSION_SECRET`
  - `STRIPE_SECRET_KEY` (if using Stripe)
  - `STRIPE_WEBHOOK_SECRET` (if using Stripe)

## Important security note

- Never expose the `DATABASE_URL` or `STRIPE_SECRET_KEY` in client-side code or public repos. Store them in environment secrets.

## 1. Apply database migrations

This repository includes `database-schema.sql` in the repo root.

- Using psql (Postgres CLI):

```powershell
# set connection string
$env:DATABASE_URL = "postgres://user:pass@host/dbname?sslmode=require"

# apply the schema
psql $env:DATABASE_URL -f database-schema.sql
```

Notes:

- After applying migrations, verify tables exist using `psql` or Neon Dashboard.

## 2. Deploy API Routes

This repo uses Next.js API Routes (Serverless Functions).

- When deploying to Vercel, these are automatically handled.
- Ensure your `DATABASE_URL` is set in the Vercel project settings.

## 3. Set environment variables/secrets

Use the Vercel dashboard or CLI to set secrets.

```powershell
# Example with Vercel CLI
vercel env add DATABASE_URL
vercel env add JWT_SECRET
vercel env add SESSION_SECRET
```

## 4. Configure webhook endpoint with Stripe

- After deploying, note the public URL of your webhook endpoint (e.g., `https://your-app.vercel.app/api/webhooks/stripe`) and register it in the Stripe dashboard.

## 5. Verifications / Smoke tests

- Create a test order via POS UI and confirm entry in `sales` table.
- Trigger a Stripe test payment using Stripe CLI or test card numbers.

## 6. GitHub Actions

- A sample workflow file is available in `.github/workflows/ci.yml`.
