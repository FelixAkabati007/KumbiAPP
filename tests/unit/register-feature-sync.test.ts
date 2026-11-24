import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRESET_DEPARTMENTS } from "@/components/attendance/bulk-feature-permissions";
import { managementRoles } from "@/lib/roles";

describe("Register Page & Feature Permissions Synchronization", () => {
  it("provides comprehensive departmental presets including Hotel, Restaurant, and combinations", () => {
    const values = PRESET_DEPARTMENTS.map((d) => d.value);
    expect(values).toContain("all");
    expect(values).toContain("hotel");
    expect(values).toContain("restaurant");
    expect(values).toContain("operations");
    expect(values).toContain("hotel_restaurant");
    expect(values).toContain("hotel_operations");
  });

  it("includes all management roles for cross-departmental attendance register authority", () => {
    expect(managementRoles).toContain("admin");
    expect(managementRoles).toContain("manager");
    expect(managementRoles).toContain("restaurantManager");
    expect(managementRoles).toContain("hotelManager");
    expect(managementRoles).toContain("operationsManager");
    expect(managementRoles).toContain("finance");
  });

  it("verifies feature-permissions route imports canonical managementRoles without hardcoded exclusions", () => {
    const routeContent = readFileSync("app/api/attendance/feature-permissions/route.ts", "utf8");
    expect(routeContent).toContain('import { managementRoles');
    expect(routeContent).not.toMatch(/const managerRoles\s*=\s*\[/);
    expect(routeContent).toContain("hotel_restaurant");
    expect(routeContent).toContain("hotel_operations");
  });

  it("verifies leave, permission, and exception routes use canonical managementRoles", () => {
    const leaveRoute = readFileSync("app/api/attendance/leave/route.ts", "utf8");
    const permRoute = readFileSync("app/api/attendance/permissions/route.ts", "utf8");
    const excRoute = readFileSync("app/api/attendance/exceptions/route.ts", "utf8");
    const mgrRoute = readFileSync("app/api/attendance/manager/route.ts", "utf8");

    expect(leaveRoute).toContain('import { managementRoles');
    expect(permRoute).toContain('import { managementRoles');
    expect(excRoute).toContain('import { managementRoles');
    expect(mgrRoute).toContain('import { managementRoles');

    expect(leaveRoute).not.toMatch(/const managerRoles\s*=\s*\[/);
    expect(permRoute).not.toMatch(/const managerRoles\s*=\s*\[/);
    expect(excRoute).not.toMatch(/const managerRoles\s*=\s*\[/);
  });
});
