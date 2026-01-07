# Neon Database Setup Guide

This project uses [Neon](https://neon.tech), a serverless Postgres database, for data storage. This guide documents the connection setup, configuration, and usage patterns.

## 1. Configuration

The database connection is configured in the `.env.local` file using the `DATABASE_URL` environment variable.

### Environment Variables

| Variable       | Description                                | Format                                                   |
| -------------- | ------------------------------------------ | -------------------------------------------------------- |
| `DATABASE_URL` | The standard PostgreSQL connection string. | `postgresql://user:password@host/dbname?sslmode=require` |

### Connection Pooling

We use `@neondatabase/serverless` which is optimized for serverless environments (like Next.js). It handles connection pooling automatically to prevent exhausting database connections during high traffic or serverless function scaling.

**Pool Configuration (`lib/db.ts`):**

- **Max Clients:** 20 (Adjustable based on plan)
- **Idle Timeout:** 30 seconds
- **Connection Timeout:** 2 seconds

## 2. Usage

### Importing the Database Client

Use the `query` function from `@/lib/db` for standard queries:

```typescript
import { query } from "@/lib/db";

async function getUsers() {
  const result = await query("SELECT * FROM users WHERE active = $1", [true]);
  return result.rows;
}
```

### Transactions

For operations requiring atomicity, use the `transaction` helper:

```typescript
import { transaction } from "@/lib/db";

async function transferFunds(fromId, toId, amount) {
  return await transaction(async (client) => {
    await client.query(
      "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
      [amount, fromId],
    );
    await client.query(
      "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
      [amount, toId],
    );
    return "Transfer successful";
  });
}
```

## 3. Troubleshooting

### Common Issues

1.  **Connection Timeout:**
    - **Cause:** Network issues or database is paused (Neon auto-suspends inactive compute).
    - **Solution:** The application automatically attempts to reconnect. Initial requests after a long pause might take slightly longer (cold start).

2.  **"SSL/TLS required" Error:**
    - **Cause:** Missing `sslmode=require` in connection string.
    - **Solution:** Ensure `?sslmode=require` is appended to `DATABASE_URL`.

3.  **Authentication Failed:**
    - **Cause:** Incorrect password or user.
    - **Solution:** Verify credentials in Neon Console and update `.env.local`.

### Testing Connectivity

Access the test API route to verify connection health:
`GET http://localhost:3000/api/test-db`

## 4. Performance Best Practices

- **Parameterized Queries:** ALWAYS use parameters (`$1`, `$2`) instead of string concatenation to prevent SQL Injection and allow query plan caching.
- **Connection Reuse:** The `lib/db.ts` module exports a singleton pool. Do not create new `Pool` instances in your API routes.
- **Limit Result Sets:** Use `LIMIT` and `OFFSET` for large queries.
