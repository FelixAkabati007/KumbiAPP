-- Add price and images columns to rooms table
-- This migration allows per-room pricing and image galleries

-- Add price column (nullable, defaults to room type price)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);

-- Add images column (JSONB array for storing image objects)
-- Format: [{"id": "uuid", "url": "string", "type": "blob|url", "uploaded_at": "ISO timestamp", "is_primary": boolean}]
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_rooms_price ON rooms(price);
CREATE INDEX IF NOT EXISTS idx_rooms_images ON rooms USING GIN(images);

-- Add comment for documentation
COMMENT ON COLUMN rooms.price IS 'Per-room price in Ghana Cedis. If NULL, falls back to room_type base_price';
COMMENT ON COLUMN rooms.images IS 'JSONB array of room images with metadata';
