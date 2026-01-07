# Database Security & Access Control

## Authentication & Authorization
- **App-Level Auth**: The application handles user authentication.
- **Database Roles**: The application connects using a service role. Granular database roles are planned for future direct-access requirements.

## Row Level Security (RLS)
RLS is enabled on `users`, `orders`, and `transactions` tables.
- **Current Policy**: Permissive (`USING (true)`) to support the single-tenant service role architecture.
- **Future Policy**: Will implement `current_user_id()` based policies when session context is passed to the DB.

## Data Protection
- **Encryption in Transit**: All connections to Neon are SSL/TLS encrypted.
- **Sensitive Data**:
    - Passwords are hashed (Bcrypt) before storage.
    - PII (Customer Name, Email) is stored only when necessary.

## Backup & Recovery
- **Neon Point-in-Time Recovery (PITR)**: Neon provides automatic history retention.
- **Manual Backups**: `pg_dump` can be used for off-site backups.
