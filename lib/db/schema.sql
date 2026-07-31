-- Schema definition for KHHREST (Neon PostgreSQL)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Transaction Logs Table
CREATE TABLE IF NOT EXISTS transaction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'GHS',
    status VARCHAR(50) NOT NULL,
    payment_method VARCHAR(50),
    customer_id VARCHAR(255),
    items JSONB, -- Store order items as JSON
    metadata JSONB, -- specific gateway response data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transaction_logs_transaction_id ON transaction_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_logs_created_at ON transaction_logs(created_at);

-- Users Table (Example)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'staff',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Hotel Management Tables

-- Room Types Table
CREATE TABLE IF NOT EXISTS room_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_price DECIMAL(10, 2) NOT NULL,
    max_occupants INT NOT NULL DEFAULT 1,
    amenities JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rooms Table
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_number VARCHAR(50) NOT NULL UNIQUE,
    room_type_id UUID NOT NULL REFERENCES room_types(id),
    floor INT,
    building VARCHAR(255),
    status VARCHAR(50) DEFAULT 'available', -- available, occupied, reserved, dirty, cleaning, maintenance, out_of_order
    current_guest_id UUID,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Guests Table
CREATE TABLE IF NOT EXISTS guests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    id_type VARCHAR(50), -- passport, national_id, etc
    id_number VARCHAR(255),
    country VARCHAR(255),
    address TEXT,
    loyalty_points INT DEFAULT 0,
    total_stays INT DEFAULT 0,
    is_vip BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reservations Table
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_number VARCHAR(50) NOT NULL UNIQUE,
    guest_id UUID NOT NULL REFERENCES guests(id),
    room_id UUID REFERENCES rooms(id),
    room_type_id UUID NOT NULL REFERENCES room_types(id),
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    number_of_guests INT NOT NULL DEFAULT 1,
    status VARCHAR(50) DEFAULT 'confirmed', -- confirmed, checked_in, checked_out, cancelled
    total_price DECIMAL(10, 2),
    paid_amount DECIMAL(10, 2) DEFAULT 0,
    special_requests TEXT,
    source VARCHAR(50), -- walk_in, online, phone, corporate, promo
    promo_code VARCHAR(100),
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Housekeeping Table
CREATE TABLE IF NOT EXISTS housekeeping_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id),
    task_type VARCHAR(50) NOT NULL, -- cleaning, maintenance, inspection
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, on_hold
    assigned_to UUID REFERENCES users(id),
    priority VARCHAR(50) DEFAULT 'normal', -- low, normal, high, urgent
    notes TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Maintenance Tickets Table
CREATE TABLE IF NOT EXISTS maintenance_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(50) NOT NULL UNIQUE,
    room_id UUID REFERENCES rooms(id),
    issue_description TEXT NOT NULL,
    severity VARCHAR(50) DEFAULT 'normal', -- low, normal, high, urgent
    status VARCHAR(50) DEFAULT 'open', -- open, in_progress, completed, cancelled
    assigned_to UUID REFERENCES users(id),
    notes TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Guest Folio (Room Charges) Table
CREATE TABLE IF NOT EXISTS guest_folios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL REFERENCES reservations(id),
    room_charge DECIMAL(10, 2) NOT NULL DEFAULT 0,
    service_charges DECIMAL(10, 2) DEFAULT 0,
    food_charges DECIMAL(10, 2) DEFAULT 0,
    other_charges DECIMAL(10, 2) DEFAULT 0,
    total_charges DECIMAL(10, 2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(10, 2) DEFAULT 0,
    balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for hotel tables
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON rooms(room_type_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_reservations_guest_id ON reservations(guest_id);
CREATE INDEX IF NOT EXISTS idx_reservations_room_id ON reservations(room_id);
CREATE INDEX IF NOT EXISTS idx_reservations_check_in ON reservations(check_in_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_housekeeping_room_id ON housekeeping_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_status ON housekeeping_tasks(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_room_id ON maintenance_tickets(room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_tickets(status);
CREATE INDEX IF NOT EXISTS idx_guest_folios_reservation_id ON guest_folios(reservation_id);
