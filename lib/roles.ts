// Role definitions and permissions for the Hospitality Management System
export type UserRole =
  | "admin"
  | "manager"
  | "hotelManager"
  | "restaurantManager"
  | "operationsManager"
  | "finance"
  | "staff"
  | "kitchen"
  | "frontDesk"
  | "housekeeping";

export const managementRoles: UserRole[] = ["admin", "manager", "restaurantManager", "hotelManager", "finance", "operationsManager"];

export const roleOptions: { value: UserRole; label: string; description: string }[] = [
  { value: "staff", label: "Staff", description: "Use the job classification to identify assigned duties." },
  { value: "kitchen", label: "Chef", description: "Prepare and complete kitchen orders with limited operational stock visibility." },
  { value: "frontDesk", label: "Reception", description: "Manage reservations, check-in/out, guest folios, and front-desk service." },
  { value: "housekeeping", label: "Housekeeping", description: "Manage room-cleaning tasks and housekeeping status." },
  { value: "finance", label: "Finance", description: "Review payments, expenses, payroll, refunds, and financial reports." },
  { value: "operationsManager", label: "Operations Manager", description: "Coordinate maintenance and operational tasks across departments." },
  { value: "hotelManager", label: "Hotel Manager", description: "Manage hotel rooms, reservations, reception, housekeeping, and hotel performance." },
  { value: "restaurantManager", label: "Restaurant Manager", description: "Manage restaurant service, kitchen production, orders, menu, and inventory." },
  { value: "manager", label: "General Manager", description: "Supervise hotel and restaurant operations and approve cross-department decisions." },
  { value: "admin", label: "Admin", description: "Manage system settings, staff access, and administrative controls." },
];

export const roleDisplayNames: Record<UserRole, string> = {
  admin: "Administrator",
  manager: "General Manager",
  hotelManager: "Hotel Manager",
  restaurantManager: "Restaurant Manager",
  operationsManager: "Operations Manager",
  finance: "Finance Manager",
  staff: "Staff",
  kitchen: "Chef",
  frontDesk: "Reception",
  housekeeping: "Housekeeping",
};

export function getRoleDisplayName(role: UserRole | string): string {
  return roleDisplayNames[role as UserRole] || "Unknown role";
}

export type StaffClassification =
  | "reception"
  | "restaurantPos"
  | "waiterWaitress"
  | "chef"
  | "housekeeping"
  | "security"
  | "labour"
  | "other";

export const staffClassificationOptions: { value: StaffClassification; label: string; department: "Hotel" | "Restaurant" | "Operations"; description: string }[] = [
  { value: "reception", label: "Reception", department: "Hotel", description: "Hotel guest reception, reservations, check-in, and check-out." },
  { value: "restaurantPos", label: "Restaurant Front Desk / POS", department: "Restaurant", description: "Restaurant POS, order entry, cashier, and payment handling." },
  { value: "waiterWaitress", label: "Waiter/Waitress", department: "Restaurant", description: "Serve food, manage tables, and update served orders." },
  { value: "chef", label: "Chef", department: "Restaurant", description: "Prepare and complete kitchen orders." },
  { value: "housekeeping", label: "Housekeeping", department: "Hotel", description: "Manage room-cleaning tasks and housekeeping status." },
  { value: "security", label: "Security", department: "Operations", description: "Security and site coverage." },
  { value: "labour", label: "Labour", department: "Operations", description: "General labour and operational support." },
  { value: "other", label: "Other", department: "Operations", description: "A configurable operational classification." },
];

const classificationLabels: Record<StaffClassification, string> = {
  reception: "Reception",
  restaurantPos: "Restaurant Front Desk / POS",
  waiterWaitress: "Waiter/Waitress",
  chef: "Chef",
  housekeeping: "Housekeeping",
  security: "Security",
  labour: "Labour",
  other: "Other",
};

export function normalizeStaffClassification(value?: string | null): StaffClassification {
  const normalized = value?.trim().toLowerCase().replace(/[\s/-]+/g, "_");
  if (["reception", "frontdesk", "front_desk"].includes(normalized ?? "")) return "reception";
  if (["restaurantpos", "restaurant_pos", "restaurant_front_desk", "pos", "cashier"].includes(normalized ?? "")) return "restaurantPos";
  if (["waiter", "waitress", "waiter_waitress", "server"].includes(normalized ?? "")) return "waiterWaitress";
  if (normalized === "chef" || normalized === "kitchen") return "chef";
  if (normalized === "housekeeping") return "housekeeping";
  if (normalized === "security") return "security";
  if (normalized === "labour" || normalized === "labor") return "labour";
  return "other";
}

export function getStaffClassificationLabel(value?: string | null): string {
  return classificationLabels[normalizeStaffClassification(value)];
}

export function getClassificationDepartment(value?: string | null): "Hotel" | "Restaurant" | "Operations" {
  const classification = normalizeStaffClassification(value);
  if (classification === "reception" || classification === "housekeeping") return "Hotel";
  if (classification === "restaurantPos" || classification === "waiterWaitress" || classification === "chef") return "Restaurant";
  return "Operations";
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
  | "guestFolio"
  | "events"
  | "eventPricing";

export type CrudAction = "view" | "create" | "edit" | "delete" | "manage";
export type OperationalScope = "hotel" | "restaurant" | "general" | "events";

export const operationalScopeOptions: { value: OperationalScope; label: string; description: string }[] = [
  { value: "general", label: "All operations", description: "Cross-department access within the assigned authority." },
  { value: "hotel", label: "Hotel", description: "Rooms, reservations, reception, housekeeping, and hotel reporting." },
  { value: "restaurant", label: "Restaurant", description: "POS, orders, kitchen, menu, inventory, and restaurant reporting." },
  { value: "events", label: "Events", description: "Event planning and event pricing without finance or guest-management access." },
];

export type RoleCapability = Record<CrudAction, boolean>;

export const roleOperationalScopes: Record<UserRole, OperationalScope[]> = {
  admin: ["general", "hotel", "restaurant", "events"],
  manager: ["general", "hotel", "restaurant", "events"],
  hotelManager: ["hotel"],
  restaurantManager: ["restaurant", "events"],
  operationsManager: ["general", "events"],
  finance: ["general"],
  staff: ["restaurant"],
  kitchen: ["restaurant"],
  frontDesk: ["hotel"],
  housekeeping: ["hotel"],
};

export const classificationRoleHints: Record<StaffClassification, UserRole[]> = {
  reception: ["frontDesk", "hotelManager", "manager", "admin"],
  restaurantPos: ["staff", "restaurantManager", "manager", "admin"],
  waiterWaitress: ["staff", "restaurantManager", "manager", "admin"],
  chef: ["kitchen", "restaurantManager", "manager", "admin"],
  housekeeping: ["housekeeping", "hotelManager", "manager", "admin"],
  security: ["operationsManager", "manager", "admin"],
  labour: ["operationsManager", "manager", "admin"],
  other: ["staff", "manager", "admin"],
};

export function getRoleAccessSummary(role: UserRole | string) {
  if (!isUserRole(role)) return null;
  return {
    role,
    label: getRoleDisplayName(role),
    scopes: roleOperationalScopes[role],
    sections: Object.entries(rolePermissions[role])
      .filter(([, allowed]) => allowed)
      .map(([section]) => section as AppSection),
  };
}

export function validateStaffAccessProfile({
  role,
  classification,
  scope,
}: {
  role: string;
  classification?: string | null;
  scope?: string | null;
}) {
  const normalizedRole = isUserRole(role) ? role : null;
  const normalizedClassification = normalizeStaffClassification(classification);
  const normalizedScope = scope as OperationalScope | undefined;
  const errors: string[] = [];

  if (!normalizedRole) errors.push("Select a valid role.");
  if (normalizedScope && !["hotel", "restaurant", "general", "events"].includes(normalizedScope)) {
    errors.push("Select a valid operational scope.");
  }
  if (normalizedRole && normalizedScope && !roleOperationalScopes[normalizedRole].includes(normalizedScope)) {
    errors.push(`${getRoleDisplayName(normalizedRole)} cannot be assigned to the ${normalizedScope} scope.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    role: normalizedRole,
    classification: normalizedClassification,
    scope: normalizedScope,
    classificationIsGuidance: Boolean(normalizedRole),
  };
}

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
  hotelManager: {
    rooms: { view: true, create: true, edit: true, delete: false, manage: true },
    reservations: { view: true, create: true, edit: true, delete: false, manage: true },
    housekeeping: { view: true, create: true, edit: true, delete: false, manage: true },
    checkIn: { view: true, create: true, edit: true, delete: false, manage: true },
    checkOut: { view: true, create: true, edit: true, delete: false, manage: true },
    reports: { view: true, create: true, edit: true, delete: false, manage: false },
  },
  restaurantManager: {
    pos: { view: true, create: true, edit: true, delete: false, manage: true },
    kitchen: { view: true, create: true, edit: true, delete: false, manage: true },
    orderBoard: { view: true, create: true, edit: true, delete: false, manage: true },
    menu: { view: true, create: true, edit: true, delete: false, manage: true },
    inventory: { view: true, create: true, edit: true, delete: false, manage: true },
    reports: { view: true, create: true, edit: true, delete: false, manage: false },
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

export const rolePermissions = {
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
    events: true,
    eventPricing: false,
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
    events: true,
    eventPricing: true,
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
    events: true,
    eventPricing: false,
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
    events: true,
    eventPricing: true,
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
    events: false,
    eventPricing: false,
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
    events: false,
    eventPricing: false,
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
    events: true,
    eventPricing: false,
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
    events: false,
    eventPricing: false,
  },
} as Record<UserRole, Record<AppSection, boolean>>;

rolePermissions.hotelManager = {
  ...rolePermissions.manager,
  pos: false,
  kitchen: false,
  orderBoard: false,
  menu: false,
  inventory: false,
  reports: true,
  finance: false,
  payments: false,
  receipt: false,
  system: false,
  refunds: false,
  rooms: true,
  reservations: true,
  checkIn: true,
  checkOut: true,
  housekeeping: true,
  maintenance: true,
  operations: true,
  guestFolio: true,
  events: false,
  eventPricing: false,
};

rolePermissions.restaurantManager = {
  ...rolePermissions.manager,
  rooms: false,
  reservations: false,
  checkIn: false,
  checkOut: false,
  housekeeping: false,
  maintenance: false,
  guestFolio: false,
  events: false,
  eventPricing: false,
};

export type DashboardCategory = "hotel" | "restaurant" | "finance" | "technical" | "administration" | "events";

export type RoleDashboardConfig = {
  summary: string;
  focus: string;
  primaryAction: string;
  primaryHref: string;
  categories: DashboardCategory[];
  visibilityNote: string;
};

export const roleDashboardConfig: Record<UserRole, RoleDashboardConfig> = {
  admin: {
    summary: "System control center",
    focus: "Monitor the whole property, access audit tools, and keep permissions safe.",
    primaryAction: "Open system controls",
    primaryHref: "/system",
    categories: ["administration", "hotel", "restaurant", "finance", "technical", "events"],
    visibilityNote: "Full operational visibility with audited configuration access.",
  },
  manager: {
    summary: "Property command center",
    focus: "Review today’s operations, attendance, approvals, and department performance.",
    primaryAction: "Review operations",
    primaryHref: "/operations",
    categories: ["hotel", "restaurant", "technical", "finance", "events"],
    visibilityNote: "Cross-department visibility; sensitive changes remain approval-controlled.",
  },
  hotelManager: {
    summary: "Hotel management center",
    focus: "Coordinate rooms, reservations, reception, housekeeping, and hotel performance.",
    primaryAction: "Open hotel operations",
    primaryHref: "/hotels/rooms",
    categories: ["hotel", "technical"],
    visibilityNote: "Hotel operations and approved workforce data only.",
  },
  restaurantManager: {
    summary: "Restaurant management center",
    focus: "Coordinate service, kitchen production, orders, menu, inventory, and restaurant performance.",
    primaryAction: "Open restaurant operations",
    primaryHref: "/pos",
    categories: ["restaurant", "finance"],
    visibilityNote: "Restaurant operations and approved workforce data only.",
  },
  operationsManager: {
    summary: "Operations control center",
    focus: "Resolve maintenance issues, coordinate teams, and keep daily operations moving.",
    primaryAction: "Open operations",
    primaryHref: "/operations",
    categories: ["technical", "events"],
    visibilityNote: "Operational and maintenance data only; payroll remains restricted.",
  },
  finance: {
    summary: "Finance and payroll desk",
    focus: "Review approved performance, reconcile payments, and prepare payroll decisions.",
    primaryAction: "Open finance",
    primaryHref: "/finance",
    categories: ["finance"],
    visibilityNote: "Financial data and approved performance inputs; no operational editing.",
  },
  staff: {
    summary: "Service workspace",
    focus: "Process assigned orders, keep your register current, and serve guests accurately.",
    primaryAction: "Open Staff Attendance",
    primaryHref: "/staff/attendance",
    categories: ["restaurant"],
    visibilityNote: "Your assigned service work and personal notifications only.",
  },
  kitchen: {
    summary: "Kitchen production desk",
    focus: "Prioritize active orders, update preparation status, and watch relevant stock alerts.",
    primaryAction: "Open kitchen",
    primaryHref: "/kitchen",
    categories: ["restaurant"],
    visibilityNote: "Kitchen and order-board access; guest and payroll data stays private.",
  },
  frontDesk: {
    summary: "Guest arrival desk",
    focus: "Manage arrivals, departures, reservations, rooms, and guest folios.",
    primaryAction: "Open check-in",
    primaryHref: "/hotels/check-in",
    categories: ["hotel"],
    visibilityNote: "Guest-service information needed for the current shift.",
  },
  housekeeping: {
    summary: "Room readiness desk",
    focus: "Complete assigned rooms, report maintenance, and keep room status accurate.",
    primaryAction: "Open housekeeping",
    primaryHref: "/hotels/housekeeping",
    categories: ["hotel", "technical"],
    visibilityNote: "Assigned room and maintenance context; no guest financial data.",
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
