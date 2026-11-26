import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  getTodayAttendanceRecord,
  registerAttendance,
  runScheduledAutoCheckout,
  type AttendanceQueryExecutor,
  type AttendanceTransactionRunner,
} from "@/lib/attendance-service";
import {
  dispatchWorkforceShiftReminders,
  resolveWorkforceSchedule,
  type WorkforceQueryExecutor,
} from "@/lib/workforce-schedule";
import { calculateMenuAvailability } from "@/lib/menu-availability";

async function createTestPg(options?: { legacyRestrictiveAttendance?: boolean }) {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255),
      role VARCHAR(50) DEFAULT 'staff',
      password_hash VARCHAR(255),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE staff_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      business_email VARCHAR(255) NOT NULL UNIQUE,
      department VARCHAR(100),
      position VARCHAR(100),
      job_classification VARCHAR(100) DEFAULT 'other',
      employment_status VARCHAR(50) DEFAULT 'active',
      password_hash VARCHAR(255) NOT NULL DEFAULT 'managed',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE work_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(120) NOT NULL,
      job_classification VARCHAR(100) NOT NULL,
      department VARCHAR(100),
      shift_period VARCHAR(20) NOT NULL DEFAULT 'standard',
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      reminder_minutes INTEGER NOT NULL DEFAULT 20,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Accra',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE staff_schedule_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id UUID NOT NULL,
      schedule_id UUID NOT NULL,
      work_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  if (options?.legacyRestrictiveAttendance) {
    // Reproduces legacy v1 attendance_records + varchar actor_id in attendance_policy_events
    // that previously threw 42703 (missing user_id), 23503 (staff_id FK -> users), 23514 (status check),
    // and 42P08 (inconsistent types deduced for reused parameter $2 across uuid & varchar).
    await db.exec(`
      CREATE TABLE attendance_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID NOT NULL REFERENCES users(id),
        shift_id UUID NOT NULL,
        check_in_at TIMESTAMPTZ,
        check_out_at TIMESTAMPTZ,
        status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'verified', 'rejected', 'late', 'absent')),
        verification_status VARCHAR(50) NOT NULL CHECK (verification_status IN ('pending', 'verified', 'rejected', 'late', 'absent')),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE attendance_policy_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        attendance_record_id UUID NOT NULL,
        staff_id UUID NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        actor_id VARCHAR(255),
        idempotency_key VARCHAR(255) UNIQUE,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  const executor: AttendanceQueryExecutor = async <R = Record<string, unknown>>(text: string, params?: unknown[]) => {
    const r = await db.query(text, params as unknown[]);
    return { rows: r.rows as R[], rowCount: r.affectedRows || r.rows.length };
  };

  const runTransaction: AttendanceTransactionRunner = async (cb) => {
    await db.exec("BEGIN");
    try {
      const out = await cb({ query: executor });
      await db.exec("COMMIT");
      return out;
    } catch (err) {
      await db.exec("ROLLBACK");
      throw err;
    }
  };

  return { db, executor, wfExecutor: executor as unknown as WorkforceQueryExecutor, runTransaction };
}

describe("Attendance check-in/check-out, schedule sync, reminders cron, manager control & POS units (real PostgreSQL)", () => {
  it("1. Waitress check-in heals legacy restrictive schema, computes late/early minutes, and allows check-out before 23:59 without (23) hard-block", async () => {
    const { db, executor, runTransaction } = await createTestPg({ legacyRestrictiveAttendance: true });
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const staffId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    await db.exec(`
      INSERT INTO users (id, email, name, role, password_hash)
      VALUES ('${userId}', 'wendy@kumbisaly.com', 'Wendy Waitress', 'waiterWaitress', 'hash');
      INSERT INTO staff_profiles (id, user_id, first_name, last_name, business_email, department, position, job_classification)
      VALUES ('${staffId}', '${userId}', 'Wendy', 'Waitress', 'wendy@kumbisaly.com', 'Restaurant', 'Waiter/Waitress', 'waiterWaitress');
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes)
      VALUES ('Waiters/ Waitress', 'Waiter/Waitress', 'Restaurant', '08:00', '23:59', 20);
    `);

    const session = { id: userId, email: "wendy@kumbisaly.com", name: "Wendy Waitress", role: "waiterWaitress" as const };
    const checkInNow = "2026-11-26T09:15:00.000Z";

    const checkedIn = await registerAttendance(session, "check_in", undefined, {
      canonicalNow: checkInNow,
      executor,
      runTransaction,
    });
    expect(checkedIn.nextAction).toBe("check_out");
    expect(checkedIn.record.verification_status).toBe("pending");
    expect(checkedIn.record.status).toBe("pending_verification");
    expect(checkedIn.record.late_minutes).toBe(75); // 09:15 vs 08:00 = 75m

    // Verify GET today's attendance immediately sees the checked-in record
    const todayAfterCheckIn = await getTodayAttendanceRecord(session, "2026-11-26T10:00:00.000Z", executor);
    expect(todayAfterCheckIn).not.toBeNull();
    expect(todayAfterCheckIn?.id).toBe(checkedIn.record.id);
    expect(todayAfterCheckIn?.check_out_at).toBeNull();

    // Verify policy event & outbox were persisted without 42P08 error
    const policyEvents = await db.query("SELECT event_type, actor_id FROM attendance_policy_events");
    expect(policyEvents.rows).toEqual([{ event_type: "check_in", actor_id: userId }]);
    const outboxEvents = await db.query("SELECT event_type FROM operational_outbox");
    expect(outboxEvents.rows).toEqual([{ event_type: "attendance.checked_in" }]);

    // Check-out at 20:00 Africa/Accra on a 23:59 schedule MUST succeed (no CHECKOUT_TOO_EARLY:23 block!)
    // and record early_checkout_minutes = 239 while preserving verification_status = 'pending' for manager review
    const checkedOut = await registerAttendance(session, "check_out", undefined, {
      canonicalNow: "2026-11-26T20:00:00.000Z",
      executor,
      runTransaction,
    });
    expect(checkedOut.nextAction).toBe("complete");
    expect(checkedOut.record.status).toBe("checked_out_early");
    expect(checkedOut.record.early_checkout_minutes).toBe(239);
    expect(checkedOut.record.verification_status).toBe("pending");
    expect(checkedOut.record.check_out_at).toBeTruthy();

    const todayAfterCheckOut = await getTodayAttendanceRecord(session, "2026-11-26T20:05:00.000Z", executor);
    expect(todayAfterCheckOut?.check_out_at).toBeTruthy();
    expect(todayAfterCheckOut?.early_checkout_minutes).toBe(239);
  });

  it("2. Canonical default/token-only Waitress session and email-linked profile check in and read back today's attendance cleanly", async () => {
    const { executor, runTransaction } = await createTestPg();
    const defaultWaiterSession = {
      id: "00000000-0000-4000-8000-000000000009",
      email: "waiter@kumbisaly.com",
      name: "Service Waiter",
      role: "waiterWaitress" as const,
    };

    const res = await registerAttendance(defaultWaiterSession, "check_in", undefined, {
      canonicalNow: "2026-11-26T08:05:00.000Z",
      executor,
      runTransaction,
    });
    expect(res.nextAction).toBe("check_out");

    const today = await getTodayAttendanceRecord(defaultWaiterSession, "2026-11-26T08:06:00.000Z", executor);
    expect(today?.id).toBe(res.record.id);
  });

  it("3. Reminders cron uses resolveWorkforceSchedule (Admin work_schedules + daily overrides + midnight wrap + unprovisioned users) instead of hardcoded 06:00", async () => {
    const { db, wfExecutor } = await createTestPg();
    const waiterUser = "11111111-1111-4111-8111-111111111111";
    const chefUser = "22222222-2222-4222-8222-222222222222";
    const managerUser = "33333333-3333-4333-8333-333333333333";
    const unprovisionedPosUser = "99999999-9999-4999-8999-999999999999";

    await db.exec(`
      INSERT INTO users (id, email, name, role) VALUES
        ('${waiterUser}', 'waiter1@kumbisaly.com', 'Ama Waitress', 'waiterWaitress'),
        ('${chefUser}', 'chef1@kumbisaly.com', 'Kojo Chef', 'kitchen'),
        ('${managerUser}', 'mgr@kumbisaly.com', 'General Manager', 'manager'),
        ('${unprovisionedPosUser}', 'posdesk@kumbisaly.com', 'Efua POS', 'restaurantFrontDesk');

      INSERT INTO staff_profiles (user_id, first_name, last_name, business_email, department, position, job_classification) VALUES
        ('${waiterUser}', 'Ama', 'Waitress', 'waiter1@kumbisaly.com', 'Restaurant', 'Waiter/Waitress', 'waiterWaitress'),
        ('${chefUser}', 'Kojo', 'Chef', 'chef1@kumbisaly.com', 'Restaurant', 'Chef', 'Chef'),
        ('${managerUser}', 'Gen', 'Manager', 'mgr@kumbisaly.com', 'Operations', 'General Manager', 'Management');

      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes) VALUES
        ('Waiters/ Waitress', 'Waiter/Waitress', 'Restaurant', '09:30', '23:59', 15),
        ('Night Kitchen Prep', 'Chef', 'Restaurant', '00:10', '08:00', 20),
        ('POS Front Desk Shift', 'POS', 'Restaurant', '10:00', '22:00', 10);
    `);

    // At 05:40 Africa/Accra (20 min before old hardcoded 06:00!), NOTHING should fire
    const atOldHardcodedWindow = await dispatchWorkforceShiftReminders({
      referenceTimestamp: "2026-11-26T05:40:30.000Z",
      executor: wfExecutor,
    });
    expect(atOldHardcodedWindow.created).toBe(0);

    // At 09:15:30 Africa/Accra (15 min before Admin's 09:30 Waiter/Waitress schedule, with ZERO rows in staff_schedule_assignments!)
    const atWaiterWindow = await dispatchWorkforceShiftReminders({
      referenceTimestamp: "2026-11-26T09:15:30.000Z",
      executor: wfExecutor,
    });
    expect(atWaiterWindow.created).toBe(1);

    // Running again 30 seconds later on the same Africa/Accra day must deduplicate
    const duplicateRun = await dispatchWorkforceShiftReminders({
      referenceTimestamp: "2026-11-26T09:16:00.000Z",
      executor: wfExecutor,
    });
    expect(duplicateRun.created).toBe(0);

    // Unprovisioned POS user (only in users table, no staff_profiles row yet!) still receives reminder at 09:50:30
    const atPosWindow = await dispatchWorkforceShiftReminders({
      referenceTimestamp: "2026-11-26T09:50:30.000Z",
      executor: wfExecutor,
    });
    expect(atPosWindow.created).toBe(1);

    // Midnight wrap-around: Chef starts at 00:10 with 20-min reminder -> triggers at 23:50..23:52
    const atMidnightWrapWindow = await dispatchWorkforceShiftReminders({
      referenceTimestamp: "2026-11-26T23:51:00.000Z",
      executor: wfExecutor,
    });
    expect(atMidnightWrapWindow.created).toBe(1);

    const notifs = await db.query<{ recipient_user_id: string; message: string }>(
      "SELECT recipient_user_id, message FROM notifications ORDER BY created_at ASC",
    );
    expect(notifs.rows).toEqual([
      {
        recipient_user_id: waiterUser,
        message: "Waiters/ Waitress starts in 15 minutes. Reporting time is 09:30 AM.",
      },
      {
        recipient_user_id: unprovisionedPosUser,
        message: "POS Front Desk Shift starts in 10 minutes. Reporting time is 10:00 AM.",
      },
      {
        recipient_user_id: chefUser,
        message: "Night Kitchen Prep starts in 20 minutes. Reporting time is 12:10 AM.",
      },
    ]);
  });

  it("4. Auto-checkout respects Admin's 23:59 schedule and also closes unclosed prior-day shifts after midnight rollover", async () => {
    const { db, executor, runTransaction } = await createTestPg();
    const userId = "44444444-4444-4444-8444-444444444444";
    const staffId = "55555555-5555-4555-8555-555555555555";
    const user2Id = "44444444-4444-4444-8444-444444444445";

    await db.exec(`
      INSERT INTO users (id, email, name, role) VALUES
        ('${userId}', 'wendy2@kumbisaly.com', 'Wendy', 'waiterWaitress'),
        ('${user2Id}', 'hk@kumbisaly.com', 'Kofi Housekeeping', 'housekeeping');
      INSERT INTO staff_profiles (id, user_id, first_name, last_name, business_email, department, position, job_classification)
      VALUES ('${staffId}', '${userId}', 'Wendy', 'Two', 'wendy2@kumbisaly.com', 'Restaurant', 'Waiter/Waitress', 'Other');
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time) VALUES
        ('Waiters/ Waitress', 'Waiter/Waitress', 'Restaurant', '01:00', '23:59'),
        ('Housekeeping Shift', 'Housekeeping', 'Hotel', '07:00', '23:59');
    `);

    const session = { id: userId, email: "wendy2@kumbisaly.com", name: "Wendy", role: "waiterWaitress" as const };
    const hkSession = { id: user2Id, email: "hk@kumbisaly.com", name: "Kofi Housekeeping", role: "housekeeping" as const };

    await registerAttendance(session, "check_in", undefined, {
      canonicalNow: "2026-11-26T09:00:00.000Z",
      executor,
      runTransaction,
    });
    await registerAttendance(hkSession, "check_in", undefined, {
      canonicalNow: "2026-11-26T07:05:00.000Z",
      executor,
      runTransaction,
    });

    // At 18:30 Africa/Accra, old hardcoded '18:00' fallback would have closed the shift prematurely
    const earlyAuto = await runScheduledAutoCheckout("2026-11-26T18:30:00.000Z", executor);
    expect(earlyAuto.updated).toBe(0);

    // Suppose cron ran at 00:05 on the NEXT day (after midnight rollover!) — both unclosed 23:59 shifts must close cleanly!
    const nextDayAuto = await runScheduledAutoCheckout("2026-11-27T00:05:00.000Z", executor);
    expect(nextDayAuto.updated).toBe(2);
  });

  it("5. Single-staff reminder & daily assignment override use canonical resolver without borrowing other roles", async () => {
    const { db, wfExecutor } = await createTestPg();
    const waiterUser = "66666666-6666-4666-8666-666666666666";
    const waiterStaff = "77777777-7777-4777-8777-777777777777";
    const overrideSched = "88888888-8888-4888-8888-888888888888";

    await db.exec(`
      INSERT INTO users (id, email, name, role) VALUES ('${waiterUser}', 'w3@kumbisaly.com', 'Wendy', 'waiterWaitress');
      INSERT INTO staff_profiles (id, user_id, first_name, last_name, business_email, department, position, job_classification)
      VALUES ('${waiterStaff}', '${waiterUser}', 'Wendy', 'Three', 'w3@kumbisaly.com', 'Restaurant', 'Waiter/Waitress', 'waiterWaitress');
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes)
      VALUES ('Waiters/ Waitress', 'Waiter/Waitress', 'Restaurant', '09:00', '23:59', 20);
      INSERT INTO work_schedules (id, name, job_classification, department, start_time, end_time, reminder_minutes)
      VALUES ('${overrideSched}', 'Special Afternoon Event', 'Waiter/Waitress', 'Restaurant', '14:00', '23:00', 30);
      INSERT INTO staff_schedule_assignments (staff_id, schedule_id, work_date, status)
      VALUES ('${waiterStaff}', '${overrideSched}', DATE '2026-11-26', 'scheduled');
    `);

    // General 09:00 rule window (08:40) is ignored because daily override (14:00 - 30m = 13:30) wins
    const atGeneralRule = await dispatchWorkforceShiftReminders({
      referenceTimestamp: "2026-11-26T08:40:30.000Z",
      executor: wfExecutor,
    });
    expect(atGeneralRule.created).toBe(0);

    // Single-staff trigger using staff_profiles.id at 13:30:30 fires the daily override reminder
    const singleByStaffId = await dispatchWorkforceShiftReminders({
      referenceTimestamp: "2026-11-26T13:30:30.000Z",
      staffOrUserId: waiterStaff,
      executor: wfExecutor,
    });
    expect(singleByStaffId.created).toBe(1);
  });

  it("6. Verifies reminder, attendance & auto-checkout routes have no hardcoded 06:00/18:00 fallbacks or broken colon split", () => {
    const cronRoute = readFileSync("app/api/v2/workforce/reminders/cron/route.ts", "utf8");
    const v1RemRoute = readFileSync("app/api/workforce/reminders/route.ts", "utf8");
    const v2RemRoute = readFileSync("app/api/v2/workforce/reminders/route.ts", "utf8");
    const autoCheckoutRoute = readFileSync("app/api/v2/attendance/auto-checkout/route.ts", "utf8");
    const v2AttRoute = readFileSync("app/api/v2/attendance/route.ts", "utf8");
    const v1AttRoute = readFileSync("app/api/attendance/route.ts", "utf8");
    const mgrRoute = readFileSync("app/api/attendance/manager/route.ts", "utf8");
    const reportsRoute = readFileSync("app/api/attendance/reports/route.ts", "utf8");

    expect(cronRoute).toContain("dispatchWorkforceShiftReminders");
    expect(cronRoute).not.toContain("06:00");
    expect(v1RemRoute).toContain("dispatchWorkforceShiftReminders");
    expect(v2RemRoute).toContain("dispatchWorkforceShiftReminders");
    expect(autoCheckoutRoute).toContain("runScheduledAutoCheckout");
    expect(autoCheckoutRoute).not.toContain("18:00");

    // Ensure neither attendance route splits CHECKOUT_TOO_EARLY on ':' (which truncated '23:59' to '23')
    expect(v2AttRoute).not.toContain('code.split(":")[1]');
    expect(v1AttRoute).not.toContain('code.split(":")[1]');

    // Ensure manager & reports routes no longer crash on missing legacy staff_shifts table
    expect(mgrRoute).not.toContain("staff_shifts");
    expect(reportsRoute).not.toContain("staff_shifts");
  });

  it("7. Verifies all workforce roles (frontDesk, restaurantFrontDesk, waiterWaitress, kitchen, housekeeping, staff) resolve schedules, check in, and check out cleanly (including across midnight)", async () => {
    const { db, executor, wfExecutor, runTransaction } = await createTestPg();

    await db.exec(`
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes) VALUES
        ('Hotel Reception', 'Reception', 'Hotel', '07:00', '19:00', 15),
        ('Restaurant POS', 'POS', 'Restaurant', '08:00', '22:00', 15),
        ('Floor Service', 'Waiter/Waitress', 'Restaurant', '09:00', '23:59', 20),
        ('Kitchen Brigade', 'Chef', 'Restaurant', '06:30', '18:30', 20),
        ('Room Care', 'Housekeeping', 'Hotel', '07:30', '17:30', 15),
        ('General Support', 'Staff', 'Operations', '08:30', '18:00', 10);
    `);

    const rolesToVerify = [
      { id: "10000000-0000-4000-8000-000000000101", role: "frontDesk" as const, email: "reception@kumbisaly.com", name: "Akua Reception", expectedSchedule: "Hotel Reception" },
      { id: "10000000-0000-4000-8000-000000000102", role: "restaurantFrontDesk" as const, email: "pos@kumbisaly.com", name: "Yaw POS", expectedSchedule: "Restaurant POS" },
      { id: "10000000-0000-4000-8000-000000000103", role: "waiterWaitress" as const, email: "waiter2@kumbisaly.com", name: "Abena Waitress", expectedSchedule: "Floor Service" },
      { id: "10000000-0000-4000-8000-000000000104", role: "kitchen" as const, email: "kitchen@kumbisaly.com", name: "Kwame Chef", expectedSchedule: "Kitchen Brigade" },
      { id: "10000000-0000-4000-8000-000000000105", role: "housekeeping" as const, email: "rooms@kumbisaly.com", name: "Adwoa Rooms", expectedSchedule: "Room Care" },
      { id: "10000000-0000-4000-8000-000000000106", role: "staff" as const, email: "opsstaff@kumbisaly.com", name: "Kweku Staff", expectedSchedule: "General Support" },
    ];

    for (const u of rolesToVerify) {
      await db.query(
        `INSERT INTO users (id, email, name, role) VALUES ($1, $2, $3, $4)`,
        [u.id, u.email, u.name, u.role],
      );

      const resolved = await resolveWorkforceSchedule(
        u.id,
        "2026-11-26T08:00:00.000Z",
        wfExecutor,
        u.role,
      );
      expect(resolved.schedule_name).toBe(u.expectedSchedule);
      expect(resolved.source).toBe("schedule");

      const checkInRes = await registerAttendance(
        { id: u.id, email: u.email, name: u.name, role: u.role },
        "check_in",
        undefined,
        { canonicalNow: "2026-11-26T09:05:00.000Z", executor, runTransaction },
      );
      expect(checkInRes.nextAction).toBe("check_out");

      // Waitress checks out at 00:12 NEXT DAY (across midnight rollover!) — must still find & close the open shift!
      const checkoutTimestamp =
        u.role === "waiterWaitress" ? "2026-11-27T00:12:00.000Z" : "2026-11-26T19:05:00.000Z";
      const checkOutRes = await registerAttendance(
        { id: u.id, email: u.email, name: u.name, role: u.role },
        "check_out",
        undefined,
        { canonicalNow: checkoutTimestamp, executor, runTransaction },
      );
      expect(checkOutRes.nextAction).toBe("complete");
      expect(checkOutRes.record.check_out_at).toBeTruthy();
    }
  });

  it("8. Manager Attendance Control Center & Reports APIs capture pending, confirmed, and checked-out records across all management roles without staff_shifts table", async () => {
    const { db, executor, runTransaction } = await createTestPg();
    const staffUserId = "20000000-0000-4000-8000-000000000201";
    const managerUserId = "20000000-0000-4000-8000-000000000202";

    await db.exec(`
      INSERT INTO users (id, email, name, role) VALUES
        ('${staffUserId}', 'grace@kumbisaly.com', 'Grace Waitress', 'waiterWaitress'),
        ('${managerUserId}', 'restmgr@kumbisaly.com', 'Restaurant Manager', 'restaurantManager');
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes)
      VALUES ('Waiters/ Waitress', 'Waiter/Waitress', 'Restaurant', '08:00', '23:59', 20);
    `);

    const nowIso = new Date().toISOString();
    const staffSession = { id: staffUserId, email: "grace@kumbisaly.com", name: "Grace Waitress", role: "waiterWaitress" as const };

    // Staff checks in and later checks out early (before manager confirms!)
    const ci = await registerAttendance(staffSession, "check_in", undefined, {
      canonicalNow: nowIso,
      executor,
      runTransaction,
    });
    const co = await registerAttendance(staffSession, "check_out", undefined, {
      canonicalNow: nowIso,
      executor,
      runTransaction,
    });
    expect(co.record.check_out_at).toBeTruthy();
    expect(co.record.verification_status).toBe("pending");

    // Wire route modules to our real PGlite DB (note: NO staff_shifts table exists!)
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      query: executor,
      withTransaction: runTransaction,
    }));
    vi.doMock("@/lib/api-auth", () => ({
      requireRole: async () => ({
        session: {
          id: managerUserId,
          email: "restmgr@kumbisaly.com",
          name: "Restaurant Manager",
          role: "restaurantManager",
        },
        error: null,
      }),
    }));
    vi.doMock("@/lib/realtime", () => ({
      publishRealtime: async () => undefined,
    }));

    try {
      const mgrRoute = await import("@/app/api/attendance/manager/route");
      const reportsRoute = await import("@/app/api/attendance/reports/route");

      // 1. GET /api/attendance/manager succeeds without staff_shifts and returns both pending & todayRecords
      const getRes1 = await mgrRoute.GET();
      expect(getRes1.status).toBe(200);
      const getBody1 = await getRes1.json();
      expect(getBody1.pending).toHaveLength(1);
      expect(getBody1.pending[0].id).toBe(ci.record.id);
      expect(getBody1.pending[0].scheduled_start).toBe("08:00");
      expect(getBody1.pending[0].scheduled_end).toBe("23:59");
      expect(getBody1.todayRecords).toHaveLength(1);
      expect(getBody1.summary.present).toBe("1");
      expect(getBody1.summary.checkedOut).toBe("1");

      // 2. PATCH /api/attendance/manager ('verified') approves without wiping out check_out_at / status!
      const patchRes = await mgrRoute.PATCH(
        new Request("http://localhost/api/v2/attendance/manager", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: ci.record.id, status: "verified" }),
        }),
      );
      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json();
      expect(patchBody.record.verification_status).toBe("verified");
      expect(patchBody.record.check_out_at).toBeTruthy();
      expect(["checked_out", "checked_out_early"]).toContain(patchBody.record.status);

      // 3. After confirmation, pending is 0, but todayRecords STILL captures the confirmed record on /attendance!
      const getRes2 = await mgrRoute.GET();
      const getBody2 = await getRes2.json();
      expect(getBody2.pending).toHaveLength(0);
      expect(getBody2.todayRecords).toHaveLength(1);
      expect(getBody2.todayRecords[0].lifecycleStatus).toBe("completed");

      // 4. GET /api/attendance/reports returns the verified record for restaurantManager without staff_shifts!
      const repRes = await reportsRoute.GET(new Request("http://localhost/api/attendance/reports?range=daily"));
      expect(repRes.status).toBe(200);
      const repBody = await repRes.json();
      expect(repBody.records).toHaveLength(1);
      expect(repBody.records[0].staff_name).toBe("Grace Waitress");
      expect(repBody.records[0].scheduled_start).toBe("08:00");
      expect(repBody.records[0].scheduled_end).toBe("23:59");
    } finally {
      vi.doUnmock("@/lib/db");
      vi.doUnmock("@/lib/api-auth");
      vi.doUnmock("@/lib/realtime");
      vi.resetModules();
    }
  });

  it("9. Calculates exact POS availableUnits across direct, standalone ('8 PM (Big Size)'), and recipe_ingredients linkage modes", () => {
    // 1. Standalone/legacy linked item ('8 PM (Big Size)') with 17 units in stock and directUnitsPerSale = 2 -> 8 sellable units
    const standalone = calculateMenuAvailability({
      inventoryMode: "recipe",
      availabilityMode: "automatic",
      isAvailable: true,
      legacyQuantity: 17,
      directUnitsPerSale: 2,
      ingredients: [],
    });
    expect(standalone.inStock).toBe(true);
    expect(standalone.availableUnits).toBe(8);

    // 2. Direct inventory linked item with 14 units in stock and directUnitsPerSale = 1 -> 14 sellable units
    const direct = calculateMenuAvailability({
      inventoryMode: "direct",
      availabilityMode: "automatic",
      isAvailable: true,
      directQuantity: 14,
      directUnitsPerSale: 1,
      ingredients: [],
    });
    expect(direct.inStock).toBe(true);
    expect(direct.availableUnits).toBe(14);

    // 3. Recipe ingredients item limited by bottleneck ingredient (floor(500 / 150) = 3 vs floor(20 / 2) = 10 -> 3 units left)
    const recipe = calculateMenuAvailability({
      inventoryMode: "recipe",
      availabilityMode: "automatic",
      isAvailable: true,
      ingredients: [
        { name: "Rice", requiredQuantity: 150, recipeUnit: "g", availableQuantity: 500, stockUnit: "g" },
        { name: "Chicken", requiredQuantity: 2, recipeUnit: "pcs", availableQuantity: 20, stockUnit: "pcs" },
      ],
    });
    expect(recipe.inStock).toBe(true);
    expect(recipe.availableUnits).toBe(3);

    // 4. Out-of-stock item -> 0 units left
    const depleted = calculateMenuAvailability({
      inventoryMode: "recipe",
      availabilityMode: "automatic",
      isAvailable: true,
      legacyQuantity: 0,
      directUnitsPerSale: 1,
      ingredients: [],
    });
    expect(depleted.inStock).toBe(false);
    expect(depleted.availableUnits).toBe(0);
  });
});
