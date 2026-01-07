# Database Schema Documentation

## Overview
This document outlines the database schema for the KHHREST application, hosted on Neon (PostgreSQL).

## Core Tables

### 1. Users (`users`)
Manages application users and authentication.
- `id`: UUID (PK)
- `email`: Unique email address
- `name`: Full name
- `role`: Enum (`admin`, `manager`, `staff`, `kitchen`)
- `is_active`: Boolean status
- `last_login`: Timestamp

### 2. Menu Management (`categories`, `menu_items`)
Products and organization.
- `categories`: Product categories (e.g., Ghanaian, Continental)
- `menu_items`: Individual products with pricing, availability, and barcode.

### 3. Inventory (`inventory`)
Stock tracking linked to menu items.
- `menu_item_id`: FK to menu_items
- `quantity`: Current stock
- `reorder_level`: Threshold for low stock alerts

### 4. Orders (`orders`, `order_items`)
Core transaction data.
- `orders`: Head-level order info (customer, total, status, payment status).
- `order_items`: Line items with snapshots of price and name at time of order.

### 5. Finance (`transactions`, `refund_requests`)
Payment processing and reconciliation.
- `transactions`: Records of payments (Cash, Card, Mobile Money).
- `refund_requests`: Workflow for processing refunds.

## Relationships
- **Users -> Orders**: One-to-Many (Staff creates orders)
- **Categories -> Menu Items**: One-to-Many
- **Menu Items -> Order Items**: One-to-Many
- **Orders -> Order Items**: One-to-Many
- **Orders -> Transactions**: One-to-Many (Split payments support)
- **Orders -> Refund Requests**: One-to-Many

## Enums
- `user_role`: admin, manager, staff, kitchen
- `order_status`: pending, preparing, ready, served, completed, cancelled
- `payment_method`: cash, card, mobile
- `refund_status`: pending, approved, rejected, completed

## Security
- Row Level Security (RLS) is enabled on sensitive tables.
- Access is currently open (`true` policy) but structured for role-based restrictions.
