import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  getTodayAttendanceRecord,
  registerAttendance,
  runScheduledAutoCheckout,
  type AttendanceQueryExecutor,
  type AttendanceTransactionRunner,
} from "@/lib/attendance-service";
import { dispatchWorkforceShiftReminders, type WorkforceQueryExecutor } from "@/lib/workforce-schedule";

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
    return { rows: r.rows as R[], rowCount: r.affectedRows ?? r.rows.length };
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

describe("Waitress attendance check-in, schedule sync, reminders cron & auto-checkout (real PostgreSQL)", () => {
  it("1. Waitress check-in heals legacy restrictive schema, avoids 42P08/23503/23514, updates today's attendance, and enforces Admin end time on check-out", async () => {
    const { db, executor, runTransaction } = await createTestPg({ legacyRestrictiveAttendance: true });
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const staffId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    await db.exec(`
      INSERT INTO users (id, email, name, role, password_hash)
      VALUES ('${userId}', 'wendy@kumbisaly.com', 'Wendy Waitress', 'waiterWaitress', 'hash');
      INSERT INTO staff_profiles (id, user_id, first_name, last_name, business_email, department, position, job_classification)
      VALUES ('${staffId}', '${userId}', 'Wendy', 'Waitress', 'wendy@kumbisaly.com', 'Restaurant', 'Waiter/Waitress', 'waiterWaitress');
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes)
      VALUES ('Waiters/ Waitress', 'Waiter/Waitress', 'Restaurant', '01:00', '23:59', 20);
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

    // Early check-out at 20:00 Africa/Accra must be blocked by Admin's 23:59 rule (not old 18:00/21:00)
    await expect(
      registerAttendance(session, "check_out", undefined, {
        canonicalNow: "2026-11-26T20:00:00.000Z",
        executor,
        runTransaction,
      }),
    ).rejects.toThrow("CHECKOUT_TOO_EARLY:23:59");

    // Check-out at 23:59 Africa/Accra succeeds and marks today's attendance complete
    const checkedOut = await registerAttendance(session, "check_out", undefined, {
      canonicalNow: "2026-11-26T23:59:10.000Z",
      executor,
      runTransaction,
    });
    expect(checkedOut.nextAction).toBe("complete");
    expect(checkedOut.record.status).toBe("checked_out");

    const todayAfterCheckOut = await getTodayAttendanceRecord(session, "2026-11-26T23:59:30.000Z", executor);
    expect(todayAfterCheckOut?.check_out_at).toBeTruthy();
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

  it("3. Reminders cron uses resolveWorkforceSchedule (Admin work_schedules + daily overrides + midnight wrap) instead of hardcoded 06:00", async () => {
    const { db, wfExecutor } = await createTestPg();
    const waiterUser = "11111111-1111-4111-8111-111111111111";
    const chefUser = "22222222-2222-4222-8222-222222222222";
    const managerUser = "33333333-3333-4333-8333-333333333333";

    await db.exec(`
      INSERT INTO users (id, email, name, role) VALUES
        ('${waiterUser}', 'waiter1@kumbisaly.com', 'Ama Waitress', 'waiterWaitress'),
        ('${chefUser}', 'chef1@kumbisaly.com', 'Kojo Chef', 'kitchen'),
        ('${managerUser}', 'mgr@kumbisaly.com', 'General Manager', 'manager');

      INSERT INTO staff_profiles (user_id, first_name, last_name, business_email, department, position, job_classification) VALUES
        ('${waiterUser}', 'Ama', 'Waitress', 'waiter1@kumbisaly.com', 'Restaurant', 'Waiter/Waitress', 'waiterWaitress'),
        ('${chefUser}', 'Kojo', 'Chef', 'chef1@kumbisaly.com', 'Restaurant', 'Chef', 'Chef'),
        ('${managerUser}', 'Gen', 'Manager', 'mgr@kumbisaly.com', 'Operations', 'General Manager', 'Management');

      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, reminder_minutes) VALUES
        ('Waiters/ Waitress', 'Waiter/Waitress', 'Restaurant', '09:30', '23:59', 15),
        ('Night Kitchen Prep', 'Chef', 'Restaurant', '00:10', '08:00', 20);
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
        recipient_user_id: chefUser,
        message: "Night Kitchen Prep starts in 20 minutes. Reporting time is 12:10 AM.",
      },
    ]);
  });

  it("4. Auto-checkout respects Admin's 23:59 Waiter/Waitress schedule instead of prematurely closing at hardcoded 18:00", async () => {
    const { db, executor, runTransaction } = await createTestPg();
    const userId = "44444444-4444-4444-8444-444444444444";
    const staffId = "55555555-5555-4555-8555-555555555555";

    await db.exec(`
      INSERT INTO users (id, email, name, role) VALUES ('${userId}', 'wendy2@kumbisaly.com', 'Wendy', 'waiterWaitress');
      INSERT INTO staff_profiles (id, user_id, first_name, last_name, business_email, department, position, job_classification)
      VALUES ('${staffId}', '${userId}', 'Wendy', 'Two', 'wendy2@kumbisaly.com', 'Restaurant', 'Waiter/Waitress', 'Other');
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time)
      VALUES ('Waiters/ Waitress', 'Waiter/Waitress', 'Restaurant', '01:00', '23:59');
    `);

    const session = { id: userId, email: "wendy2@kumbisaly.com", name: "Wendy", role: "waiterWaitress" as const };
    await registerAttendance(session, "check_in", undefined, {
      canonicalNow: "2026-11-26T09:00:00.000Z",
      executor,
      runTransaction,
    });

    // At 18:30 Africa/Accra, old hardcoded '18:00' fallback would have closed the shift prematurely
    const earlyAuto = await runScheduledAutoCheckout("2026-11-26T18:30:00.000Z", executor);
    expect(earlyAuto.updated).toBe(0);

    // At 23:59 Africa/Accra, shift closes as configured
    const dueAuto = await runScheduledAutoCheckout("2026-11-26T23:59:05.000Z", executor);
    expect(dueAuto.updated).toBe(1);
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

  it("6. Verifies reminder & auto-checkout routes have no hardcoded 06:00 or 18:00 SQL fallbacks", () => {
    const cronRoute = readFileSync("app/api/v2/workforce/reminders/cron/route.ts", "utf8");
    const v1RemRoute = readFileSync("app/api/workforce/reminders/route.ts", "utf8");
    const v2RemRoute = readFileSync("app/api/v2/workforce/reminders/route.ts", "utf8");
    const autoCheckoutRoute = readFileSync("app/api/v2/attendance/auto-checkout/route.ts", "utf8");

    expect(cronRoute).toContain("dispatchWorkforceShiftReminders");
    expect(cronRoute).not.toContain("06:00");
    expect(v1RemRoute).toContain("dispatchWorkforceShiftReminders");
    expect(v2RemRoute).toContain("dispatchWorkforceShiftReminders");
    expect(autoCheckoutRoute).toContain("runScheduledAutoCheckout");
    expect(autoCheckoutRoute).not.toContain("18:00");
  });
});
