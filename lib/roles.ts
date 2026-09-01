// Role definitions and permissions for the Hospitality Management System
export type UserRole = "admin" | "manager" | "finance" | "staff" | "kitchen" | "frontDesk" | "housekeeping";

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
  | "guestFolio";

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
    guestFolio: true,
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
    system: true,
    refunds: true,
    rooms: true,
    reservations: true,
    checkIn: true,
    checkOut: true,
    housekeeping: true,
    maintenance: true,
    guestFolio: true,
  },
  kitchen: {
    pos: true,
    kitchen: true,
    orderBoard: true,
    menu: false,
    inventory: true,
    reports: false,
    finance: false,
    payments: false,
    receipt: true,
    system: false,
    refunds: false,
    rooms: false,
    reservations: false,
    checkIn: false,
    checkOut: false,
    housekeeping: false,
    maintenance: false,
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
    payments: false,
    receipt: true,
    system: false,
    refunds: true,
    rooms: false,
    reservations: false,
    checkIn: false,
    checkOut: false,
    housekeeping: false,
    maintenance: false,
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
    guestFolio: false,
  },
};

export function hasPermission(role: UserRole, section: AppSection): boolean {
  return rolePermissions[role]?.[section] ?? false;
}

export function canManageFeatureToggles(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager";
}
