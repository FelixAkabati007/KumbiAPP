# Role access matrix

The application uses `lib/roles.ts` as the source of truth for least-privilege access. `rolePermissions` controls section visibility and `roleCapabilities` records CRUD/manage behavior for operationally sensitive sections.

| Role | Assigned workflows | Allowed sections | Restrictions |
| --- | --- | --- | --- |
| Admin | User administration, configuration, audit, all operations | All sections | Full create/edit/delete/manage access; self-delete is blocked |
| Manager | Daily operations, approvals, reporting, finance oversight | POS, kitchen, orders, menu, inventory, reports, finance, payments, receipts, system, refunds, hotel operations | Can create/edit operational and finance records; cannot delete finance records or manage system-level identity |
| Finance | Reconciliation, payment review, refunds, guest folios | Reports, finance, payments, receipts, refunds, guest folios | No POS, menu, inventory, hotel-room operations, system settings, or staff administration |
| Staff | Cashier/order entry and receipts | POS, order board, receipts, refunds | No menu/inventory/reporting/finance/system/hotel administration; refunds remain visible only where explicitly permitted |
| Kitchen | Kitchen production and order status | POS, kitchen, order board, inventory, receipts | No finance, refunds, hotel, system, or menu administration |
| Front Desk | Reservations, arrivals/departures, guest folios, hotel coordination | Payments, receipts, rooms, reservations, check-in, check-out, housekeeping, maintenance, guest folios | No POS/menu/inventory/finance reporting/system administration |
| Housekeeping | Room readiness, housekeeping tasks, maintenance tickets | Rooms, housekeeping, maintenance | No payments, receipts, guest folios, reservations, finance, or system administration |

## Enforcement

- Client navigation uses `RoleGuard` and `hasPermission` for section visibility.
- API routes must use `requireSession`, `requirePermission`, or `requireRole`; admin staff/user endpoints remain administrator-only.
- Staff creation and user updates accept only the role union defined in `lib/roles.ts`.
- All user-management mutations are audit logged and self-deletion is blocked.
- CRUD capability defaults are explicit and deny destructive actions for operational roles unless listed.

This document is maintained alongside the permission source and should be updated whenever a role, section, or capability changes.
