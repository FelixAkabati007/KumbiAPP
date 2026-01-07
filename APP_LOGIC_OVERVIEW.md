# KHHREST Restaurant Management System: Technical Architecture & Logic Overview

> **Last Updated:** 2026-01-07
> **Framework:** Next.js 15.3.6 (App Router)
> **Database:** PostgreSQL (Neon Serverless)
> **Auth:** Custom JWT + HTTP-only Cookies
> **Language:** TypeScript

---

## 1. System Architecture

KHHREST is a cloud-native Restaurant Management System (RMS) built on the Next.js App Router. It leverages serverless infrastructure for scalability and edge computing for low-latency operations.

### **Tech Stack**

- **Frontend**: React 18, Tailwind CSS, Shadcn UI, Lucide Icons.
- **Backend**: Next.js API Routes (Serverless & Edge functions).
- **Database**: PostgreSQL hosted on Neon, accessed via `@neondatabase/serverless` driver and connection pooling.
- **Authentication**: Custom implementation using JWTs (JSON Web Tokens) stored in HTTP-only cookies.
- **State Management**: React Context (`AuthProvider`, `SettingsProvider`, `OrderContext`) + React Query patterns.
- **Validation**: Zod schemas shared between frontend and backend.
- **Testing**: Vitest for unit and integration tests.

---

## 2. Core Systems & Logic

### **2.1 Authentication & Security**

The system uses a robust, custom-built authentication system designed for security and scalability, integrated directly with the Neon PostgreSQL database.

- **Architecture**:
  - **Custom API Routes**: `api/auth/signup`, `api/auth/login`, `api/auth/me`.
  - **Database Tables**:
    - `users`: Stores user identity, hashed passwords, and roles.
    - `email_verification_tokens`: Manages email verification flows.
    - `signup_attempts`: Tracks IP/Email activity for rate limiting.
  - **Security Features**:
    - **Password Hashing**: Uses `crypto.pbkdf2` or similar strong hashing algorithms.
    - **Session Management**: JWTs signed with a secure secret, stored in `httpOnly` cookies to prevent XSS attacks.
    - **Rate Limiting**: Custom implementation in `lib/rate-limit.ts` using the database to track and block excessive attempts by IP or Email.
      - **Optimization**: Uses database indexes (`idx_signup_attempts_created_at`, `idx_signup_attempts_email_ip`) for high-performance lookups.
      - **Cleanup**: Scheduled cleanup via `api/cron/cleanup-rate-limits` replaces probabilistic cleanup for reliability.
    - **Bot Protection**: Honeypot fields in forms (`confirm_email_address`) to silently reject automated bot submissions.

- **Authentication Flow**:
  1.  **Sign Up**:
      - User submits form (validated via Zod).
      - Backend checks rate limits and honeypot fields.
      - User created in `users` table; verification email sent.
  2.  **Sign In**:
      - Credentials validated against stored hash.
      - JWT generated and set as a secure cookie.
  3.  **Authorization**:
      - Middleware/API routes verify the JWT.
      - User roles (`admin`, `manager`, `staff`) enforce access control.

### **2.2 Database Schema (PostgreSQL)**

The database uses a clean, relational structure in the `public` schema.

- **Users & Auth**:
  - `users`: ID, email, password_hash, role, profile data.
  - `email_verification_tokens`: Token hash, expiry.
  - `signup_attempts`: Audit log for rate limiting.

- **Catalog & Inventory**:
  - `categories` (1:N) -> `menu_items`.
  - `inventory`: Tracks stock levels, costs, and suppliers linked to menu items.

- **Operations**:
  - `orders` (Header) -> `order_items` (Line Items).
  - `kitchenorders`: Operational view for kitchen staff.

- **Finance**:
  - `transactions`: Records payments (Cash, Card, Mobile) linked to orders.
  - `refund_requests`: Managed refund workflow with approval steps.

- **System**:
  - `system_settings`: Key-value store for global configs (receipt headers, tax rates).
  - `audit_logs`: Security and operational audit trails.

### **2.3 API Structure**

All API routes are located in `app/api/` and follow RESTful principles with strict TypeScript typing.

- **Auth**: `api/auth/*` handles lifecycle events.
- **Business**:
  - `orders/`: CRUD for orders, status updates.
  - `menu/`: Menu management.
  - `inventory/`: Stock tracking.
  - `transactions/`: Financial records.
- **Utilities**:
  - `upload/`: File uploads (e.g., menu images).
  - `metrics/`: Reporting data.

---

## 3. Feature Logic Deep Dive

### **3.1 POS (Point of Sale)**

- **Frontend**: `app/pos/page.tsx`
- **Logic**:
  - **State**: Builds order in-memory using `OrderContext`.
  - **Validation**: Ensures inventory availability before adding items.
  - **Checkout**: Sends payload to `/api/orders`; triggers inventory deduction.
  - **Offline Capability**: Uses `OfflineQueue` (in-memory) to queue requests if network fails (transient).

### **3.2 Kitchen Display System (KDS)**

- **Frontend**: `app/kitchen/page.tsx`
- **Logic**:
  - **Real-time**: Polls for orders with status `pending` or `preparing`.
  - **Granularity**: Can update status of individual items or entire orders.

### **3.3 Reporting & Analytics**

- **Frontend**: `app/reports/page.tsx`
- **Backend**: `app/api/metrics/route.ts`
- **Logic**:
  - Aggregates data from `transactions` and `orders` tables.
  - Visualizes sales trends, top-selling items, and staff performance.

---

## 4. Key Libraries & Utilities (`lib/`)

- **`db.ts`**: Centralized database connection pool management using `@neondatabase/serverless`.
- **`auth.ts`**: Authentication helpers (password hashing, token verification).
- **`rate-limit.ts`**: Database-backed rate limiting logic with auto-cleanup.
- **`validations/auth.ts`**: Shared Zod schemas for form validation.
- **`thermal-printer.ts`**: ESC/POS command generation for receipt printing.
- **`services/offline-queue.ts`**: In-memory queue for handling transient network issues.

---

## 5. Developer Guide

### **Directory Structure**

```
d:\KumbiAPP\
├── app\                # Next.js App Router
│   ├── api\            # Backend Routes
│   ├── (routes)\       # Frontend Pages
├── components\         # React Components
├── lib\                # Shared Logic
│   ├── db\             # DB Config & Schemas
│   ├── services\       # Business Logic
│   ├── validations\    # Zod Schemas
├── database\           # SQL Migrations
└── tests\              # Vitest Tests
```

### **Adding a New Feature**

1.  **Database**: Add table/columns to `database/schema.sql`.
2.  **Type**: Define TypeScript interfaces in `lib/types.ts`.
3.  **Validation**: Create/Update Zod schema in `lib/validations/`.
4.  **API**: Create `app/api/[feature]/route.ts` with validation and error handling.
5.  **Frontend**: Build UI components in `components/` and page in `app/[feature]/page.tsx`.
