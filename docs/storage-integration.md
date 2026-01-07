# Storage Integration

## Setup

The application uses an abstracted storage interface located in `lib/storage.ts`.
Currently, this is implemented as a mock/local storage for development, but can be adapted for S3, Cloudflare R2, or other object storage providers.

## API

- `lib/storage.ts`
  - `storageUpload(bucket, path, content, options)`
  - `storageDownload(bucket, path)`
  - `storageUpdate(bucket, path, content, options)`
  - `storageRemove(bucket, paths)`
  - `storageList(bucket, prefix, limit)`
  - `storageSignedUrl(bucket, path, expiresIn)`

## Configuration

For production storage (e.g., AWS S3), you would typically configure:

- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`
- `STORAGE_BUCKET`
- `STORAGE_REGION`
- `STORAGE_ENDPOINT`

## Error Handling

- All functions throw on errors; wrap calls in `try/catch`
- Logs can be added around calls for debugging

## Integration Tests

- `tests/integration/storage.test.ts`
  - Verifies upload/download/update/delete logic against the mock or configured provider.

## Notes

- Since Neon is a database-only provider, file storage must be handled by a separate service (S3, R2, UploadThing, etc.).
- The current implementation in `lib/storage.ts` is a placeholder.
