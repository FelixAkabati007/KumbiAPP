# Migration to Neon – Plan, Implementation, Testing, Deployment

## 1. Planning Phase

- Schema Analysis
  - Legacy schema: `customers`, `products`, `orders`, `orderitems`, `kitchenorders`, `menuitems`, `refundrequests`, admin logs, etc.
  - Neon schema: `tenants`, `profiles`, `menu_items`, `inventory_items`, `sales`, `refunds`, `settings`, `sales_ledger`.
- Relationships & Constraints
  - Legacy orders → orderitems; kitchenorders → kitchen_orderitems; refundrequests → kitchenorders/users.
  - Neon: tenant-scoped entities; `sales` hold items as JSONB; `refunds` tied to `sales`.
- Preservation Targets
  - Data types: uuid, numeric(12,2), jsonb, timestamptz
  - Indexes: tenant_id filters, status/date for reporting
  - Features: RLS policies, triggers for inventory notifications
- Migration Plan
  - Create a dedicated tenant to hold migrated legacy data
  - Map `menuitems` → `menu_items`; `kitchenorders` → `sales`; `refundrequests` → `refunds`
  - Use mapping tables to track legacy→new IDs for rollback
  - Timeline: Plan (1–2 days), Implement (2–4 days), Test (2–3 days), Deploy (1 day), Buffer (1–2 days)
- Rollback Procedure
  - Use DOWN scripts to delete migrated rows and drop mapping tables
  - Restore backup if needed (see Backup)

## 2. Implementation Phase

- Neon Project Setup
  - Configure env vars: `DATABASE_URL`
  - Initialize client: `lib/db.ts`
- Schema Recreation & Enhancements
  - Apply core schema: `database-schema.sql`
  - Add indexes and constraints
- Data Migration Scripts
  - Use SQL scripts to move legacy data into Neon tables under a dedicated tenant
  - Mapping tables: `migration_menu_map`, `migration_order_map`
- Data Transformations
  - Items JSON assembled from `kitchen_orderitems` and `menuitems`
  - Refunds audit JSON includes method/transactionid

## 3. Testing Phase

- Integrity Checks
  - Compare counts pre/post migration for `menuitems` vs `menu_items`, `kitchenorders` vs `sales`, `refundrequests` vs `refunds`
  - Spot-check samples (totals, statuses, timestamps)
- Application Tests
  - Run `npm run test`; ensure auth/storage/theme flows pass
  - Use diagnostics endpoints to confirm connectivity
- Performance Benchmarks
  - Measure queries on `sales`/`inventory_items` with filters for tenant/status/date
  - Optimize indexes if necessary

## 4. Deployment Phase

- Coordination
  - Announce migration window; freeze writes during transfer
  - Stage changes and validate before prod
- Configuration
  - Update env vars in production hosting (`DATABASE_URL`)
  - Confirm CI migrations job runs and succeeds
- Monitoring
  - Neon Console (Query performance)
  - App logs around critical flows (orders, refunds)

## Backup and Restore

- Backup before migration:

```bash
pg_dump "postgres://user:pass@host/dbname" > backup_pre_migration.sql
```

- Restore:

```bash
psql "postgres://user:pass@host/dbname" < backup_pre_migration.sql
```

## Challenges and Solutions

- Dual schema coexistence: segregated legacy and Neon tracks; added views and mappings where needed
- Missing JWT claims: implemented fallback functions reading `profiles`
- Storage metadata/logging: created tables to avoid runtime references to non-existent entities
- Environmental build issues on Windows: advise Admin mode and cleaning `.next`

## Verification Checklist

- [ ] Migrations applied on staging
- [ ] Counts match for migrated entities
- [ ] App tests pass against Neon
- [ ] Diagnostics endpoints return `{ ok: true }`
- [ ] CI pipeline green
- [ ] Rollback scripts documented and tested on staging
