import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFORCE_SCHEDULES,
  VALID_SCHEDULE_CLASSIFICATIONS,
  VALID_SCHEDULE_DEPARTMENTS,
  WorkforceQueryExecutor,
  isWorkforceRole,
  normalizeScheduleClassification,
  resolveWorkforceSchedule,
} from "@/lib/workforce-schedule";

describe("Workforce Schedule Rules & Classifications", () => {
  describe("isWorkforceRole", () => {
    it("identifies non-managerial operational workforce roles", () => {
      expect(isWorkforceRole("staff")).toBe(true);
      expect(isWorkforceRole("kitchen")).toBe(true);
      expect(isWorkforceRole("frontDesk")).toBe(true);
      expect(isWorkforceRole("restaurantFrontDesk")).toBe(true);
      expect(isWorkforceRole("waiterWaitress")).toBe(true);
      expect(isWorkforceRole("housekeeping")).toBe(true);
    });

    it("exempts management roles from workforce schedule attendance rules", () => {
      expect(isWorkforceRole("admin")).toBe(false);
      expect(isWorkforceRole("manager")).toBe(false);
      expect(isWorkforceRole("hotelManager")).toBe(false);
      expect(isWorkforceRole("restaurantManager")).toBe(false);
      expect(isWorkforceRole("operationsManager")).toBe(false);
      expect(isWorkforceRole("finance")).toBe(false);
      expect(isWorkforceRole(null)).toBe(false);
      expect(isWorkforceRole(undefined)).toBe(false);
    });
  });

  describe("normalizeScheduleClassification", () => {
    it("normalizes diverse role strings to canonical schedule classifications", () => {
      expect(normalizeScheduleClassification("kitchen")).toBe("Chef");
      expect(normalizeScheduleClassification("chef")).toBe("Chef");
      expect(normalizeScheduleClassification("frontDesk")).toBe("Reception");
      expect(normalizeScheduleClassification("reception")).toBe("Reception");
      expect(normalizeScheduleClassification("restaurantFrontDesk")).toBe("Restaurant Front Desk / POS");
      expect(normalizeScheduleClassification("waiterWaitress")).toBe("Waiter/Waitress");
      expect(normalizeScheduleClassification("waiter")).toBe("Waiter/Waitress");
      expect(normalizeScheduleClassification("housekeeping")).toBe("Housekeeping");
      expect(normalizeScheduleClassification("security")).toBe("Security");
      expect(normalizeScheduleClassification("labour")).toBe("Labour");
      expect(normalizeScheduleClassification("operations")).toBe("Operations");
      expect(normalizeScheduleClassification("finance")).toBe("Accounts/Finance");
      expect(normalizeScheduleClassification("staff")).toBe("Staff");
      expect(normalizeScheduleClassification("")).toBe("Staff");
      expect(normalizeScheduleClassification(null)).toBe("Staff");
    });
  });

  describe("DEFAULT_WORKFORCE_SCHEDULES specifications", () => {
    it("contains complete schedules for all workforce roles", () => {
      const classifications = DEFAULT_WORKFORCE_SCHEDULES.map((s) => s.jobClassification);
      expect(classifications).toContain("Reception");
      expect(classifications).toContain("Restaurant Front Desk / POS");
      expect(classifications).toContain("Chef");
      expect(classifications).toContain("Waiter/Waitress");
      expect(classifications).toContain("Housekeeping");
      expect(classifications).toContain("Staff");
      expect(classifications).toContain("Security");
      expect(classifications).toContain("Labour");
    });

    it("has valid time formatting and departments for each default schedule", () => {
      for (const s of DEFAULT_WORKFORCE_SCHEDULES) {
        expect(s.startTime).toMatch(/^\d{2}:\d{2}$/);
        expect(s.endTime).toMatch(/^\d{2}:\d{2}$/);
        expect(VALID_SCHEDULE_DEPARTMENTS).toContain(s.department);
        expect(VALID_SCHEDULE_CLASSIFICATIONS).toContain(
          s.jobClassification as (typeof VALID_SCHEDULE_CLASSIFICATIONS)[number],
        );
        expect(s.reminderMinutes).toBeGreaterThan(0);
      }
    });
  });

  describe("resolveWorkforceSchedule", () => {
    it("resolves default workforce schedule when no database row is returned", async () => {
      const mockExecutor: WorkforceQueryExecutor = async () => ({ rows: [] });
      const chefSchedule = await resolveWorkforceSchedule("chef-user-id", undefined, mockExecutor);
      expect(chefSchedule.job_classification).toBe("Staff");
      expect(chefSchedule.startTime).toBe("08:00");
      expect(chefSchedule.endTime).toBe("17:00");
    });

    it("resolves configured work_schedules row when returned by DB", async () => {
      const mockExecutor: WorkforceQueryExecutor = async (text: string) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "u-123",
                user_role: "kitchen",
                user_name: "Head Chef Kwesi",
                user_email: "chef@kumbi.com",
                staff_id: "sp-123",
                position: "Chef",
                job_classification: "Chef",
                department: "Restaurant",
              },
            ],
          };
        }
        if (text.includes("FROM work_schedules s")) {
          return {
            rows: [
              {
                schedule_id: "sched-kitchen-1",
                schedule_name: "Kitchen Chef Custom Shift",
                job_classification: "Chef",
                department: "Restaurant",
                shift_period: "morning",
                start_time: "07:30:00",
                end_time: "21:30:00",
                reminder_minutes: 25,
                assignment_status: "assigned",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const resolved = await resolveWorkforceSchedule("u-123", undefined, mockExecutor);
      expect(resolved.scheduleId).toBe("sched-kitchen-1");
      expect(resolved.schedule_name).toBe("Kitchen Chef Custom Shift");
      expect(resolved.job_classification).toBe("Chef");
      expect(resolved.department).toBe("Restaurant");
      expect(resolved.startTime).toBe("07:30");
      expect(resolved.endTime).toBe("21:30");
      expect(resolved.reminderMinutes).toBe(25);
    });

    it("resolves waiterWaitress default shift correctly (08:00 - 21:00)", async () => {
      const mockExecutor: WorkforceQueryExecutor = async (text: string) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "u-waiter-1",
                user_role: "waiterWaitress",
                user_name: "Kofi Waiter",
                user_email: "kofi@kumbi.com",
                position: "Waiter/Waitress",
                job_classification: "Waiter/Waitress",
                department: "Restaurant",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const waiterSchedule = await resolveWorkforceSchedule("u-waiter-1", undefined, mockExecutor);
      expect(waiterSchedule.job_classification).toBe("Waiter/Waitress");
      expect(waiterSchedule.department).toBe("Restaurant");
      expect(waiterSchedule.startTime).toBe("08:00");
      expect(waiterSchedule.endTime).toBe("21:00");
      expect(waiterSchedule.reminderMinutes).toBe(20);
    });
  });
});
