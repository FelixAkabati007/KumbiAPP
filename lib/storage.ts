type UploadOptions = {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
  metadata?: Record<string, string> | null;
};

// Mock storage implementation (e.g. for S3/R2)
export async function storageUpload(
  bucket: string,
  path: string,
  content: Blob | File | ArrayBuffer | Uint8Array,
  options?: UploadOptions,
) {
  // console.log(`[Mock Storage] Uploading to ${bucket}/${path}`, options);
  return { path, fullPath: `${bucket}/${path}` };
}

export async function storageDownload(bucket: string, path: string) {
  // console.log(`[Mock Storage] Downloading from ${bucket}/${path}`);
  return new Blob(["Mock content"]);
}

export async function storageRemove(bucket: string, paths: string[]) {
  // console.log(`[Mock Storage] Removing from ${bucket}`, paths);
  return paths.map((p) => ({ path: p }));
}

export async function storageList(bucket: string, prefix = "", _limit = 100) {
  // console.log(
  //   `[Mock Storage] Listing ${bucket} prefix=${prefix} limit=${_limit}`,
  // );
  return [];
}

export async function storageSignedUrl(
  bucket: string,
  path: string,
  _expiresIn = 60,
) {
  // console.log(
  //   `[Mock Storage] Signed URL for ${bucket}/${path} expiresIn=${_expiresIn}`,
  // );
  return `https://example.com/mock-storage/${bucket}/${path}?token=mock`;
}

export async function storageUpdate(
  bucket: string,
  path: string,
  content: Blob | File | ArrayBuffer | Uint8Array,
  options?: UploadOptions,
) {
  return storageUpload(bucket, path, content, {
    ...(options ?? {}),
    upsert: true,
  });
}
