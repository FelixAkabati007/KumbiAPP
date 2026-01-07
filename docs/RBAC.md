# Role-Based Access Control (RBAC) System

This document outlines the corrected and unified Role-Based Access Control (RBAC) system for the KumbiAPP.

## 1. User Roles

The system uses a unified set of roles across the Database, API, and Frontend:

*   **admin**: Full system access.
*   **manager**: High-level access (Dashboard, Reports, Settings, POS, Kitchen).
*   **staff**: Front-of-house access (POS, Orders, Receipts, Payments). *Previously referred to as "cashier".*
*   **kitchen**: Back-of-house access (Kitchen Display, Inventory). *Previously referred to as "chef".*

## 2. Permissions Matrix

The permissions are defined in `lib/roles.ts` and enforced via `middleware.ts` (server-side) and `RoleGuard` (client-side).

| Feature / Section | Admin | Manager | Staff | Kitchen |
| :--- | :---: | :---: | :---: | :---: |
| **POS** | ✅ | ✅ | ✅ | ❌ |
| **Kitchen Display** | ✅ | ✅ | ❌ | ✅ |
| **Order Board** | ✅ | ✅ | ✅ | ✅ |
| **Menu Management** | ✅ | ✅ | ❌ | ❌ |
| **Inventory** | ✅ | ✅ | ❌ | ✅ |
| **Reports** | ✅ | ✅ | ❌ | ❌ |
| **Payments** | ✅ | ✅ | ✅ | ❌ |
| **Receipts** | ✅ | ✅ | ✅ | ❌ |
| **System Monitor** | ✅ | ✅ | ❌ | ❌ |
| **Refunds** | ✅ | ✅ | ✅ | ❌ |
| **Settings** | ✅ | ✅ | ❌ | ❌ |

## 3. Implementation Details

### Server-Side Protection (`middleware.ts`)
The middleware intercepts requests to protected routes and verifies the JWT token using `jose` (Edge Runtime compatible). It checks if the user's role is authorized for the requested path.

**Protected Routes:**
*   `/admin/*` -> `admin`
*   `/settings/*` -> `admin`, `manager`
*   `/pos/*` -> `admin`, `manager`, `staff`
*   `/kitchen/*` -> `admin`, `manager`, `kitchen`
*   `/inventory/*` -> `admin`, `manager`, `kitchen`
*   `/reports/*` -> `admin`, `manager`

### Client-Side Protection (`RoleGuard`)
The `RoleGuard` component wraps protected page content. It checks the user's role against the required `AppSection` permission. If unauthorized, it redirects to `/unauthorized`.

### Database Schema
The `users` table uses the `role` column with values: `admin`, `manager`, `staff`, `kitchen`.

## 4. Verification
Automated tests in `tests/auth/rbac.test.ts` verify the permission logic and route protection rules.
