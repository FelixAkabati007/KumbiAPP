import type { UserRole } from "@/lib/roles";

export type Capability =
  | "attendance.read"
  | "attendance.register"
  | "attendance.approve"
  | "reports.read"
  | "reports.reconcile"
  | "system.manage";

const capabilityMatrix: Record<Capability, readonly UserRole[]> = {
  "attendance.read": ["admin", "manager", "hotelManager", "restaurantManager", "operationsManager", "finance", "staff", "kitchen", "frontDesk", "housekeeping"],
  "attendance.register": ["manager", "hotelManager", "restaurantManager", "operationsManager", "finance", "staff", "kitchen", "frontDesk", "housekeeping"],
  "attendance.approve": ["admin", "manager", "hotelManager", "restaurantManager", "operationsManager"],
  "reports.read": ["admin", "manager", "hotelManager", "restaurantManager", "operationsManager", "finance"],
  "reports.reconcile": ["admin", "manager", "finance"],
  "system.manage": ["admin"],
};

export function hasCapability(role: UserRole, capability: Capability): boolean {
  return capabilityMatrix[capability].includes(role);
}

export function capabilityRoles(capability: Capability): readonly UserRole[] {
  return capabilityMatrix[capability];
}
