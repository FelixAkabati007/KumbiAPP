import { describe, expect, it } from "vitest";
import {
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

  it("rejects contradictory access assignments", () => {
    const result = validateStaffAccessProfile({ role: "frontDesk", classification: "chef", scope: "restaurant" });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
