import {
  Pool,
  PoolClient,
  QueryResult,
  QueryResultRow,
  neonConfig,
} from "@neondatabase/serverless";
import ws from "ws";

declare global {
  // eslint-disable-next-line no-var
  var dbPool: Pool | undefined;
}

// Configuration for the database connection
const connectionString = process.env.DATABASE_URL || process.env.DB_URL;

if (!connectionString) {
  console.warn(
    "DATABASE_URL (or DB_URL) environment variable is not defined. Database functionality will not work."
  );
}

// Configures Neon to use the 'ws' package for WebSocket connections
// This is required for Node.js environments where global WebSocket is not available
neonConfig.webSocketConstructor = ws;

// Singleton pattern for the database pool
// This prevents multiple pools from being created during hot reloading in development
// which can exhaust the database connection limit.
let pool: Pool | undefined = undefined;

if (connectionString) {
  if (process.env.NODE_ENV === "production") {
    pool = new Pool({
      connectionString,
      max: 2, // Maximum number of clients in the pool (lowered for serverless)
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
    });
  } else {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    if (!global.dbPool) {
      global.dbPool = new Pool({
        connectionString,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    }
    pool = global.dbPool;
  }
}

// Event listeners for pool health monitoring
// Only attach listeners if they haven't been attached (tricky in dev, but okay for logging)
if (pool && pool.listenerCount("error") === 0) {
  pool.on("error", (err: Error) => {
    console.error("Unexpected error on idle client", err);
  });
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
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
  if (!pool) {
    throw new Error(
      "Database pool is not initialized. Check DATABASE_URL environment variable."
    );
  }

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (true) {
    const start = Date.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await pool.query<R>(text, params as any[]);
      const duration = Date.now() - start;
      // Log slow queries for performance optimization
      // if (duration > 100) {
      //   console.log("Executed query", { text, duration, rows: res.rowCount });
      // }
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
 *
 * Usage:
 * const client = await getClient();
 * try {
 *   await client.query('BEGIN');
 *   // ... operations ...
 *   await client.query('COMMIT');
 * } catch (e) {
 *   await client.query('ROLLBACK');
 *   throw e;
 * } finally {
 *   client.release();
 * }
 */
export async function getClient(): Promise<PoolClient> {
  if (!pool) {
    throw new Error(
      "Database pool is not initialized. Check DATABASE_URL environment variable."
    );
  }
  const client = await pool.connect();
  return client;
}

/**
 * Helper function to execute a transaction safely.
 * Handles BEGIN, COMMIT, and ROLLBACK automatically.
 *
 * @param callback Function to execute within the transaction
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
    const res = await query("SELECT NOW()");
    return res.rowCount !== null && res.rowCount > 0;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  }
}
