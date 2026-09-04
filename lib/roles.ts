// Role definitions and permissions for the Hospitality Management System
export type UserRole =
  | "admin"
  | "manager"
  | "operationsManager"
  | "finance"
  | "staff"
  | "kitchen"
  | "frontDesk"
  | "housekeeping";

export const roleDisplayNames: Record<UserRole, string> = {
  admin: "Administrator",
  manager: "General Manager",
  operationsManager: "Operations Manager",
  finance: "Finance Manager",
  staff: "Restaurant Server",
  kitchen: "Chef",
  frontDesk: "Reception",
  housekeeping: "Housekeeping",
};

export function getRoleDisplayName(role: UserRole | string): string {
  return roleDisplayNames[role as UserRole] || "Staff";
}

export type AppSection =
  | "pos"
  | "kitchen"
  | "orderBoard"
  | "menu"
  | "inventory"
  | "reports"
  | "finance"
  | "payments"
  | "receipt"
  | "system"
  | "refunds"
  | "rooms"
  | "reservations"
  | "checkIn"
  | "checkOut"
  | "housekeeping"
  | "maintenance"
  | "operations"
  | "guestFolio";

export type CrudAction = "view" | "create" | "edit" | "delete" | "manage";

export type RoleCapability = Record<CrudAction, boolean>;

/** Traceable least-privilege capability defaults. Section booleans remain the UI visibility contract. */
export const roleCapabilities: Record<
  UserRole,
  Partial<Record<AppSection, RoleCapability>>
> = {
  admin: {
    system: {
      view: true,
      create: true,
      edit: true,
      delete: true,
      manage: true,
    },
  },
  manager: {
    reports: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
    finance: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
  },
  operationsManager: {
    operations: { view: true, create: false, edit: false, delete: false, manage: true },
    maintenance: { view: true, create: true, edit: true, delete: false, manage: true },
  },
  finance: {
    finance: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
    payments: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
    refunds: {
      view: true,
      create: true,
      edit: false,
      delete: false,
      manage: false,
    },
  },
  staff: {
    pos: { view: true, create: true, edit: true, delete: false, manage: false },
    receipt: {
      view: true,
      create: true,
      edit: false,
      delete: false,
      manage: false,
    },
    refunds: {
      view: true,
      create: true,
      edit: false,
      delete: false,
      manage: false,
    },
  },
  kitchen: {
    kitchen: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
    orderBoard: {
      view: true,
      create: false,
      edit: true,
      delete: false,
      manage: false,
    },
  },
  frontDesk: {
    reservations: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
    checkIn: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
    checkOut: {
      view: true,
      create: false,
      edit: true,
      delete: false,
      manage: false,
    },
    guestFolio: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
    refunds: {
      view: true,
      create: true,
      edit: false,
      delete: false,
      manage: false,
    },
  },
  housekeeping: {
    housekeeping: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
    maintenance: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      manage: false,
    },
    rooms: {
      view: true,
      create: false,
      edit: true,
      delete: false,
      manage: false,
    },
  },
};

export const rolePermissions: Record<UserRole, Record<AppSection, boolean>> = {
  admin: {
    pos: true,
    kitchen: true,
    orderBoard: true,
    menu: true,
    inventory: true,
    reports: true,
    finance: true,
    payments: true,
    receipt: true,
    system: true,
    refunds: true,
    rooms: true,
    reservations: true,
    checkIn: true,
    checkOut: true,
    housekeeping: true,
    maintenance: true,
    operations: true,
    guestFolio: true,
  },
  operationsManager: {
    pos: false,
    kitchen: false,
    orderBoard: false,
    menu: false,
    inventory: false,
    reports: false,
    finance: false,
    payments: false,
    receipt: false,
    system: false,
    refunds: false,
    rooms: false,
    reservations: false,
    checkIn: false,
    checkOut: false,
    housekeeping: false,
    maintenance: true,
    operations: true,
    guestFolio: false,
  },
  finance: {
    pos: false,
    kitchen: false,
    orderBoard: false,
    menu: false,
    inventory: false,
    reports: true,
    finance: true,
    payments: true,
    receipt: true,
    system: false,
    refunds: true,
    rooms: false,
    reservations: false,
    checkIn: false,
    checkOut: false,
    housekeeping: false,
    maintenance: false,
    operations: false,
    guestFolio: true,
  },
  manager: {
    pos: true,
    kitchen: true,
    orderBoard: true,
    menu: true,
    inventory: true,
    reports: true,
    finance: true,
    payments: true,
    receipt: true,
    system: false,
    refunds: true,
    rooms: true,
    reservations: true,
    checkIn: true,
    checkOut: true,
    housekeeping: true,
    maintenance: true,
    operations: true,
    guestFolio: true,
  },
  kitchen: {
    pos: false,
    kitchen: true,
    orderBoard: true,
    menu: false,
    inventory: true,
    reports: false,
    finance: false,
    payments: false,
    receipt: false,
    system: false,
    refunds: false,
    rooms: false,
    reservations: false,
    checkIn: false,
    checkOut: false,
    housekeeping: false,
    maintenance: false,
    operations: false,
    guestFolio: false,
  },
  staff: {
    pos: true,
    kitchen: false,
    orderBoard: true,
    menu: false,
    inventory: false,
    reports: false,
    finance: false,
    payments: true,
    receipt: true,
    system: false,
    refunds: true,
    rooms: false,
    reservations: false,
    checkIn: false,
    checkOut: false,
    housekeeping: false,
    maintenance: false,
    operations: false,
    guestFolio: false,
  },
  frontDesk: {
    pos: false,
    kitchen: false,
    orderBoard: false,
    menu: false,
    inventory: false,
    reports: false,
    finance: false,
    payments: true,
    receipt: true,
    system: false,
    refunds: true,
    rooms: true,
    reservations: true,
    checkIn: true,
    checkOut: true,
    housekeeping: true,
    maintenance: true,
    operations: false,
    guestFolio: true,
  },
  housekeeping: {
    pos: false,
    kitchen: false,
    orderBoard: false,
    menu: false,
    inventory: false,
    reports: false,
    finance: false,
    payments: false,
    receipt: false,
    system: false,
    refunds: false,
    rooms: true,
    reservations: false,
    checkIn: false,
    checkOut: false,
    housekeeping: true,
    maintenance: true,
    operations: false,
    guestFolio: false,
  },
};

export function isUserRole(role: string | null | undefined): role is UserRole {
  return typeof role === "string" && role in rolePermissions;
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

export function hasPermission(
  role: string | null | undefined,
  section: AppSection,
): boolean {
  if (!isUserRole(role)) return false;
  return rolePermissions[role][section] ?? false;
}

export function canPerformAction(
  role: string | null | undefined,
  section: AppSection,
  action: CrudAction,
): boolean {
  if (isAdmin(role)) return true;
  if (!isUserRole(role)) return false;
  return roleCapabilities[role][section]?.[action] ?? false;
}

export function canManageFeatureToggles(
  role: string | null | undefined,
): boolean {
  return isAdmin(role);
}
