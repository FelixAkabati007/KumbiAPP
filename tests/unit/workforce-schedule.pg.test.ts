import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { resolveWorkforceSchedule } from "@/lib/workforce-schedule";

const U = "11111111-1111-1111-1111-111111111111";

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE users (id uuid primary key default gen_random_uuid(), role text, name text, email text);
    CREATE TABLE staff_profiles (id uuid primary key default gen_random_uuid(), user_id uuid unique, position text, job_classification text, department text);
    CREATE TABLE work_schedules (id uuid primary key default gen_random_uuid(), name text not null, job_classification text not null, department text, shift_period text default 'standard', start_time time not null, end_time time not null, reminder_minutes int default 20, timezone text default 'Africa/Accra', is_active boolean default true, created_at timestamptz default now(), updated_at timestamptz default now());
    CREATE TABLE staff_schedule_assignments (id uuid primary key default gen_random_uuid(), staff_id uuid not null, schedule_id uuid not null, work_date date not null, status text not null default 'scheduled', created_at timestamptz default now(), updated_at timestamptz default now());
  `);
  const executor = async (text: string, params?: unknown[]) => {
    const r = await db.query(text, params as unknown[]);
    return { rows: r.rows as never[], rowCount: r.rows.length };
  };
  return { db, executor };
}

async function run(executor: never, role = "waiterWaitress", dept?: string) {
  const w = console.warn, e = console.error;
  const logs: string[] = [];
  console.warn = (...a) => { logs.push(a.map(String).join(" ").slice(0, 200)); };
  console.error = (...a) => { logs.push(a.map(String).join(" ").slice(0, 200)); };
  try {
    const s = await resolveWorkforceSchedule(U, undefined, executor, role, dept);
    return { s, logs };
  } finally { console.warn = w; console.error = e; }
}

/**
 * Regression suite that executes the REAL SQL of resolveWorkforceSchedule against a real PostgreSQL engine (PGlite).
 * The mock-executor tests cannot catch PostgreSQL type-inference errors (42P18 "could not determine data type of
 * parameter $n"), which previously made the resolver silently fall back to the hardcoded 08:00-21:00 times.
 */
describe("resolveWorkforceSchedule against a real PostgreSQL engine", () => {
  it("1. waiter gets Admin 01:00-23:59", async () => {
    const { db, executor } = await freshDb();
    await db.exec(`
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time) VALUES ('Waiters/ Waitress','Waiter/Waitress','Restaurant','01:00','23:59');
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time) VALUES ('Chef Weekly Schedule','Chef','Restaurant','07:00','21:00');
      INSERT INTO users (id, role, name, email) VALUES ('${U}','waiterWaitress','Wendy','w@x.com');
      INSERT INTO staff_profiles (user_id, position, job_classification, department) VALUES ('${U}','Waiter/Waitress','waiterWaitress','Restaurant');`);
    const { s, logs } = await run(executor as never);
    expect(logs.filter((l) => l.includes("could not determine data type"))).toEqual([]);
    expect([s.start_time, s.end_time, s.source]).toEqual(["01:00", "23:59", "schedule"]);
  });

  it("2. Admin edit after seeded default: newest wins, no stale 08:00", async () => {
    const { db, executor } = await freshDb();
    await db.exec(`
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time, created_at, updated_at) VALUES ('Waiter/Waitress Shift','Waiter/Waitress','Restaurant','08:00','21:00', now() - interval '5 days', now() - interval '5 days');
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time) VALUES ('Waiters/ Waitress','Waiter/Waitress','Restaurant','02:01','23:59');
      INSERT INTO users (id, role, name, email) VALUES ('${U}','waiterWaitress','Wendy','w@x.com');
      INSERT INTO staff_profiles (user_id, position, job_classification, department) VALUES ('${U}','Waiter/Waitress','Waiter/Waitress','Operations');`);
    const { s } = await run(executor as never);
    expect([s.start_time, s.end_time]).toEqual(["02:01", "23:59"]);
  });

  it("3. no users row at all (token-only session) still resolves via role", async () => {
    const { db, executor } = await freshDb();
    await db.exec(`INSERT INTO work_schedules (name, job_classification, department, start_time, end_time) VALUES ('Waiters/ Waitress','Waiter/Waitress','Restaurant','01:00','23:59');`);
    const { s } = await run(executor as never);
    expect([s.start_time, s.end_time, s.source]).toEqual(["01:00", "23:59", "schedule"]);
  });

  it("4. Other role inherits Admin 'Other' schedule", async () => {
    const { db, executor } = await freshDb();
    await db.exec(`
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time) VALUES ('Operation Manager Weekly Schedule','Other','Operations','07:00','20:00');
      INSERT INTO users (id, role, name, email) VALUES ('${U}','staff','Olu','o@x.com');
      INSERT INTO staff_profiles (user_id, position, job_classification, department) VALUES ('${U}','Other','Other','Operations');`);
    const { s } = await run(executor as never, "staff");
    expect([s.start_time, s.end_time, s.source]).toEqual(["07:00", "20:00", "schedule"]);
  });

  it("5. daily assignment override beats the rule", async () => {
    const { db, executor } = await freshDb();
    await db.exec(`
      INSERT INTO work_schedules (id, name, job_classification, department, start_time, end_time) VALUES ('22222222-2222-2222-2222-222222222222','Late','Chef','Restaurant','12:00','23:00');
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time) VALUES ('Waiters/ Waitress','Waiter/Waitress','Restaurant','01:00','23:59');
      INSERT INTO users (id, role, name, email) VALUES ('${U}','waiterWaitress','Wendy','w@x.com');
      INSERT INTO staff_profiles (id, user_id, position, job_classification, department) VALUES ('33333333-3333-3333-3333-333333333333','${U}','Waiter/Waitress','waiterWaitress','Restaurant');
      INSERT INTO staff_schedule_assignments (staff_id, schedule_id, work_date) VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222', (timezone('Africa/Accra', now()))::date);`);
    const { s } = await run(executor as never);
    expect([s.start_time, s.end_time, s.source]).toEqual(["12:00", "23:00", "assignment"]);
  });

  it("6. nothing matches -> flagged fallback, never silently presented as Admin times", async () => {
    const { db, executor } = await freshDb();
    await db.exec(`INSERT INTO work_schedules (name, job_classification, department, start_time, end_time) VALUES ('Security','Security','Operations','06:00','23:00');`);
    const { s } = await run(executor as never);
    expect(s.source).toBe("fallback");
  });

  it("7. every other role family resolves to its own Admin rule", async () => {
    const { db, executor } = await freshDb();
    await db.exec(`
      INSERT INTO work_schedules (name, job_classification, department, start_time, end_time) VALUES
       ('Reception (Hotel) Schedule','Reception','Hotel','06:00','23:00'),
       ('Chef Weekly Schedule','Chef','Restaurant','07:00','21:00'),
       ('Front Desk (Restaurant)','Restaurant Front Desk / POS','Restaurant','07:00','22:00'),
       ('Security','Security','Operations','06:00','23:00');
      INSERT INTO users (id, role, name, email) VALUES ('${U}','x','X','x@x.com');`);
    const cases: [string, string, string][] = [["frontdesk","06:00","23:00"],["kitchen","07:00","21:00"],["restaurantFrontDesk","07:00","22:00"],["security","06:00","23:00"]];
    for (const [role, st, en] of cases) {
      await db.exec(`DELETE FROM staff_profiles; UPDATE users SET role='${role}';`);
      const { s } = await run(executor as never, role);
      expect([role, s.start_time, s.end_time]).toEqual([role, st, en]);
    }
  });
});
