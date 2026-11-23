-- Migration: Add unique index for transaction_reference and create operational_outbox table
-- Ensures idempotent inserts work reliably across Neon Postgres database instances

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_transaction_reference
ON transactions(transaction_reference)
WHERE transaction_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS operational_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    available_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_outbox_idempotency_key
ON operational_outbox(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_operational_outbox_status_available
ON operational_outbox(status, available_at);
