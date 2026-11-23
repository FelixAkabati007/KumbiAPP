-- Migration: Add hotel_receipts table and indexes if not exists
-- Prevents runtime failures if hotel_receipts table has not been provisioned

CREATE TABLE IF NOT EXISTS hotel_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    folio_id UUID REFERENCES guest_folios(id) ON DELETE SET NULL,
    order_id VARCHAR(255) NOT NULL,
    order_number VARCHAR(255) NOT NULL,
    receipt_type VARCHAR(50) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    download_pathname TEXT,
    print_status VARCHAR(50) NOT NULL DEFAULT 'ready',
    print_error TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hotel_receipts_reservation ON hotel_receipts(reservation_id);
CREATE INDEX IF NOT EXISTS idx_hotel_receipts_order ON hotel_receipts(order_id);
CREATE INDEX IF NOT EXISTS idx_hotel_receipts_type ON hotel_receipts(receipt_type);
