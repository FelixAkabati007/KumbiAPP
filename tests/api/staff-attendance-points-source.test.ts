import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const managerRoute = readFileSync("app/api/attendance/manager/route.ts", "utf8");
const performanceRoute = readFileSync("app/api/performance/route.ts", "utf8");

describe("staff attendance and points source of truth", () => {
  it("uses one idempotent verified attendance event type", () => {
    expect(managerRoute).toContain("'attendance_verified'");
    expect(managerRoute).not.toContain("'attendance_check_in'");
    expect(performanceRoute).toContain("pe.source_id = ar.id AND pe.source_type = 'attendance_verified'");
  });

  it("targets notifications to the staff user account", () => {
    expect(managerRoute).toContain("SELECT COALESCE(user_id, $1) FROM staff_profiles");
  });
});

