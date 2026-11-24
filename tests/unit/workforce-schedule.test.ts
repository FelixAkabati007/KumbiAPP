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
      expect(normalizeScheduleClassification("other")).toBe("Other");
      expect(normalizeScheduleClassification("Other")).toBe("Other");
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

    it("synchronizes custom waiter schedule from Settings with spaced classification ('Waiter / Waitress')", async () => {
      const mockExecutor: WorkforceQueryExecutor = async (text: string, params?: unknown[]) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "u-waiter-custom",
                user_role: "waiterWaitress",
                user_name: "Ama Waitress",
                user_email: "ama@kumbi.com",
                staff_id: "sp-waiter-custom",
                position: "Waitress",
                job_classification: "Waitress",
                department: "Restaurant",
              },
            ],
          };
        }
        if (text.includes("FROM work_schedules s")) {
          // Verify that raw classification is passed as $6
          expect(params).toHaveLength(6);
          expect(params?.[2]).toBe("waiterWaitress");
          expect(params?.[3]).toBe("Waiter/Waitress");
          expect(params?.[5]).toBe("Waitress");
          return {
            rows: [
              {
                schedule_id: "sched-custom-waiter-1",
                schedule_name: "Waiters and Waitress Shift",
                job_classification: "Waiter / Waitress",
                department: "Restaurant",
                shift_period: "morning",
                start_time: "07:00:00",
                end_time: "16:00:00",
                reminder_minutes: 15,
                assignment_status: "default",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const schedule = await resolveWorkforceSchedule("u-waiter-custom", undefined, mockExecutor);
      expect(schedule.scheduleId).toBe("sched-custom-waiter-1");
      expect(schedule.schedule_name).toBe("Waiters and Waitress Shift");
      expect(schedule.job_classification).toBe("Waiter / Waitress");
      expect(schedule.start_time).toBe("07:00");
      expect(schedule.end_time).toBe("16:00");
      expect(schedule.startTime).toBe("07:00");
      expect(schedule.endTime).toBe("16:00");
      expect(schedule.reminderMinutes).toBe(15);
    });

    it("synchronizes custom schedule for chef/cook variant from Settings", async () => {
      const mockExecutor: WorkforceQueryExecutor = async (text: string) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "u-cook-1",
                user_role: "kitchen",
                user_name: "Kojo Cook",
                user_email: "kojo@kumbi.com",
                staff_id: "sp-cook-1",
                position: "Line Cook",
                job_classification: "Cook",
                department: "Restaurant",
              },
            ],
          };
        }
        if (text.includes("FROM work_schedules s")) {
          return {
            rows: [
              {
                schedule_id: "sched-cook-1",
                schedule_name: "Kitchen Cook Shift",
                job_classification: "Cook",
                department: "Restaurant",
                shift_period: "standard",
                start_time: "06:30:00",
                end_time: "15:30:00",
                reminder_minutes: 30,
                assignment_status: "default",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const schedule = await resolveWorkforceSchedule("u-cook-1", undefined, mockExecutor);
      expect(schedule.scheduleId).toBe("sched-cook-1");
      expect(schedule.job_classification).toBe("Cook");
      expect(schedule.startTime).toBe("06:30");
      expect(schedule.endTime).toBe("15:30");
      expect(schedule.reminderMinutes).toBe(30);
    });

    it("synchronizes administrative 01:00 - 23:59 schedule to Waiter/Waitress attendance matching Screenshot 2", async () => {
      const mockExecutor: WorkforceQueryExecutor = async (text: string) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "00000000-0000-4000-8000-000000000009",
                user_role: "waiterWaitress",
                user_name: "Service Waiter",
                user_email: "waiter@kumbisaly.com",
                staff_id: "sp-waiter-009",
                position: "Waiter/Waitress",
                job_classification: "waiterWaitress",
                department: "Restaurant",
              },
            ],
          };
        }
        if (text.includes("FROM work_schedules s")) {
          return {
            rows: [
              {
                schedule_id: "sched-waiter-admin-0100",
                schedule_name: "Waiters/ Waitress",
                job_classification: "Waiter/Waitress",
                department: "Restaurant",
                shift_period: "standard",
                start_time: "01:00:00",
                end_time: "23:59:00",
                reminder_minutes: 20,
                assignment_status: "default",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const schedule = await resolveWorkforceSchedule(
        "00000000-0000-4000-8000-000000000009",
        undefined,
        mockExecutor,
        "waiterWaitress",
        "Restaurant",
      );
      expect(schedule.schedule_name).toBe("Waiters/ Waitress");
      expect(schedule.job_classification).toBe("Waiter/Waitress");
      expect(schedule.department).toBe("Restaurant");
      expect(schedule.start_time).toBe("01:00");
      expect(schedule.end_time).toBe("23:59");
      expect(schedule.startTime).toBe("01:00");
      expect(schedule.endTime).toBe("23:59");
    });

    it("allows departmental schedule in Settings to affect all staff roles in that department", async () => {
      const mockExecutor: WorkforceQueryExecutor = async (text: string) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "u-server-dept",
                user_role: "waiterWaitress",
                user_name: "Restaurant Server",
                user_email: "server@kumbisaly.com",
                staff_id: "sp-server-dept",
                position: "Server",
                job_classification: "Server",
                department: "Restaurant",
              },
            ],
          };
        }
        if (text.includes("FROM work_schedules s")) {
          return {
            rows: [
              {
                schedule_id: "sched-dept-restaurant",
                schedule_name: "Restaurant Department General Schedule",
                job_classification: "Other",
                department: "Restaurant",
                shift_period: "standard",
                start_time: "07:00:00",
                end_time: "22:00:00",
                reminder_minutes: 30,
                assignment_status: "default",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const schedule = await resolveWorkforceSchedule(
        "u-server-dept",
        undefined,
        mockExecutor,
        "waiterWaitress",
        "Restaurant",
      );
      expect(schedule.schedule_name).toBe("Restaurant Department General Schedule");
      expect(schedule.department).toBe("Restaurant");
      expect(schedule.start_time).toBe("07:00");
      expect(schedule.end_time).toBe("22:00");
    });

    it("survives missing staff_schedule_assignments relation and successfully queries work_schedules", async () => {
      const mockExecutor: WorkforceQueryExecutor = async (text: string) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "u-waiter-resilient",
                user_role: "waiterWaitress",
                user_name: "Ama Resilient",
                user_email: "ama@kumbi.com",
                staff_id: "sp-waiter-resilient",
                position: "Waitress",
                job_classification: "Waitress",
                department: "Restaurant",
              },
            ],
          };
        }
        if (text.includes("FROM staff_schedule_assignments a")) {
          throw new Error('relation "staff_schedule_assignments" does not exist');
        }
        if (text.includes("FROM work_schedules s")) {
          return {
            rows: [
              {
                schedule_id: "sched-admin-sync",
                schedule_name: "Waiters/ Waitress",
                job_classification: "Waiter/Waitress",
                department: "Restaurant",
                shift_period: "standard",
                start_time: "01:00:00",
                end_time: "23:59:00",
                reminder_minutes: 20,
                assignment_status: "default",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const schedule = await resolveWorkforceSchedule("u-waiter-resilient", undefined, mockExecutor);
      expect(schedule.schedule_name).toBe("Waiters/ Waitress");
      expect(schedule.start_time).toBe("01:00");
      expect(schedule.end_time).toBe("23:59");
    });

    it("survives missing updated_at column in work_schedules via fallback query", async () => {
      let primaryAttempted = false;
      let fallbackSucceeded = false;

      const mockExecutor: WorkforceQueryExecutor = async (text: string) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "u-waiter-no-col",
                user_role: "waiterWaitress",
                user_name: "Kofi Resilient",
                user_email: "kofi@kumbi.com",
                position: "Waiter",
                job_classification: "Waiter/Waitress",
                department: "Restaurant",
              },
            ],
          };
        }
        if (text.includes("COALESCE(s.updated_at, s.created_at)")) {
          primaryAttempted = true;
          throw new Error('column s.updated_at does not exist');
        }
        if (text.includes("FROM work_schedules s")) {
          fallbackSucceeded = true;
          return {
            rows: [
              {
                schedule_id: "sched-fallback-sync",
                schedule_name: "Waiters/ Waitress",
                job_classification: "Waiter/Waitress",
                department: "Restaurant",
                shift_period: "standard",
                start_time: "01:00:00",
                end_time: "23:59:00",
                reminder_minutes: 20,
                assignment_status: "default",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const schedule = await resolveWorkforceSchedule("u-waiter-no-col", undefined, mockExecutor);
      expect(primaryAttempted).toBe(true);
      expect(fallbackSucceeded).toBe(true);
      expect(schedule.start_time).toBe("01:00");
      expect(schedule.end_time).toBe("23:59");
    });

    it("synchronizes Admin configured 02:01 reporting and 23:59 close from Screenshot 051110 to Waiter/Waitress role", async () => {
      const mockExecutor: WorkforceQueryExecutor = async (text: string) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "u-waiter-051110",
                user_role: "waiterWaitress",
                user_name: "Service Waiter",
                user_email: "waiter@kumbisaly.com",
                staff_id: "sp-waiter-051110",
                position: "Waiter/Waitress",
                job_classification: "waiterWaitress",
                department: "Restaurant",
              },
            ],
          };
        }
        if (text.includes("FROM work_schedules s")) {
          return {
            rows: [
              {
                schedule_id: "sched-051110",
                schedule_name: "Waiters/ Waitress",
                job_classification: "Waiter/Waitress",
                department: "Restaurant",
                shift_period: "standard",
                start_time: "02:01:00",
                end_time: "23:59:00",
                reminder_minutes: 20,
                assignment_status: "default",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const schedule = await resolveWorkforceSchedule(
        "u-waiter-051110",
        undefined,
        mockExecutor,
        "waiterWaitress",
        "Restaurant",
      );
      expect(schedule.schedule_name).toBe("Waiters/ Waitress");
      expect(schedule.start_time).toBe("02:01");
      expect(schedule.end_time).toBe("23:59");
      expect(schedule.startTime).toBe("02:01");
      expect(schedule.endTime).toBe("23:59");
    });

    it("synchronizes Other role when Admin configures schedule for Other classification", async () => {
      const mockExecutor: WorkforceQueryExecutor = async (text: string) => {
        if (text.includes("FROM users u")) {
          return {
            rows: [
              {
                user_id: "u-other-role",
                user_role: "staff",
                user_name: "Operational Other Staff",
                user_email: "other@kumbisaly.com",
                staff_id: "sp-other-role",
                position: "Other",
                job_classification: "Other",
                department: "Operations",
              },
            ],
          };
        }
        if (text.includes("FROM work_schedules s")) {
          return {
            rows: [
              {
                schedule_id: "sched-other-admin",
                schedule_name: "Other Operational Roles Shift",
                job_classification: "Other",
                department: "Operations",
                shift_period: "standard",
                start_time: "02:01:00",
                end_time: "23:59:00",
                reminder_minutes: 20,
                assignment_status: "default",
              },
            ],
          };
        }
        return { rows: [] };
      };

      const schedule = await resolveWorkforceSchedule(
        "u-other-role",
        undefined,
        mockExecutor,
        "staff",
        "Operations",
      );
      expect(schedule.schedule_name).toBe("Other Operational Roles Shift");
      expect(schedule.job_classification).toBe("Other");
      expect(schedule.start_time).toBe("02:01");
      expect(schedule.end_time).toBe("23:59");
      expect(schedule.startTime).toBe("02:01");
      expect(schedule.endTime).toBe("23:59");
    });
  });
});
