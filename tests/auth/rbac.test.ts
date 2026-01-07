import { describe, it, expect } from "vitest";
import {
  hasPermission,
  rolePermissions,
  UserRole,
  AppSection,
} from "../../lib/roles";

describe("RBAC System", () => {
  describe("Role Permissions", () => {
    it("Admin should have access to all sections", () => {
      const sections: AppSection[] = [
        "pos",
        "kitchen",
        "orderBoard",
        "menu",
        "inventory",
        "reports",
        "payments",
        "receipt",
        "system",
        "refunds",
      ];
      sections.forEach((section) => {
        expect(hasPermission("admin", section)).toBe(true);
      });
    });

    it("Manager should have access to all sections", () => {
      const sections: AppSection[] = [
        "pos",
        "kitchen",
        "orderBoard",
        "menu",
        "inventory",
        "reports",
        "payments",
        "receipt",
        "system",
        "refunds",
      ];
      sections.forEach((section) => {
        expect(hasPermission("manager", section)).toBe(true);
      });
    });

    it("Staff should have restricted access", () => {
      expect(hasPermission("staff", "pos")).toBe(true);
      expect(hasPermission("staff", "kitchen")).toBe(false);
      expect(hasPermission("staff", "orderBoard")).toBe(true);
      expect(hasPermission("staff", "menu")).toBe(false);
      expect(hasPermission("staff", "inventory")).toBe(false);
      expect(hasPermission("staff", "reports")).toBe(false);
      expect(hasPermission("staff", "payments")).toBe(true);
      expect(hasPermission("staff", "receipt")).toBe(true);
      expect(hasPermission("staff", "system")).toBe(false);
      expect(hasPermission("staff", "refunds")).toBe(true);
    });

    it("Kitchen should have restricted access", () => {
      expect(hasPermission("kitchen", "pos")).toBe(false);
      expect(hasPermission("kitchen", "kitchen")).toBe(true);
      expect(hasPermission("kitchen", "orderBoard")).toBe(true);
      expect(hasPermission("kitchen", "menu")).toBe(false);
      expect(hasPermission("kitchen", "inventory")).toBe(true);
      expect(hasPermission("kitchen", "reports")).toBe(false);
      expect(hasPermission("kitchen", "payments")).toBe(false);
      expect(hasPermission("kitchen", "receipt")).toBe(false);
      expect(hasPermission("kitchen", "system")).toBe(false);
      expect(hasPermission("kitchen", "refunds")).toBe(false);
    });
  });

  describe("Middleware Route Protection Logic", () => {
    // Replicating middleware logic for verification
    const routePermissions: Record<string, string[]> = {
      "/admin": ["admin"],
      "/settings": ["admin", "manager"],
      "/pos": ["admin", "manager", "staff"],
      "/kitchen": ["admin", "manager", "kitchen"],
      "/inventory": ["admin", "manager", "kitchen"],
      "/reports": ["admin", "manager"],
      "/menu": ["admin", "manager"],
      "/refunds": ["admin", "manager", "staff"],
      "/order-display": ["admin", "manager", "staff", "kitchen"],
      "/receipt": ["admin", "manager", "staff"],
      "/system": ["admin", "manager"],
    };

    const apiPermissions: Record<string, string[]> = {
      "/api/settings": ["admin", "manager"],
      "/api/inventory": ["admin", "manager", "kitchen"],
      "/api/menu": ["admin", "manager"],
      "/api/refunds": ["admin", "manager", "staff"],
      "/api/orders": ["admin", "manager", "staff", "kitchen"],
      "/api/reports": ["admin", "manager"],
    };

    function isRouteAllowed(role: string, path: string): boolean {
      // API check
      const protectedApiRoute = Object.keys(apiPermissions).find((route) =>
        path.startsWith(route)
      );
      if (protectedApiRoute) {
        return apiPermissions[protectedApiRoute].includes(role);
      }

      // Page check
      const protectedRoute = Object.keys(routePermissions).find((route) =>
        path.startsWith(route)
      );
      if (!protectedRoute) return true; // Public route
      return routePermissions[protectedRoute].includes(role);
    }

    it("should allow admin to access all protected routes", () => {
      expect(isRouteAllowed("admin", "/settings")).toBe(true);
      expect(isRouteAllowed("admin", "/pos")).toBe(true);
      expect(isRouteAllowed("admin", "/kitchen")).toBe(true);
    });

    it("should allow staff to access POS but not Settings", () => {
      expect(isRouteAllowed("staff", "/pos")).toBe(true);
      expect(isRouteAllowed("staff", "/settings")).toBe(false);
      expect(isRouteAllowed("staff", "/kitchen")).toBe(false);
    });

    it("should allow kitchen to access Inventory but not Reports", () => {
      expect(isRouteAllowed("kitchen", "/inventory")).toBe(true);
      expect(isRouteAllowed("kitchen", "/reports")).toBe(false);
      expect(isRouteAllowed("kitchen", "/pos")).toBe(false);
    });

    it("should allow staff to access Refunds but not Menu editing", () => {
      expect(isRouteAllowed("staff", "/refunds")).toBe(true);
      expect(isRouteAllowed("staff", "/menu")).toBe(false);
    });

    it("should allow manager to access everything", () => {
      expect(isRouteAllowed("manager", "/inventory")).toBe(true);
      expect(isRouteAllowed("manager", "/menu")).toBe(true);
      expect(isRouteAllowed("manager", "/refunds")).toBe(true);
    });

    it("should allow staff to access POS API but not Settings API", () => {
      expect(isRouteAllowed("staff", "/api/orders")).toBe(true);
      expect(isRouteAllowed("staff", "/api/settings")).toBe(false);
    });

    it("should allow staff to access Receipt and Order Display", () => {
      expect(isRouteAllowed("staff", "/receipt")).toBe(true);
      expect(isRouteAllowed("staff", "/order-display")).toBe(true);
    });

    it("should allow kitchen to access Inventory API but not Reports API", () => {
      expect(isRouteAllowed("kitchen", "/api/inventory")).toBe(true);
      expect(isRouteAllowed("kitchen", "/api/reports")).toBe(false);
    });

    it("should allow kitchen to access Order Display but not Receipt", () => {
      expect(isRouteAllowed("kitchen", "/order-display")).toBe(true);
      expect(isRouteAllowed("kitchen", "/receipt")).toBe(false);
    });

    it("should allow kitchen to access Kitchen and Inventory", () => {
      expect(isRouteAllowed("kitchen", "/kitchen")).toBe(true);
      expect(isRouteAllowed("kitchen", "/inventory")).toBe(true);
      expect(isRouteAllowed("kitchen", "/pos")).toBe(false);
    });
  });
});
