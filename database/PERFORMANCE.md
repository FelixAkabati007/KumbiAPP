# Database Performance & Optimization

## Indexing Strategy
We use B-tree indexes for frequently queried columns:
1.  **Foreign Keys**: All FK columns (`user_id`, `order_id`, etc.) are indexed to speed up joins.
2.  **Status Columns**: `status` columns on Orders and Refunds are indexed for filtering dashboard views.
3.  **Search Fields**: `email` on Users and `barcode` on Menu Items are unique and indexed.
4.  **Dates**: `created_at` on Orders and Transactions for reporting queries.

## Connection Pooling
- **Neon Serverless Driver**: We use the `@neondatabase/serverless` driver which is optimized for serverless environments (Vercel).
- **Pool Configuration**:
    - `max`: 10 (Adjust based on Vercel function concurrency)
    - `idleTimeoutMillis`: 1000
    - `connectionTimeoutMillis`: 5000

## Query Optimization
- **Pagination**: All list endpoints should implement `LIMIT` and `OFFSET`.
- **Selectivity**: Avoid `SELECT *`. Fetch only required columns.
- **Transactions**: Use database transactions (`BEGIN`, `COMMIT`) for multi-step operations (e.g., creating order + items).

## Caching
- **Next.js Cache**: Leverage Next.js `unstable_cache` or `fetch` caching for static data like Categories and Menu Items.
- **Revalidation**: Use tag-based revalidation to clear cache on updates.
