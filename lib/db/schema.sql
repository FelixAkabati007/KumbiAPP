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
CREATE INDEX IF NOT EXISTS idx_staff_profiles_classification ON staff_profiles(job_classification, department, employment_status);
CREATE INDEX IF NOT EXISTS idx_maintenance_room_id ON maintenance_tickets(room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_tickets(status);
CREATE INDEX IF NOT EXISTS idx_guest_folios_reservation_id ON guest_folios(reservation_id);

-- Staff Management Tables

-- Enhanced Staff Profiles Table
CREATE TABLE IF NOT EXISTS staff_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    business_email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    department VARCHAR(100),
    position VARCHAR(100),
    job_classification VARCHAR(100) DEFAULT 'other',
    employment_status VARCHAR(50) DEFAULT 'active', -- active, on_leave, terminated
    hire_date DATE,
    password_hash VARCHAR(255) NOT NULL,
    password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_password_1 VARCHAR(255),
    last_password_2 VARCHAR(255),
    last_password_3 VARCHAR(255),
    last_password_4 VARCHAR(255),
    last_password_5 VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    event_scope TEXT NOT NULL DEFAULT 'restaurant'
);

CREATE TABLE IF NOT EXISTS event_staff_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    event_id UUID NOT NULL,
    assignment_type TEXT NOT NULL DEFAULT 'service',
    status TEXT NOT NULL DEFAULT 'assigned',
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (staff_id, event_id, assignment_type)
);

-- Session Management for Shift-Based Access
CREATE TABLE IF NOT EXISTS staff_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    session_token VARCHAR(500) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    inactivity_warned BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    logged_out_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Manager Approval Requests Table
CREATE TABLE IF NOT EXISTS staff_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type VARCHAR(50) NOT NULL, -- create, update, delete
    requested_by UUID NOT NULL REFERENCES staff_profiles(id),
    staff_member_id UUID REFERENCES staff_profiles(id),
    action_data JSONB NOT NULL, -- contains the proposed changes
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    approved_by UUID REFERENCES staff_profiles(id),
    approval_reason TEXT,
    rejection_reason TEXT,
    rejected_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comprehensive Audit Logs Table
CREATE TABLE IF NOT EXISTS staff_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id VARCHAR(50) NOT NULL UNIQUE,
    action_type VARCHAR(100) NOT NULL, -- staff_created, staff_updated, staff_deleted, password_reset, approval_granted, approval_rejected, login, logout, inactivity_warning
    actor_id UUID NOT NULL REFERENCES staff_profiles(id),
    actor_name VARCHAR(255) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    target_staff_id UUID REFERENCES staff_profiles(id),
    target_staff_name VARCHAR(255),
    change_details JSONB, -- specific changes made
    ip_address INET,
    device_fingerprint VARCHAR(255),
    reason TEXT, -- for password resets, approvals, etc
    status VARCHAR(50) DEFAULT 'completed', -- completed, failed
    error_message TEXT,
    timestamp_utc TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Password Reset Tokens Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    initiated_by UUID NOT NULL REFERENCES staff_profiles(id),
    reset_reason TEXT,
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Session Device Tracking
CREATE TABLE IF NOT EXISTS device_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_fingerprint VARCHAR(255) NOT NULL UNIQUE,
    device_name VARCHAR(255),
    device_type VARCHAR(50), -- pos_terminal, mobile, web, kiosk
    last_used_by UUID REFERENCES staff_profiles(id),
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_profiles_business_email ON staff_profiles(business_email);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_id ON staff_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_staff_id ON staff_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_device_fingerprint ON staff_sessions(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_staff_approval_requests_requested_by ON staff_approval_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_staff_approval_requests_status ON staff_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_actor_id ON staff_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_target_staff_id ON staff_audit_logs(target_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_action_type ON staff_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_staff_audit_logs_timestamp ON staff_audit_logs(timestamp_utc);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_staff_id ON password_reset_tokens(staff_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_device_registrations_fingerprint ON device_registrations(device_fingerprint);

-- Configurable workforce schedules and daily assignments
CREATE TABLE IF NOT EXISTS work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    job_classification VARCHAR(100) NOT NULL,
    department VARCHAR(100),
    shift_period VARCHAR(20) NOT NULL DEFAULT 'standard',
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    reminder_minutes INTEGER NOT NULL DEFAULT 20,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Accra',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_schedule_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES work_schedules(id),
    work_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (staff_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_work_schedules_classification ON work_schedules(job_classification, is_active);
CREATE INDEX IF NOT EXISTS idx_staff_schedule_assignments_date ON staff_schedule_assignments(work_date, status);
