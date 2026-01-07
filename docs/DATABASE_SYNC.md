# Database Synchronization & Migration Guide

This document outlines the procedures for synchronizing the application's local schema definition with the remote Neon SQL database.

## Overview

The application uses a "Schema-First" approach where `database/schema.sql` serves as the primary source of truth for table creation, and `lib/db-schema.ts` serves as the structural definition for integrity checks and drift detection.

## Synchronization Process

The synchronization mechanism is implemented in `scripts/sync-db.ts`. It performs the following steps:

1.  **Base Migration**: Executes `database/schema.sql` using an idempotent `CREATE TABLE IF NOT EXISTS` strategy. This ensures all tables defined in the SQL file exist in the database.
2.  **Schema Verification**: Compares the actual database state (queried via `information_schema`) against the expected schema defined in `lib/db-schema.ts`.
3.  **Drift Detection & Auto-Fix**:
    *   Identifies missing tables.
    *   Identifies missing columns.
    *   Attempts to automatically add missing columns (nullable by default for safety).
    *   Reports any other discrepancies (e.g., type mismatches) as warnings.

### How to Run Synchronization

```bash
npm run db:sync
# or
npx tsx scripts/sync-db.ts
```

## Verification Checks

After synchronization, it is recommended to run the integrity verification script `scripts/verify-db-integrity.ts`. This script checks:

1.  **Connection Health**: Verifies active connection to Neon.
2.  **Critical Table Access**: Performs `COUNT(*)` queries on key tables (`users`, `orders`, `menu_items`) to ensure read permissions and table existence.
3.  **Type Integrity**: Checks for the existence of custom ENUM types (e.g., `user_role`).

### How to Run Verification

```bash
npm run db:verify
# or
npx tsx scripts/verify-db-integrity.ts
```

## Rollback Procedures

In case of a failed migration or data corruption during synchronization:

### 1. Schema Rollback
Since the migration script runs within a transaction (BEGIN/COMMIT), most failures during the execution will automatically rollback the specific batch of changes.

If a bad migration was committed:
1.  Identify the breaking change.
2.  Manually connect to the database using a SQL client or the Neon Console.
3.  Execute `ALTER TABLE` commands to reverse the specific changes (e.g., `DROP COLUMN`).

### 2. Full Reset (Development Only)
**WARNING: This will delete all data.**

To completely reset the database state to the baseline `schema.sql`:

1.  Drop the `public` schema (requires admin privileges):
    ```sql
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    ```
2.  Run the synchronization script again:
    ```bash
    npm run db:sync
    ```

## Monitoring

The `db:sync` and `db:verify` scripts output structured logs. For continuous monitoring, these scripts can be scheduled (e.g., via Cron or CI/CD pipelines) to alert on failure (exit code 1).

## Adding New Features

When adding new tables or columns:
1.  Update `database/schema.sql` with the new SQL definitions.
2.  Update `lib/db-schema.ts` with the corresponding TypeScript definition.
3.  Run `npm run db:sync` to apply changes.
