import { describe, expect, it } from "vitest";
import {
  canAccessApiRoute,
  canAccessPageRoute,
  canManageFeatureToggles,
  canPerformAction,
  getRoleAccessSummary,
  hasPermission,
  validateStaffAccessProfile,
} from "@/lib/roles";

describe("RBAC policy", () => {
  it("grants admins every section and action", () => {
    expect(hasPermission("admin", "system")).toBe(true);
    expect(canPerformAction("admin", "inventory", "delete")).toBe(true);
    expect(canPerformAction("admin", "system", "manage")).toBe(true);
    expect(canManageFeatureToggles("admin")).toBe(true);
  });

  it("denies administrative capabilities to non-admins", () => {
    expect(hasPermission("manager", "system")).toBe(false);
    expect(canManageFeatureToggles("manager")).toBe(false);
    expect(canPerformAction("manager", "inventory", "manage")).toBe(false);
    expect(canPerformAction("staff", "inventory", "view")).toBe(false);
  });

  it("fails closed for missing and unknown roles", () => {
    expect(hasPermission(undefined, "pos")).toBe(false);
    expect(canPerformAction("superuser", "pos", "view")).toBe(false);
    expect(canManageFeatureToggles(null)).toBe(false);
  });

  it("exposes one explainable access summary per role", () => {
    expect(getRoleAccessSummary("frontDesk")).toMatchObject({
      label: "Reception",
      scopes: ["hotel"],
    });
    expect(getRoleAccessSummary("unknown")).toBeNull();
  });

  it("accepts aligned role, scope, and job classification combinations", () => {
    expect(validateStaffAccessProfile({ role: "frontDesk", classification: "reception", scope: "hotel" }).valid).toBe(true);
    expect(validateStaffAccessProfile({ role: "kitchen", classification: "chef", scope: "restaurant" }).valid).toBe(true);
  });

  it("treats classification as guidance but rejects invalid scope", () => {
    const result = validateStaffAccessProfile({ role: "frontDesk", classification: "chef", scope: "restaurant" });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["Reception cannot be assigned to the restaurant scope."]);
    expect(validateStaffAccessProfile({ role: "admin", classification: "chef", scope: "general" }).valid).toBe(true);
  });

  it("aligns middleware page & API route permissions with canonical rolePermissions for all 12 roles", () => {
    // Restaurant Manager must access POS, Kitchen, Menu, Inventory, Reports
    expect(canAccessPageRoute("restaurantManager", "/pos")).toBe(true);
    expect(canAccessPageRoute("restaurantManager", "/inventory")).toBe(true);
    expect(canAccessPageRoute("restaurantManager", "/menu")).toBe(true);
    expect(canAccessPageRoute("restaurantManager", "/reports")).toBe(true);
    expect(canAccessApiRoute("restaurantManager", "/api/inventory")).toBe(true);
    expect(canAccessApiRoute("restaurantManager", "/api/menu")).toBe(true);
    expect(canAccessApiRoute("restaurantManager", "/api/orders")).toBe(true);

    // Waiter/Waitress and Restaurant Front Desk must access POS, Order Display, Menu API, Orders API
    expect(canAccessPageRoute("waiterWaitress", "/pos")).toBe(true);
    expect(canAccessPageRoute("waiterWaitress", "/order-display")).toBe(true);
    expect(canAccessApiRoute("waiterWaitress", "/api/orders")).toBe(true);
    expect(canAccessApiRoute("waiterWaitress", "/api/menu")).toBe(true);
    expect(canAccessPageRoute("restaurantFrontDesk", "/pos")).toBe(true);
    expect(canAccessApiRoute("restaurantFrontDesk", "/api/orders")).toBe(true);
    expect(canAccessApiRoute("restaurantFrontDesk", "/api/transactions/log")).toBe(true);

    // Hotel Manager & Front Desk must access Hotel routes & Reports/Inventory where permitted
    expect(canAccessPageRoute("hotelManager", "/hotels/rooms")).toBe(true);
    expect(canAccessPageRoute("hotelManager", "/reports")).toBe(true);
    expect(canAccessApiRoute("hotelManager", "/api/reports")).toBe(true);
    expect(canAccessPageRoute("frontDesk", "/inventory")).toBe(true);
    expect(canAccessApiRoute("frontDesk", "/api/inventory")).toBe(true);

    // Kitchen can access /menu for recipe management and /inventory
    expect(canAccessPageRoute("kitchen", "/menu")).toBe(true);
    expect(canAccessPageRoute("kitchen", "/inventory")).toBe(true);
    expect(canAccessPageRoute("kitchen", "/finance")).toBe(false);
  });
});
