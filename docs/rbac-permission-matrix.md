# RBAC Permission Matrix

## Policy

`admin` is the only administrative role. Admin sessions may view, create, edit, delete, and manage every application section. Authorization is enforced server-side; hidden UI controls are not a security boundary.

Unknown, missing, or malformed roles fail closed and receive no permissions.

## Operational roles

| Role | Allowed sections | Administrative access |
| --- | --- | --- |
| manager | POS, kitchen, order board, menu, inventory, reports, finance, payments, receipt, refunds, rooms, reservations, check-in, check-out, housekeeping, maintenance, guest folio | None |
| finance | Reports, finance, payments, receipt, refunds, guest folio | None |
| staff | POS, order board, payments, receipt, refunds | None |
| kitchen | Kitchen, order board | None |
| frontDesk | Payments, receipt, refunds, rooms, reservations, check-in, check-out, housekeeping, maintenance, guest folio | None |
| housekeeping | Rooms, housekeeping, maintenance | None |

Operational roles may only perform the CRUD actions defined in `lib/roles.ts`. Delete and manage are intentionally disabled unless explicitly granted. Feature-toggle management, staff/user administration, system settings, and other administrative endpoints require `admin`.

## Enforcement checklist

- Use `requireAdmin()` for administrative API routes.
- Use `requirePermission(section)` for operational APIs.
- Use `canPerformAction(role, section, action)` for action-level UI and server checks.
- Treat client-side guards as presentation only; never rely on them instead of API authorization.
- Add a positive admin and negative non-admin test for every new administrative endpoint.
