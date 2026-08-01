// Role definitions and permissions for the Hospitality Management System
export type UserRole = "admin" | "manager" | "staff" | "kitchen" | "frontDesk" | "housekeeping";

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
  | "refunds"
  | "rooms"
  | "reservations"
  | "checkIn"
  | "checkOut"
  | "housekeeping"
  | "maintenance"
  | "guestFolio"
  | "staffManagement"
  | "payroll";

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
    rooms: true,
    reservations: true,
    checkIn: true,
    checkOut: true,
    housekeeping: true,
    maintenance: true,
    guestFolio: true,
    staffManagement: true,
    payroll: true,
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
    rooms: true,
    reservations: true,
    checkIn: true,
    checkOut: true,
    housekeeping: true,
    maintenance: true,
    guestFolio: true,
    staffManagement: true,
    payroll: true,
  },
  kitchen: {
    pos: true,
    kitchen: true,
    orderBoard: true,
    menu: false,
    inventory: true,
    reports: false,
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
    staffManagement: false,
    payroll: false,
  },
  staff: {
    pos: true,
    kitchen: false,
    orderBoard: true,
    menu: false,
    inventory: false,
    reports: false,
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
    staffManagement: false,
    payroll: false,
  },
  frontDesk: {
    pos: false,
    kitchen: false,
    orderBoard: false,
    menu: false,
    inventory: false,
    reports: false,
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
    staffManagement: false,
    payroll: false,
  },
  housekeeping: {
    pos: false,
    kitchen: false,
    orderBoard: false,
    menu: false,
    inventory: false,
    reports: false,
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
    staffManagement: false,
    payroll: false,
  },
};

export function hasPermission(role: UserRole, section: AppSection): boolean {
  return rolePermissions[role]?.[section] ?? false;
}
