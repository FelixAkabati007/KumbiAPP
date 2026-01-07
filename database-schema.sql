-- KHHREST Unified SQL Schema (normalized, public schema, updated for Neon/Custom Auth integration)
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Customers Table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL UNIQUE,
  phone VARCHAR,
  address VARCHAR,
  city VARCHAR,
  state VARCHAR,
  zip VARCHAR,
  country VARCHAR,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Employees Table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL UNIQUE,
  role VARCHAR NOT NULL,
  department VARCHAR NOT NULL,
  hiredate DATE NOT NULL,
  salary NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Products Table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  category VARCHAR NOT NULL,
  sku VARCHAR NOT NULL UNIQUE,
  instock BOOLEAN NOT NULL DEFAULT true,
  image VARCHAR,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Inventory Table
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  productid UUID NOT NULL UNIQUE,
  quantity INT NOT NULL DEFAULT 0,
  reorderlevel INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  CONSTRAINT inventory_productid_fkey FOREIGN KEY (productid) REFERENCES public.products(id) ON DELETE CASCADE
);
-- Orders Table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordernumber VARCHAR NOT NULL UNIQUE,
  customerid UUID NOT NULL,
  total NUMERIC NOT NULL,
  orderdate TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  shippingaddress VARCHAR,
  shippingcity VARCHAR,
  shippingstate VARCHAR,
  shippingzip VARCHAR,
  shippingcountry VARCHAR,
  paymentmethod VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  CONSTRAINT orders_customerid_fkey FOREIGN KEY (customerid) REFERENCES public.customers(id) ON DELETE CASCADE
);
-- OrderItems Table
CREATE TABLE public.orderitems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orderid UUID NOT NULL,
  productid UUID NOT NULL,
  quantity INT NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  CONSTRAINT orderitems_orderid_fkey FOREIGN KEY (orderid) REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT orderitems_productid_fkey FOREIGN KEY (productid) REFERENCES public.products(id) ON DELETE CASCADE
);
-- Suppliers Table
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL UNIQUE,
  phone VARCHAR,
  address VARCHAR,
  city VARCHAR,
  state VARCHAR,
  zip VARCHAR,
  country VARCHAR,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- PurchaseOrders Table
CREATE TABLE public.purchaseorders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordernumber VARCHAR NOT NULL UNIQUE,
  supplierid UUID NOT NULL,
  total NUMERIC NOT NULL,
  orderdate TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  deliverydate TIMESTAMPTZ,
  status VARCHAR NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  CONSTRAINT purchaseorders_supplierid_fkey FOREIGN KEY (supplierid) REFERENCES public.suppliers(id) ON DELETE CASCADE
);
-- PurchaseOrderItems Table
CREATE TABLE public.purchaseorderitems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchaseorderid UUID NOT NULL,
  productid UUID NOT NULL,
  quantity INT NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  CONSTRAINT purchaseorderitems_purchaseorderid_fkey FOREIGN KEY (purchaseorderid) REFERENCES public.purchaseorders(id) ON DELETE CASCADE,
  CONSTRAINT purchaseorderitems_productid_fkey FOREIGN KEY (productid) REFERENCES public.products(id) ON DELETE CASCADE
);
-- Users Table (Custom Auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR,
  -- Added for custom auth
  role VARCHAR NOT NULL DEFAULT 'cashier',
  name VARCHAR NOT NULL,
  email VARCHAR UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Admin IP Whitelist
CREATE TABLE public.admin_ip_whitelist (
  id SERIAL PRIMARY KEY,
  ip TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Admin MFA Codes
CREATE TABLE public.admin_mfa_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Admin User Creation Logs
CREATE TABLE public.admin_user_creation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Inventory Items Table
CREATE TABLE public.inventoryitems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  category VARCHAR NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  unit VARCHAR NOT NULL,
  reorderlevel INT NOT NULL DEFAULT 0,
  cost NUMERIC NOT NULL,
  supplier VARCHAR NOT NULL,
  lastupdated TIMESTAMPTZ DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Kitchen Orders
CREATE TABLE public.kitchenorders (
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
  chefnotes TEXT
);
-- Menu Items
CREATE TABLE public.menuitems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  category VARCHAR NOT NULL,
  barcode VARCHAR,
  instock BOOLEAN NOT NULL DEFAULT true,
  image VARCHAR,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Order Items (from Kitchen)
CREATE TABLE public.kitchen_orderitems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kitchenorderid UUID NOT NULL,
  menuitemid UUID,
  name VARCHAR NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  category VARCHAR NOT NULL,
  barcode VARCHAR,
  instock BOOLEAN NOT NULL DEFAULT true,
  image VARCHAR,
  quantity INT NOT NULL,
  status VARCHAR DEFAULT 'pending',
  preptime INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  CONSTRAINT kitchen_orderitems_kitchenorderid_fkey FOREIGN KEY (kitchenorderid) REFERENCES public.kitchenorders(id) ON DELETE CASCADE,
  CONSTRAINT kitchen_orderitems_menuitemid_fkey FOREIGN KEY (menuitemid) REFERENCES public.menuitems(id) ON DELETE
  SET NULL
);
-- POS Records
CREATE TABLE public.pos_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_name TEXT NOT NULL,
  quantity INT NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Refund Request
CREATE TABLE public.refundrequests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  orderid UUID NOT NULL,
  ordernumber VARCHAR NOT NULL,
  customername VARCHAR NOT NULL,
  originalamount NUMERIC NOT NULL,
  refundamount NUMERIC NOT NULL,
  paymentmethod VARCHAR NOT NULL,
  reason TEXT NOT NULL,
  authorizedby UUID NOT NULL,
  additionalnotes TEXT,
  status VARCHAR NOT NULL DEFAULT 'pending',
  requestedby UUID NOT NULL,
  requestedat TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  approvedby UUID,
  approvedat TIMESTAMPTZ,
  completedat TIMESTAMPTZ,
  refundmethod VARCHAR,
  transactionid VARCHAR,
  CONSTRAINT refund_orderid_fkey FOREIGN KEY (orderid) REFERENCES public.kitchenorders(id) ON DELETE CASCADE,
  CONSTRAINT refund_requestedby_fkey FOREIGN KEY (requestedby) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT refund_authorizedby_fkey FOREIGN KEY (authorizedby) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT refund_approvedby_fkey FOREIGN KEY (approvedby) REFERENCES public.users(id) ON DELETE
  SET NULL
);
-- Sales Data
CREATE TABLE public.salesdata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ordernumber VARCHAR NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  total NUMERIC NOT NULL,
  ordertype VARCHAR NOT NULL,
  tablenumber VARCHAR,
  customername VARCHAR,
  paymentmethod VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
-- Sales Data - Order Items Relationship
CREATE TABLE public.salesdata_orderitems (
  salesdataid UUID NOT NULL,
  orderitemid UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
  PRIMARY KEY (salesdataid, orderitemid),
  CONSTRAINT fk_salesdata FOREIGN KEY (salesdataid) REFERENCES public.salesdata(id) ON DELETE CASCADE,
  CONSTRAINT fk_orderitem FOREIGN KEY (orderitemid) REFERENCES public.kitchen_orderitems(id) ON DELETE CASCADE
);
-- Enable Row Level Security (RLS) on important tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_mfa_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_creation_logs ENABLE ROW LEVEL SECURITY;
-- TODO: Implement RLS policies for Custom Auth (e.g., using current_setting('app.user_id'))
-- CREATE POLICY "Users can view own profile" ON public.users ...
-- Indexes for better performance
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_username ON public.users(username);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_orders_customer ON public.orders(customerid);
CREATE INDEX idx_orders_date ON public.orders(orderdate);
CREATE INDEX idx_kitchenorders_status ON public.kitchenorders(status);
CREATE INDEX idx_kitchenorders_date ON public.kitchenorders(createdat);
CREATE INDEX idx_refundrequests_status ON public.refundrequests(status);
CREATE INDEX idx_salesdata_date ON public.salesdata(date);
-- Insert some default admin IPs (localhost for development)
INSERT INTO public.admin_ip_whitelist (ip, description)
VALUES ('127.0.0.1', 'Localhost'),
  ('::1', 'IPv6 Localhost') ON CONFLICT (ip) DO NOTHING;