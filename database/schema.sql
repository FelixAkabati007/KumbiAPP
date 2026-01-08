-- KHHREST Database Schema
-- Version: 1.0.0
-- Date: 2026-01-05
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Enums (Create if not exists pattern)
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'manager', 'staff', 'kitchen');
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TYPE order_status AS ENUM (
    'pending',
    'preparing',
    'ready',
    'served',
    'completed',
    'cancelled'
);
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TYPE order_type AS ENUM ('dine-in', 'takeout', 'delivery');
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TYPE payment_method_enum AS ENUM ('cash', 'card', 'mobile');
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TYPE payment_status AS ENUM (
    'unpaid',
    'paid',
    'refunded',
    'partially_refunded'
);
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TYPE refund_status AS ENUM ('pending', 'approved', 'rejected', 'completed');
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
-- 1. Users & Auth
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'staff',
    password_hash VARCHAR(255),
    email_verified BOOLEAN DEFAULT FALSE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- 2. Product Management
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    category_id UUID REFERENCES categories(id) ON DELETE
    SET NULL,
        image_url TEXT,
        barcode VARCHAR(100) UNIQUE,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'units',
    reorder_level DECIMAL(10, 2) DEFAULT 10,
    cost_price DECIMAL(10, 2),
    supplier VARCHAR(255),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- 3. Order Management
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE
    SET NULL,
        customer_name VARCHAR(255),
        table_number VARCHAR(20),
        type order_type DEFAULT 'dine-in',
        status order_status DEFAULT 'pending',
        total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(10, 2) DEFAULT 0,
        payment_status payment_status DEFAULT 'unpaid',
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE
    SET NULL,
        item_name VARCHAR(255) NOT NULL,
        -- Snapshot
        quantity INT NOT NULL CHECK (quantity > 0),
        unit_price DECIMAL(10, 2) NOT NULL,
        -- Snapshot
        subtotal DECIMAL(10, 2) NOT NULL,
        notes TEXT,
        status order_status DEFAULT 'pending',
        -- Per-item status for kitchen
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- 4. Transactions & Finance
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE
    SET NULL,
        transaction_reference VARCHAR(255),
        -- External ID
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'GHS',
        method payment_method_enum NOT NULL,
        status VARCHAR(50) NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS refund_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE
    SET NULL,
        amount DECIMAL(10, 2) NOT NULL,
        reason TEXT NOT NULL,
        status refund_status DEFAULT 'pending',
        requested_by UUID REFERENCES users(id) ON DELETE
    SET NULL,
        approved_by UUID REFERENCES users(id) ON DELETE
    SET NULL,
        approved_at TIMESTAMP WITH TIME ZONE,
        rejection_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- 5. System Config
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_barcode ON menu_items(barcode);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order ON transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refund_requests(status);
-- 6. Email Verification
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_verification_email ON email_verification_tokens(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_expires ON email_verification_tokens(expires_at);
-- 7. Signup Attempts (Rate Limiting)
CREATE TABLE IF NOT EXISTS signup_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255),
    ip VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip ON signup_attempts(ip);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_email ON signup_attempts(email);
-- 8. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE
    SET NULL,
        action VARCHAR(255) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(255),
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
-- 9. System Synchronization Events
CREATE TABLE IF NOT EXISTS system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_system_events_created_at ON system_events(created_at);
-- Helper function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';
-- Apply trigger to tables
DO $$ BEGIN CREATE TRIGGER update_users_updated_at BEFORE
UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TRIGGER update_categories_updated_at BEFORE
UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TRIGGER update_menu_items_updated_at BEFORE
UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TRIGGER update_orders_updated_at BEFORE
UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
CREATE TABLE IF NOT EXISTS transaction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'GHS',
    status VARCHAR(50) NOT NULL,
    payment_method VARCHAR(50),
    customer_id VARCHAR(255),
    items JSONB,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uniq_transaction_id UNIQUE (transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_transaction_logs_created_at ON transaction_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_transaction_logs_status ON transaction_logs(status);
CREATE TABLE IF NOT EXISTS favicons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    urls JSONB NOT NULL,
    data BYTEA,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_favicons_created_at ON favicons(created_at);
CREATE TABLE IF NOT EXISTS settings (
    id INT PRIMARY KEY DEFAULT 1,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    CONSTRAINT single_row CHECK (id = 1)
);
CREATE TABLE IF NOT EXISTS kitchenorders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ordernumber VARCHAR NOT NULL UNIQUE,
    total NUMERIC NOT NULL,
    ordertype VARCHAR NOT NULL,
    tablenumber VARCHAR,
    customername VARCHAR,
    paymentmethod VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'pending',
    priority VARCHAR NOT NULL DEFAULT 'normal',
    createdat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updatedat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    estimatedtime INT,
    notes TEXT,
    items JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS salesdata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL UNIQUE,
    totalorders INT NOT NULL DEFAULT 0,
    totalsales DECIMAL(10, 2) NOT NULL DEFAULT 0,
    onlineorders INT NOT NULL DEFAULT 0,
    dineinorders INT NOT NULL DEFAULT 0,
    createdat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updatedat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE TABLE IF NOT EXISTS refundrequests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orderid VARCHAR NOT NULL,
    ordernumber VARCHAR NOT NULL,
    customername VARCHAR(255) NOT NULL,
    originalamount DECIMAL(10, 2) NOT NULL,
    refundamount DECIMAL(10, 2) NOT NULL,
    paymentmethod VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    authorizedby VARCHAR(255) NOT NULL,
    additionalnotes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    requestedby VARCHAR(255) NOT NULL,
    requestedat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approvedby VARCHAR(255),
    approvedat TIMESTAMP WITH TIME ZONE,
    completedat TIMESTAMP WITH TIME ZONE,
    refundmethod VARCHAR(50),
    transactionid VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_refundrequests_status ON refundrequests(status);
CREATE INDEX IF NOT EXISTS idx_refundrequests_requestedat ON refundrequests(requestedat);
CREATE INDEX IF NOT EXISTS idx_refundrequests_ordernumber ON refundrequests(ordernumber);
CREATE INDEX IF NOT EXISTS idx_refundrequests_orderid ON refundrequests(orderid);