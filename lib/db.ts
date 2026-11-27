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
  var dbActiveUrlIndex: number | undefined;
  var dbPoolsByUrl: Map<string, Pool> | undefined;
}

/**
 * Returns all distinct non-empty PostgreSQL connection strings configured in the environment.
 * Allows automatic failover if an older Neon integration URL (e.g. KUMRESH_DB_DATABASE_URL)
 * has exceeded its quota while DATABASE_URL / POSTGRES_URL points to an active Neon project.
 */
export function getDatabaseConnectionCandidates(): string[] {
  const raw = [
    process.env.KUMRESH_DB_DATABASE_URL,
    process.env.KUMRESH_DB_POSTGRES_URL,
    process.env.NEON_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DB_URL,
  ];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const val of raw) {
    const trimmed = typeof val === "string" ? val.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

/**
 * Resolves the active Neon database connection string.
 */
export function getDatabaseConnectionString(): string {
  const candidates = getDatabaseConnectionCandidates();
  if (candidates.length === 0) return "";
  const idx = globalForDb.dbActiveUrlIndex ?? 0;
  return candidates[Math.min(idx, candidates.length - 1)] ?? candidates[0] ?? "";
}

export function isDatabaseQuotaExceededError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? String((error as { message: string }).message)
        : String(error ?? "");
  const lower = msg.toLowerCase();
  return (
    lower.includes("exceeded the quota") ||
    lower.includes("exceeded the compute time quota") ||
    lower.includes("exceeded the data transfer quota") ||
    lower.includes("compute time limit") ||
    lower.includes("project size limit")
  );
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  if (isDatabaseQuotaExceededError(error)) return true;
  const pgError = error as { code?: string; message?: string };
  const msg = String(pgError?.message ?? "").toLowerCase();
  return (
    pgError?.code === "57P01" ||
    pgError?.code === "57P02" ||
    pgError?.code === "57P03" ||
    pgError?.code === "08001" ||
    pgError?.code === "08003" ||
    pgError?.code === "08006" ||
    msg.includes("neon database connection string is not defined") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("connection terminated") ||
    msg.includes("timeout")
  );
}

const poolMax = Number(process.env.DB_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 5 : 20));
const idleTimeoutMillis = Number(process.env.DB_IDLE_TIMEOUT_MS ?? 10000);
const connectionTimeoutMillis = Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000);

// Configures Neon to use the 'ws' package for WebSocket connections in Node environments
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

const globalForDb = globalThis as unknown as {
  dbPool?: Pool;
  dbActiveUrlIndex?: number;
  dbPoolsByUrl?: Map<string, Pool>;
};

function getOrCreatePoolForUrl(connectionString: string): Pool {
  if (!globalForDb.dbPoolsByUrl) {
    globalForDb.dbPoolsByUrl = new Map<string, Pool>();
  }
  const existing = globalForDb.dbPoolsByUrl.get(connectionString);
  if (existing) return existing;

  const poolInstance = new Pool({
    connectionString,
    max: poolMax,
    idleTimeoutMillis,
    connectionTimeoutMillis,
  });

  if (poolInstance.listenerCount("error") === 0) {
    poolInstance.on("error", (err: Error) => {
      console.error("Unexpected error on idle Neon client", err);
    });
  }

  globalForDb.dbPoolsByUrl.set(connectionString, poolInstance);
  return poolInstance;
}

/**
 * Lazy and resilient pool accessor. Never opens a connection at module-import time
 * so Neon can auto-suspend cleanly when idle.
 */
export function getPool(): Pool {
  if (globalForDb.dbPool) return globalForDb.dbPool;

  const connectionString = getDatabaseConnectionString();
  if (!connectionString) {
    throw new Error(
      "Neon database connection string is not defined. Please set DATABASE_URL or POSTGRES_URL."
    );
  }

  const poolInstance = getOrCreatePoolForUrl(connectionString);
  globalForDb.dbPool = poolInstance;
  return poolInstance;
}

function tryFailoverToNextPool(): Pool | null {
  const candidates = getDatabaseConnectionCandidates();
  if (candidates.length <= 1) return null;
  const currentIdx = globalForDb.dbActiveUrlIndex ?? 0;
  const nextIdx = (currentIdx + 1) % candidates.length;
  if (nextIdx === currentIdx) return null;
  globalForDb.dbActiveUrlIndex = nextIdx;
  const nextPool = getOrCreatePoolForUrl(candidates[nextIdx]);
  globalForDb.dbPool = nextPool;
  return nextPool;
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
 * Includes transient retry logic and automatic failover across candidate Neon URLs if a project hits quota.
 */
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<R>> {
  let activePool = getPool();
  const candidatesCount = Math.max(1, getDatabaseConnectionCandidates().length);

  const MAX_RETRIES = 3;
  let attempt = 0;
  let failoversTried = 0;

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

      // If current Neon project exceeded quota and another candidate URL is configured, fail over immediately
      if (isDatabaseQuotaExceededError(error) && failoversTried < candidatesCount - 1) {
        const nextPool = tryFailoverToNextPool();
        if (nextPool) {
          failoversTried++;
          activePool = nextPool;
          continue;
        }
      }

      attempt++;
      const pgError = error as { code?: string; message?: string };
      const isRetryable =
        !isDatabaseQuotaExceededError(error) &&
        (pgError.code === "57P01" ||
          pgError.code === "57P02" ||
          pgError.code === "57P03" ||
          pgError.code === "08003" ||
          pgError.code === "08006" ||
          pgError.code === "08001" ||
          pgError.message?.includes("connection") ||
          pgError.message?.includes("timeout") ||
          pgError.message?.includes("ECONNRESET"));

      if (attempt >= MAX_RETRIES || !isRetryable) {
        console.error("Database query error:", {
          text,
          error,
          duration,
          attempt,
        });
        throw error;
      }

      const backoff = 100 * Math.pow(2, attempt);
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
  const candidatesCount = Math.max(1, getDatabaseConnectionCandidates().length);
  let failoversTried = 0;

  while (true) {
    const activePool = getPool();
    try {
      return await activePool.connect();
    } catch (error) {
      if (isDatabaseQuotaExceededError(error) && failoversTried < candidatesCount - 1) {
        const nextPool = tryFailoverToNextPool();
        if (nextPool) {
          failoversTried++;
          continue;
        }
      }
      throw error;
    }
  }
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
