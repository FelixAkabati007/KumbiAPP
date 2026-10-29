import {
  Pool,
  PoolClient,
  QueryResult,
  QueryResultRow,
  neonConfig,
} from "@neondatabase/serverless";
import ws from "ws";

declare global {
  // var required here: TypeScript global augmentation only allows var declarations
  var dbPool: Pool | undefined;
}

/**
 * Resolves the Neon database connection string checking standard and platform-specific environment variables.
 */
export function getDatabaseConnectionString(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.KUMRESH_DB_DATABASE_URL ||
    process.env.KUMRESH_DB_POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL ||
    process.env.DB_URL ||
    ""
  );
}

const poolMax = Number(process.env.DB_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 8 : 20));
const idleTimeoutMillis = Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000);
const connectionTimeoutMillis = Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000);

// Configures Neon to use the 'ws' package for WebSocket connections in Node environments
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

let pool: Pool | undefined = undefined;

/**
 * Lazy and resilient pool accessor. Re-checks environment variables on call
 * so hot reloads and late-injected env vars don't leave an empty pool.
 */
export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = getDatabaseConnectionString();
  if (!connectionString) {
    throw new Error(
      "Neon database connection string is not defined. Please set DATABASE_URL or POSTGRES_URL."
    );
  }

  if (process.env.NODE_ENV === "production") {
    pool = new Pool({
      connectionString,
      max: poolMax,
      idleTimeoutMillis,
      connectionTimeoutMillis,
    });
  } else {
    if (!global.dbPool) {
      global.dbPool = new Pool({
        connectionString,
        max: poolMax,
        idleTimeoutMillis,
        connectionTimeoutMillis,
      });
    }
    pool = global.dbPool;
  }

  if (pool && pool.listenerCount("error") === 0) {
    pool.on("error", (err: Error) => {
      console.error("Unexpected error on idle Neon client", err);
    });
  }

  return pool;
}

// Auto-initialize if connection string is immediately present
try {
  if (getDatabaseConnectionString()) {
    getPool();
  }
} catch {
  // Will initialize on first query call
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const connStr = getDatabaseConnectionString();
    if (!connStr) return false;
    await query("SELECT 1");
    return true;
  } catch (e) {
    console.error("Database health check failed:", e);
    return false;
  }
}

/**
 * Execute a query with parameters using the connection pool.
 * This is the primary method for database interactions.
 * Includes retry logic for transient connection errors.
 *
 * @param text The SQL query text
 * @param params Optional array of parameters
 * @returns The query result
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<R>> {
  const activePool = getPool();

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (true) {
    const start = Date.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await activePool.query<R>(text, params as any[]);
      const duration = Date.now() - start;
      if (duration > 200) {
        console.warn("[db] slow query", {
          durationMs: duration,
          rows: res.rowCount,
          operation: text.trim().split(/\s+/)[0]?.toUpperCase(),
        });
      }
      return res;
    } catch (error) {
      const duration = Date.now() - start;
      attempt++;

      // Check if error is retryable (connection issues)
      const pgError = error as { code?: string; message?: string };
      const isRetryable =
        pgError.code === "57P01" || // admin_shutdown
        pgError.code === "57P02" || // crash_shutdown
        pgError.code === "57P03" || // cannot_connect_now
        pgError.code === "08003" || // connection_does_not_exist
        pgError.code === "08006" || // connection_failure
        pgError.code === "08001" || // sqlclient_unable_to_establish_sqlconnection
        pgError.message?.includes("connection") ||
        pgError.message?.includes("timeout") ||
        pgError.message?.includes("ECONNRESET");

      if (attempt >= MAX_RETRIES || !isRetryable) {
        console.error("Database query error:", {
          text,
          error,
          duration,
          attempt,
        });
        throw error;
      }

      const backoff = 100 * Math.pow(2, attempt); // 200ms, 400ms, 800ms
      console.warn(
        `Database query failed (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${backoff}ms...`,
        { error: (error as Error).message }
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

/**
 * Get a client from the pool to execute a transaction.
 * NOTE: You MUST call client.release() when finished.
 */
export async function getClient(): Promise<PoolClient> {
  const activePool = getPool();
  const client = await activePool.connect();
  return client;
}

export type DatabaseClient = PoolClient;

/**
 * Helper function to execute a transaction safely.
 * Handles BEGIN, COMMIT, and ROLLBACK automatically.
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Health check function
export async function checkConnection(): Promise<boolean> {
  try {
    const connStr = getDatabaseConnectionString();
    if (!connStr) return false;
    const res = await query("SELECT NOW()");
    return res.rowCount !== null && res.rowCount > 0;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}
