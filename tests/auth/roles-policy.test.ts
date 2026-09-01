import { describe, expect, it } from "vitest";
import { canManageFeatureToggles, canPerformAction, hasPermission } from "@/lib/roles";

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
});
