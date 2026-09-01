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

## 5. Staff Accounts incident resolution

- Root cause: the live Neon database was missing the `staff_profiles` table, so the Staff Accounts create/list workflow failed at runtime. The create route also exposed role values not present in the `user_role` enum (`frontDesk` and `housekeeping`).
- Fix: created the missing `staff_profiles` table, restricted roles to the live enum (`admin`, `manager`, `staff`, `kitchen`), normalized login emails, stored the password hash on the linked user record, and made user/profile creation atomic in one transaction.
- Access control: `/api/admin/staff` and `/api/admin/staff/[id]` require an authenticated admin for list, create, view, update, and deactivate operations. Each staff account has its own user UUID, profile UUID, unique email, role, and password hash.
- Validation: unauthenticated access returns `401`, TypeScript validation passes, and transaction rollback prevents orphaned user records when profile creation fails.

## 6. Feature Toggles (Kitchen Display / Order Board)

In addition to static per-role section access above, `admin` and `manager`
users can dynamically enable or disable the **Kitchen Display** and **Order
Board** features system-wide. This exists because some deployments are
resource-constrained locations that only run POS + Payments, and don't want
these sections cluttering the dashboard or consuming staff attention.

*   **Storage:** `feature_toggles` table (`key`, `enabled`, `updated_by`,
    `updated_by_name`, `updated_by_role`, `updated_at`). Seeded with both
    `kitchen_display` and `order_board` set to `enabled = true`, so existing
    behavior is unchanged until an admin/manager explicitly turns one off.
*   **API:** `GET /api/feature-toggles` is readable by any authenticated
    user (needed to render dashboard cards and gate the pages). `PATCH
    /api/feature-toggles` is restricted to `admin` and `manager` — any other
    role receives a `403`.
*   **Enforcement:** The restriction is enforced at both ends — the
    dashboard cards in `app/page.tsx` show a disabled `Switch` with a
    tooltip for non-admin/manager roles, and the `/kitchen` and
    `/order-display` pages themselves check the toggle on load and render a
    "Disabled by administrator" banner (via `FeatureDisabledBanner`) for
    *any* role, including admin/manager, when the feature is off. This means
    disabling a feature actually takes it offline app-wide, not just hides
    it from the dashboard.
*   **Audit trail:** Every toggle change is recorded in `staff_audit_logs`
    via `createAuditLog` with action type `feature_toggle_changed`,
    capturing the actor's id/name/role and the before/after enabled state.
