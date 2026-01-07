// Role definitions and permissions for the POS system
export type UserRole = "admin" | "manager" | "cashier" | "chef";

export type AppSection =
  | "pos"
  | "kitchen"
  | "orderBoard"
  | "menu"
  | "inventory"
  | "reports"
  | "payments"
  | "receipt"
  | "system"
  | "refunds";

export const rolePermissions: Record<UserRole, Record<AppSection, boolean>> = {
  admin: {
    pos: true,
    kitchen: true,
    orderBoard: true,
    menu: true,
    inventory: true,
    reports: true,
    payments: true,
    receipt: true,
    system: true,
    refunds: true,
  },
  manager: {
    pos: true,
    kitchen: true,
    orderBoard: true,
    menu: true,
    inventory: true,
    reports: true,
    payments: true,
    receipt: true,
    system: true,
    refunds: true,
  },
  chef: {
    pos: false,
    kitchen: true,
    orderBoard: true,
    menu: false,
    inventory: true,
    reports: false,
    payments: false,
    receipt: false,
    system: false,
    refunds: false,
  },
  cashier: {
    pos: true,
    kitchen: false,
    orderBoard: true,
    menu: false,
    inventory: false,
    reports: false,
    payments: true,
    receipt: true,
    system: false,
    refunds: true, // Allow cashiers to access refunds
  },
};

export function hasPermission(role: UserRole, section: AppSection): boolean {
  return rolePermissions[role]?.[section] ?? false;
}
