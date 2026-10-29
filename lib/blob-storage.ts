import { put, get } from "@vercel/blob";
import { query } from "./db";

export interface BlobResult {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
  data?: Buffer;
}

export interface GetBlobResult {
  statusCode?: number;
  stream?: ReadableStream;
  data?: Buffer;
  contentType: string;
  etag: string;
}

let blobsTableEnsured = false;

/**
 * Ensures the blobs table exists in the database.
 */
export async function ensureBlobsTable(): Promise<void> {
  if (blobsTableEnsured) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS blobs (
        id SERIAL PRIMARY KEY,
        pathname TEXT UNIQUE NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        size INTEGER NOT NULL DEFAULT 0,
        data BYTEA NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_blobs_pathname ON blobs(pathname);
    `);
    blobsTableEnsured = true;
  } catch (err) {
    console.error("Failed to ensure blobs table in database:", err);
  }
}

/**
 * Saves a blob directly into the Neon PostgreSQL database.
 */
export async function saveDatabaseBlob(
  pathname: string,
  data: Buffer | ArrayBuffer | Uint8Array | Blob | File | string,
  contentType: string
): Promise<BlobResult> {
  await ensureBlobsTable();

  let buffer: Buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else if (data instanceof Uint8Array) {
    buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else if (typeof (data as Blob).arrayBuffer === "function") {
    buffer = Buffer.from(await (data as Blob).arrayBuffer());
  } else {
    buffer = Buffer.from(String(data));
  }

  const size = buffer.length;
  const cleanPathname = pathname.replace(/^\/+/, "");
  const url = `/api/blob?pathname=${encodeURIComponent(cleanPathname)}`;

  await query(
    `INSERT INTO blobs (pathname, content_type, size, data, url, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (pathname) DO UPDATE
     SET content_type = EXCLUDED.content_type,
         size = EXCLUDED.size,
         data = EXCLUDED.data,
         url = EXCLUDED.url,
         updated_at = CURRENT_TIMESTAMP`,
    [cleanPathname, contentType, size, buffer, url]
  );

  return {
    url,
    pathname: cleanPathname,
    contentType,
    size,
    data: buffer,
  };
}

/**
 * Retrieves a blob from the Neon PostgreSQL database.
 */
export async function getDatabaseBlob(
  pathname: string
): Promise<(BlobResult & { etag: string }) | null> {
  await ensureBlobsTable();

  const cleanPathname = pathname.replace(/^\/+/, "");
  const result = await query(
    `SELECT pathname, content_type, size, data, url, updated_at
     FROM blobs
     WHERE pathname = $1
     LIMIT 1`,
    [cleanPathname]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const etag = `"${Buffer.from(row.pathname + (row.updated_at?.toString() || "")).toString("base64")}"`;

  return {
    pathname: row.pathname,
    contentType: row.content_type,
    size: row.size,
    data: row.data,
    url: row.url,
    etag,
  };
}

/**
 * Deletes a blob from the database.
 */
export async function deleteDatabaseBlob(pathname: string): Promise<boolean> {
  await ensureBlobsTable();

  const cleanPathname = pathname.replace(/^\/+/, "");
  const result = await query(`DELETE FROM blobs WHERE pathname = $1`, [cleanPathname]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Lists blobs matching a prefix from the database.
 */
export async function listDatabaseBlobs(prefix = ""): Promise<BlobResult[]> {
  await ensureBlobsTable();

  const cleanPrefix = prefix.replace(/^\/+/, "");
  const result = await query(
    `SELECT pathname, content_type, size, url
     FROM blobs
     WHERE pathname LIKE $1
     ORDER BY updated_at DESC`,
    [`${cleanPrefix}%`]
  );

  return result.rows.map((row) => ({
    pathname: row.pathname,
    contentType: row.content_type,
    size: row.size,
    url: row.url,
  }));
}

/**
 * Primary blob upload helper: attempts Vercel Blob first (if configured),
 * falling back seamlessly to Neon database blob storage.
 */
export async function putBlob(
  pathname: string,
  body: Buffer | ArrayBuffer | Uint8Array | Blob | File | string,
  options?: {
    access?: "public" | "private";
    contentType?: string;
    addRandomSuffix?: boolean;
  }
): Promise<{ url: string; pathname: string; contentType?: string }> {
  const hasVercelBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

  if (hasVercelBlobToken) {
    try {
      const blob = await put(pathname, body as unknown as Parameters<typeof put>[1], {
        access: options?.access ?? "public",
        addRandomSuffix: options?.addRandomSuffix ?? false,
        contentType: options?.contentType,
      });
      return { url: blob.url, pathname: blob.pathname, contentType: options?.contentType };
    } catch (err: unknown) {
      console.warn("Vercel Blob upload failed, falling back to database blob storage:", err);
    }
  }

  const determinedContentType =
    options?.contentType ||
    (body instanceof File ? body.type : "application/octet-stream");

  const result = await saveDatabaseBlob(
    pathname,
    body as unknown as Parameters<typeof saveDatabaseBlob>[1],
    determinedContentType
  );
  return {
    url: result.url,
    pathname: result.pathname,
    contentType: result.contentType,
  };
}

/**
 * Primary blob retrieval helper: attempts Vercel Blob first (if configured),
 * falling back seamlessly to Neon database blob storage.
 */
export async function getBlob(
  pathname: string,
  options?: {
    access?: "public" | "private";
    ifNoneMatch?: string;
  }
): Promise<GetBlobResult | null> {
  const hasVercelBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

  if (hasVercelBlobToken) {
    try {
      const result = await get(pathname, {
        access: options?.access ?? "private",
        ifNoneMatch: options?.ifNoneMatch,
      });
      if (result) {
        if (result.statusCode === 304) {
          return {
            statusCode: 304,
            contentType: result.blob.contentType ?? "application/octet-stream",
            etag: result.blob.etag,
          };
        }
        return {
          stream: result.stream,
          contentType: result.blob.contentType ?? "application/octet-stream",
          etag: result.blob.etag,
        };
      }
    } catch {
      // Fallback to database
    }
  }

  const dbBlob = await getDatabaseBlob(pathname);
  if (!dbBlob) return null;

  if (options?.ifNoneMatch && options.ifNoneMatch === dbBlob.etag) {
    return {
      statusCode: 304,
      contentType: dbBlob.contentType,
      etag: dbBlob.etag,
    };
  }

  return {
    data: dbBlob.data,
    contentType: dbBlob.contentType,
    etag: dbBlob.etag,
  };
}
