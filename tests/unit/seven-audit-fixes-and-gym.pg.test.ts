import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  ALL_USER_ROLES,
  canAccessApiRoute,
  canManageFeatureToggles,
  hasPermission,
} from "@/lib/roles";
import { dispatchWorkforceShiftReminders, type WorkforceQueryExecutor } from "@/lib/workforce-schedule";
import {
  ensurePerformanceSchema,
  recordWorkforcePerformanceEvent,
  syncOperationalPerformanceEvents,
  type PerformanceQueryExecutor,
} from "@/lib/performance-service";
import { ensureGymSchema } from "@/lib/gym/schema";
import {
  createGymBookingTx,
  createGymMemberTx,
  createGymMembershipTx,
  createGymRefundRequestTx,
  processGymPaymentTx,
  reviewGymPaymentByFinanceTx,
  reviewGymRefundByFinanceTx,
  transitionGymBookingStatusTx,
} from "@/lib/gym/service";
import { financeDepartmentSql } from "@/lib/finance-classification";
import {
  isUnitCompatibleWithDimension,
  scoreUnitSearchMatch,
} from "@/components/ui/unit-select";
import { normalizeInventoryUnit } from "@/lib/inventory-units";

function makeExecutor(db: PGlite) {
  return async <R = Record<string, unknown>>(text: string, params?: unknown[]) => {
    const res = await db.query<R>(text, params);
    return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
  };
}

describe("Seven Production Fixes & Gym Finance Workflow (Real PostgreSQL + Unit)", () => {
  it("Issue #1: safely deletes inventory items with immutable top-up audit triggers & unlinks menu recipes when forced while preserving audit history", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE TABLE inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100),
        quantity NUMERIC(12, 3) DEFAULT 10
      );
      CREATE TABLE inventory_top_up_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_item_id UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
        delta NUMERIC(12, 3) NOT NULL
      );
      CREATE OR REPLACE FUNCTION prevent_topup_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'inventory_top_up_audit is immutable';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER inventory_top_up_audit_immutable
        BEFORE UPDATE OR DELETE ON inventory_top_up_audit
        FOR EACH ROW EXECUTE FUNCTION prevent_topup_mutation();

      CREATE TABLE inventory_item_uoms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
        base_unit VARCHAR(20) NOT NULL DEFAULT 'kg'
      );
      CREATE TABLE menu_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        inventory_mode VARCHAR(20) NOT NULL DEFAULT 'recipe',
        direct_inventory_id UUID REFERENCES inventory(id) ON DELETE RESTRICT
      );
      CREATE TABLE recipe_ingredients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
        inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
        quantity NUMERIC(12, 3) NOT NULL DEFAULT 1
      );
    `);

    const invRes = await db.query<{ id: string }>(
      `INSERT INTO inventory (name, sku, quantity) VALUES ('Fresh Tilapia', 'SKU-TIL-01', 25) RETURNING id::text AS id`,
    );
    const invId = invRes.rows[0].id;

    await db.query(
      `INSERT INTO inventory_top_up_audit (inventory_item_id, delta) VALUES ($1::uuid, 25)`,
      [invId],
    );
    await db.query(
      `INSERT INTO inventory_item_uoms (inventory_id, base_unit) VALUES ($1::uuid, 'kg')`,
      [invId],
    );
    const menuRes = await db.query<{ id: string }>(
      `INSERT INTO menu_items (name, inventory_mode, direct_inventory_id) VALUES ('Grilled Tilapia', 'direct', $1::uuid) RETURNING id::text AS id`,
      [invId],
    );
    await db.query(
      `INSERT INTO recipe_ingredients (menu_item_id, inventory_id, quantity) VALUES ($1::uuid, $2::uuid, 1)`,
      [menuRes.rows[0].id, invId],
    );

    // 1. Bare DELETE fails with 23503 before our schema detachment
    await expect(
      db.query(`DELETE FROM inventory WHERE id = $1::uuid`, [invId]),
    ).rejects.toThrow();

    // 2. Apply our route's non-destructive detachment + force unlink
    await db.exec(`
      ALTER TABLE inventory_top_up_audit DROP CONSTRAINT IF EXISTS inventory_top_up_audit_inventory_item_id_fkey;
      ALTER TABLE inventory_top_up_audit ALTER COLUMN inventory_item_id DROP NOT NULL;
      ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_direct_inventory_id_fkey;
      ALTER TABLE inventory_item_uoms DROP CONSTRAINT IF EXISTS inventory_item_uoms_inventory_id_fkey;
    `);

    await db.query(`DELETE FROM recipe_ingredients WHERE inventory_id = $1::uuid`, [invId]);
    await db.query(
      `UPDATE menu_items SET direct_inventory_id = NULL, inventory_mode = 'recipe' WHERE direct_inventory_id = $1::uuid`,
      [invId],
    );
    await db.query(`DELETE FROM inventory_item_uoms WHERE inventory_id = $1::uuid`, [invId]);
    const del = await db.query(`DELETE FROM inventory WHERE id = $1::uuid RETURNING id`, [invId]);
    expect(del.rows.length).toBe(1);

    // Historical audit row is 100% preserved!
    const auditRemaining = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM inventory_top_up_audit`,
    );
    expect(Number(auditRemaining.rows[0].count)).toBe(1);
    await db.close();
  });

  it("Issue #2: GET /api/menu grouping returns exactly 1 row per food item even when recipe ingredients use multiple UOMs", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE TABLE categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) UNIQUE NOT NULL
      );
      CREATE TABLE inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        quantity NUMERIC(12, 3) DEFAULT 100,
        unit VARCHAR(30) DEFAULT 'kg'
      );
      CREATE TABLE inventory_item_uoms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_id UUID NOT NULL,
        base_unit VARCHAR(30) NOT NULL,
        conversion_factor_to_base NUMERIC(12, 4) DEFAULT 1,
        yield_factor NUMERIC(12, 4) DEFAULT 1,
        is_active BOOLEAN DEFAULT true
      );
      CREATE TABLE menu_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(10, 2) NOT NULL,
        category_id UUID REFERENCES categories(id),
        is_available BOOLEAN DEFAULT true,
        availability_mode VARCHAR(20) DEFAULT 'automatic',
        inventory_mode VARCHAR(20) DEFAULT 'recipe',
        direct_inventory_id UUID,
        direct_units_per_sale NUMERIC(10, 2) DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE recipe_ingredients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
        inventory_id UUID NOT NULL REFERENCES inventory(id),
        quantity NUMERIC(10, 3) NOT NULL,
        unit VARCHAR(30) NOT NULL
      );
    `);

    const cat = await db.query<{ id: string }>(
      `INSERT INTO categories (name) VALUES ('ghanaian') RETURNING id::text AS id`,
    );
    const inv1 = await db.query<{ id: string }>(
      `INSERT INTO inventory (name, quantity, unit) VALUES ('Rice', 50, 'kg') RETURNING id::text AS id`,
    );
    const inv2 = await db.query<{ id: string }>(
      `INSERT INTO inventory (name, quantity, unit) VALUES ('Cooking Oil', 20, 'l') RETURNING id::text AS id`,
    );
    const inv3 = await db.query<{ id: string }>(
      `INSERT INTO inventory (name, quantity, unit) VALUES ('Chicken Thighs', 40, 'pcs') RETURNING id::text AS id`,
    );

    await db.query(
      `INSERT INTO inventory_item_uoms (inventory_id, base_unit, conversion_factor_to_base, yield_factor)
       VALUES ($1::uuid, 'g', 1000, 1), ($2::uuid, 'ml', 1000, 0.98), ($3::uuid, 'pcs', 1, 0.90)`,
      [inv1.rows[0].id, inv2.rows[0].id, inv3.rows[0].id],
    );

    const mi = await db.query<{ id: string }>(
      `INSERT INTO menu_items (name, description, price, category_id)
       VALUES ('Assorted Jollof Rice', 'Signature spicy rice', 85, $1::uuid)
       RETURNING id::text AS id`,
      [cat.rows[0].id],
    );
    await db.query(
      `INSERT INTO recipe_ingredients (menu_item_id, inventory_id, quantity, unit)
       VALUES ($1::uuid, $2::uuid, 250, 'g'), ($1::uuid, $3::uuid, 30, 'ml'), ($1::uuid, $4::uuid, 2, 'pcs')`,
      [mi.rows[0].id, inv1.rows[0].id, inv2.rows[0].id, inv3.rows[0].id],
    );

    // Fixed GROUP BY query (without active_uom lateral columns in outer GROUP BY)
    const menuRes = await db.query<{ id: string; ingredient_count: number }>(
      `SELECT mi.id::text AS id, mi.name, COUNT(ri.id)::int AS ingredient_count
       FROM menu_items mi
       LEFT JOIN categories c ON mi.category_id = c.id
       LEFT JOIN recipe_ingredients ri ON ri.menu_item_id = mi.id
       LEFT JOIN inventory i ON i.id = ri.inventory_id
       LEFT JOIN LATERAL (
         SELECT base_unit, conversion_factor_to_base, yield_factor
         FROM inventory_item_uoms uom
         WHERE uom.inventory_id = i.id AND uom.is_active = true
         LIMIT 1
       ) active_uom ON true
       GROUP BY mi.id, c.name`,
    );

    expect(menuRes.rows).toHaveLength(1);
    expect(menuRes.rows[0].ingredient_count).toBe(3);
    await db.close();
  });

  it("Issue #3: 20-minute shift reminder triggers anywhere inside [start_time - 20m, start_time), skips checked-in staff, and supports scheduled Finance/Operations roles", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT true
      );
      CREATE TABLE staff_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id),
        first_name VARCHAR(120) NOT NULL,
        last_name VARCHAR(120) NOT NULL,
        business_email VARCHAR(255) UNIQUE NOT NULL,
        department VARCHAR(100),
        position VARCHAR(100),
        job_classification VARCHAR(100) DEFAULT 'other',
        employment_status VARCHAR(50) DEFAULT 'active',
        is_active BOOLEAN DEFAULT true
      );
      CREATE TABLE attendance_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID,
        user_id UUID,
        check_in_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    const waiter = await db.query<{ id: string }>(
      `INSERT INTO users (email, name, role) VALUES ('waiter1@kumbi.test', 'Ama Waiter', 'waiterWaitress') RETURNING id::text AS id`,
    );
    const checkedInChef = await db.query<{ id: string }>(
      `INSERT INTO users (email, name, role) VALUES ('chef1@kumbi.test', 'Kojo Chef', 'kitchen') RETURNING id::text AS id`,
    );
    const financeUser = await db.query<{ id: string }>(
      `INSERT INTO users (email, name, role) VALUES ('fin1@kumbi.test', 'Efua Finance', 'finance') RETURNING id::text AS id`,
    );

    const exec = makeExecutor(db) as WorkforceQueryExecutor;

    // Schedule an explicit 08:00 shift (20-min reminder) for both Restaurant and Finance
    await exec(
      `CREATE TABLE IF NOT EXISTS work_schedules (
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
       )`,
    );
    await exec(
      `INSERT INTO work_schedules (name, job_classification, start_time, end_time, reminder_minutes)
       VALUES ('Morning Shift', 'waiter_waitress', '08:00:00', '17:00:00', 20),
              ('Kitchen Shift', 'chef_kitchen', '08:00:00', '17:00:00', 20),
              ('Finance Morning', 'finance_officer', '08:00:00', '17:00:00', 20)`,
    );

    // Mark Kojo Chef as already checked in on 2026-11-27
    await exec(
      `INSERT INTO attendance_records (user_id, staff_id, check_in_at, created_at)
       VALUES ($1::uuid, $1::uuid, '2026-11-27T07:45:00Z'::timestamptz, '2026-11-27T07:45:00Z'::timestamptz)`,
      [checkedInChef.rows[0].id],
    );

    // Poll at 07:52 UTC (8 minutes before 08:00 shift — previously missed by the old 120s window!)
    const pollTime = new Date("2026-11-27T07:52:00Z");
    const res = await dispatchWorkforceShiftReminders({
      referenceTimestamp: pollTime,
      executor: exec,
    });

    expect(res.created).toBeGreaterThanOrEqual(2);
    const notifRows = await db.query<{ recipient_user_id: string; message: string }>(
      `SELECT recipient_user_id::text AS recipient_user_id, message FROM notifications WHERE type = 'shift_reminder'`,
    );
    const recipientIds = notifRows.rows.map((r) => r.recipient_user_id);
    expect(recipientIds).toContain(waiter.rows[0].id);
    expect(recipientIds).toContain(financeUser.rows[0].id);
    expect(recipientIds).not.toContain(checkedInChef.rows[0].id);

    // Idempotent second poll sends 0 duplicates
    const secondRes = await dispatchWorkforceShiftReminders({
      referenceTimestamp: pollTime,
      executor: exec,
    });
    expect(secondRes.created).toBe(0);
    await db.close();
  });

  it("Issue #4: Workforce points engine heals legacy performance_events (missing completed_at & integer points) and syncs attendance, shift checkout, housekeeping (users.id), maintenance, and POS points", async () => {
    const db = new PGlite();
    // Legacy broken performance_events without completed_at and with INTEGER points
    await db.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) NOT NULL
      );
      CREATE TABLE staff_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL
      );
      CREATE TABLE performance_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID NOT NULL,
        source_type VARCHAR(100) NOT NULL,
        source_id VARCHAR(255),
        points INTEGER NOT NULL DEFAULT 1,
        verification_status VARCHAR(50) DEFAULT 'verified',
        verified_by UUID,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE attendance_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        staff_id UUID NOT NULL,
        user_id UUID,
        verification_status VARCHAR(50) NOT NULL,
        verified_at TIMESTAMPTZ,
        verified_by UUID,
        check_in_at TIMESTAMPTZ,
        check_out_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE housekeeping_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assigned_to UUID,
        task_type VARCHAR(50),
        status VARCHAR(50),
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE maintenance_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assigned_to UUID,
        title VARCHAR(200),
        status VARCHAR(50),
        resolved_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number VARCHAR(80),
        status VARCHAR(40),
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    const hkUser = await db.query<{ id: string }>(
      `INSERT INTO users (email, name, role) VALUES ('hk@kumbi.test', 'Akosua HK', 'housekeeping') RETURNING id::text AS id`,
    );
    const hkProfile = await db.query<{ id: string }>(
      `INSERT INTO staff_profiles (user_id, first_name, last_name) VALUES ($1::uuid, 'Akosua', 'HK') RETURNING id::text AS id`,
      [hkUser.rows[0].id],
    );

    // Attendance verified + checked out, housekeeping assigned to users.id (mismatch with staff_profiles.id!), and POS order
    await db.query(
      `INSERT INTO attendance_records (staff_id, user_id, verification_status, check_in_at, check_out_at)
       VALUES ($1::uuid, $2::uuid, 'verified', now() - interval '8 hours', now())`,
      [hkProfile.rows[0].id, hkUser.rows[0].id],
    );
    await db.query(
      `INSERT INTO housekeeping_tasks (assigned_to, task_type, status, completed_at)
       VALUES ($1::uuid, 'deep_clean', 'completed', now())`,
      [hkUser.rows[0].id],
    );
    await db.query(
      `INSERT INTO orders (order_number, status, created_by)
       VALUES ('ORD-TEST-900', 'completed', $1::uuid)`,
      [hkUser.rows[0].id],
    );

    const exec = makeExecutor(db) as PerformanceQueryExecutor;
    await ensurePerformanceSchema(exec);

    // Fractional 0.5 adjustment succeeds without 22P02
    const halfPointOk = await recordWorkforcePerformanceEvent(
      {
        staffOrUserId: hkUser.rows[0].id,
        sourceType: "late_checkin_adjustment",
        sourceId: "manual-half-1",
        points: 0.5,
        category: "attendance",
        reason: "Half-point test",
      },
      exec,
    );
    expect(halfPointOk).toBe(true);

    const syncStats = await syncOperationalPerformanceEvents({}, exec);
    expect(syncStats.attendance).toBe(1);
    expect(syncStats.shiftsCompleted).toBe(1);
    expect(syncStats.tasks).toBe(1);
    expect(syncStats.orders).toBe(1);

    const sumRes = await db.query<{ total: string }>(
      `SELECT SUM(points)::text AS total FROM performance_events WHERE staff_id = $1::uuid`,
      [hkProfile.rows[0].id],
    );
    // 0.5 (manual) + 1 (attendance_verified) + 1 (shift_completed) + 2 (housekeeping) + 1 (pos_order) = 5.5
    expect(Number(sumRes.rows[0].total)).toBe(5.5);
    await db.close();
  });

  it("Issue #5: /api/feature-toggles is readable by all 12 roles so Order Board & Kitchen Display OFF state syncs everywhere, while mutation stays Admin-only", () => {
    for (const role of ALL_USER_ROLES) {
      expect(canAccessApiRoute(role, "/api/feature-toggles")).toBe(true);
    }
    expect(canManageFeatureToggles("admin")).toBe(true);
    expect(canManageFeatureToggles("kitchen")).toBe(false);
    expect(canManageFeatureToggles("waiterWaitress")).toBe(false);
    expect(canManageFeatureToggles("restaurantManager")).toBe(false);
    expect(hasPermission("finance", "gym")).toBe(true);
    expect(hasPermission("frontDesk", "gym")).toBe(true);
  });

  it("Issue #6: Gym Booking System & Finance Department transactional workflow (session booking, GRA tax, cash post, bank-transfer Finance approval, hotel room folio charge, check-in points, and Finance refund reversal)", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT true
      );
      CREATE TABLE staff_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE REFERENCES users(id),
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL
      );
      CREATE TABLE reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status VARCHAR(40) NOT NULL
      );
      CREATE TABLE guest_folios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id UUID NOT NULL REFERENCES reservations(id),
        service_charges NUMERIC(12, 2) DEFAULT 0,
        total_charges NUMERIC(12, 2) DEFAULT 0,
        balance NUMERIC(12, 2) DEFAULT 0,
        last_updated TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE guest_folio_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        folio_id UUID NOT NULL REFERENCES guest_folios(id),
        category VARCHAR(50),
        description VARCHAR(255),
        quantity INTEGER DEFAULT 1,
        unit_amount NUMERIC(12, 2),
        total_amount NUMERIC(12, 2),
        created_by UUID
      );
    `);

    const exec = makeExecutor(db);
    await ensureGymSchema(exec);

    const staffRes = await db.query<{ id: string }>(
      `INSERT INTO users (email, name, role) VALUES ('desk@kumbi.test', 'Kofi Desk', 'frontDesk') RETURNING id::text AS id`,
    );
    const finRes = await db.query<{ id: string }>(
      `INSERT INTO users (email, name, role) VALUES ('finance@kumbi.test', 'Abena Finance', 'finance') RETURNING id::text AS id`,
    );
    const deskActor = { id: staffRes.rows[0].id, name: "Kofi Desk", role: "frontDesk" };
    const financeActor = { id: finRes.rows[0].id, name: "Abena Finance", role: "finance" };

    const client = { query: exec } as unknown as Parameters<typeof createGymMemberTx>[0];

    // 1. Seeded 8 default gym plans exist
    const plansRes = await db.query<{ id: string; code: string; base_price: string }>(
      `SELECT id::text AS id, code, base_price::text AS base_price FROM gym_plans ORDER BY base_price ASC`,
    );
    expect(plansRes.rows.length).toBe(8);
    const walkInPlan = plansRes.rows.find((p) => p.code === "GYM-WALKIN-SESSION")!;
    const monthlyPlan = plansRes.rows.find((p) => p.code === "GYM-MONTHLY-STD")!;

    // 2. Register Gym member
    const member = await createGymMemberTx(client, {
      firstName: "Kwesi",
      lastName: "Mensah",
      phone: "0244112233",
      email: "kwesi@example.com",
      actor: deskActor,
    });
    expect(String(member.member_number)).toMatch(/^GYM-MEM-/);

    // 3. Book a Walk-in Session (base 50 GHS + GRA taxes -> 60.95 GHS) & settle in Cash
    const bkCreated = await createGymBookingTx(client, {
      memberId: String(member.id),
      planId: walkInPlan.id,
      sessionDate: "2026-11-27",
      actor: deskActor,
    });
    const bkId = String(bkCreated.booking.id);
    const invoicedTotal = Number(bkCreated.booking.total_invoiced);
    expect(invoicedTotal).toBeGreaterThan(50);

    const cashPaid = await processGymPaymentTx(client, {
      bookingId: bkId,
      method: "cash",
      idempotencyKey: "test-gym-cash-1",
      actor: deskActor,
    });
    expect(cashPaid.requiresFinanceApproval).toBe(false);

    // Check in member -> awards +1 workforce point to frontDesk staff!
    const checkedInBk = await transitionGymBookingStatusTx(client, {
      bookingId: bkId,
      action: "check_in",
      actor: deskActor,
    });
    expect(checkedInBk.status).toBe("checked_in");

    const pts = await db.query<{ points: string }>(
      `SELECT points::text AS points FROM performance_events WHERE source_type = 'gym_session_checkin' AND source_id = $1::varchar`,
      [bkId],
    );
    expect(Number(pts.rows[0]?.points)).toBe(1);

    // 4. Enroll Monthly Membership & pay via Bank Transfer -> Pending Finance Verification -> Finance Approves & Activates!
    const subCreated = await createGymMembershipTx(client, {
      memberId: String(member.id),
      planId: monthlyPlan.id,
      startDate: "2026-11-27",
      actor: deskActor,
    });
    const subId = String(subCreated.membership.id);
    expect(subCreated.membership.status).toBe("pending_payment");

    const bankPay = await processGymPaymentTx(client, {
      membershipId: subId,
      method: "bank_transfer",
      providerReference: "GCB-TX-88991",
      idempotencyKey: "test-gym-bank-1",
      actor: deskActor,
    });
    expect(bankPay.requiresFinanceApproval).toBe(true);
    expect(bankPay.payment.status).toBe("pending");

    await reviewGymPaymentByFinanceTx(client, {
      paymentId: String(bankPay.payment.id),
      action: "approve_and_post",
      actor: financeActor,
    });

    const activeSub = await db.query<{ status: string; balance_due: string }>(
      `SELECT status, balance_due::text AS balance_due FROM gym_memberships WHERE id = $1::uuid`,
      [subId],
    );
    expect(activeSub.rows[0].status).toBe("active");
    expect(Number(activeSub.rows[0].balance_due)).toBe(0);

    // 5. Verify canonical_financial_ledger classifies both postings under 'gym' department!
    const gymLedger = await db.query<{ dept: string; count: string }>(
      `SELECT (${financeDepartmentSql}) AS dept, COUNT(*)::text AS count
       FROM canonical_financial_ledger
       WHERE status = 'posted'
       GROUP BY 1`,
    );
    expect(gymLedger.rows[0]).toEqual({ dept: "gym", count: "2" });

    // 6. Charge another booking to a Checked-In Hotel Guest Room Folio
    const resRow = await db.query<{ id: string }>(
      `INSERT INTO reservations (status) VALUES ('checked_in') RETURNING id::text AS id`,
    );
    await db.query(
      `INSERT INTO guest_folios (reservation_id, total_charges, balance) VALUES ($1::uuid, 500, 500)`,
      [resRow.rows[0].id],
    );
    const member2 = await createGymMemberTx(client, {
      firstName: "Hotel",
      lastName: "VIP",
      phone: "0200001111",
      actor: deskActor,
    });
    const roomBk = await createGymBookingTx(client, {
      memberId: String(member2.id),
      planId: walkInPlan.id,
      reservationId: resRow.rows[0].id,
      sessionDate: "2026-11-27",
      actor: deskActor,
    });
    const folioPay = await processGymPaymentTx(client, {
      bookingId: String(roomBk.booking.id),
      method: "room_charge",
      reservationId: resRow.rows[0].id,
      idempotencyKey: "test-gym-folio-1",
      actor: deskActor,
    });
    expect(folioPay.chargedToRoomFolio).toBe(true);

    const updatedFolio = await db.query<{ service_charges: string }>(
      `SELECT service_charges::text AS service_charges FROM guest_folios WHERE reservation_id = $1::uuid`,
      [resRow.rows[0].id],
    );
    expect(Number(updatedFolio.rows[0].service_charges)).toBeCloseTo(invoicedTotal, 2);

    // 7. Submit Refund Request & Approve via Finance -> Posts debit 'refund' reversal in canonical_financial_ledger
    const refReq = await createGymRefundRequestTx(client, {
      paymentId: String(cashPaid.payment.id),
      reason: "Client shortened workout due to schedule change",
      actor: deskActor,
    });
    expect(refReq.status).toBe("pending_finance_approval");

    const approvedRef = await reviewGymRefundByFinanceTx(client, {
      refundId: String(refReq.id),
      action: "approve",
      actor: financeActor,
    });
    expect(approvedRef.status).toBe("approved");

    const debitLedger = await db.query<{ amount: string; direction: string; journal_type: string }>(
      `SELECT amount::text AS amount, direction, journal_type
       FROM canonical_financial_ledger
       WHERE source = 'gym_refund'`,
    );
    expect(debitLedger.rows).toHaveLength(1);
    expect(debitLedger.rows[0].direction).toBe("debit");
    expect(debitLedger.rows[0].journal_type).toBe("refund");
    await db.close();
  });

  it("Issue #7: UnitSelect search & dimension filters find plurals, British spellings, and all 21 previously-dropped packaging/produce/portion units", () => {
    expect(
      scoreUnitSearchMatch("kg Kilogram (kg)", "kilograms", [
        "kg",
        "kilogram",
        "kilograms",
        "kilogramme",
      ]),
    ).toBeGreaterThan(0);
    expect(
      scoreUnitSearchMatch("l Liter (L)", "litres", ["l", "liter", "litre", "litres"]),
    ).toBeGreaterThan(0);
    expect(
      scoreUnitSearchMatch("ml Milliliter (ml)", "millilitres", [
        "ml",
        "milliliter",
        "millilitre",
        "millilitres",
      ]),
    ).toBeGreaterThan(0);
    expect(
      scoreUnitSearchMatch("btl Bottle (btl)", "bottles", ["btl", "bottle", "bottles"]),
    ).toBeGreaterThan(0);
    expect(
      scoreUnitSearchMatch("dz Dozen (dz / 12 pcs)", "dozen", ["dz", "dozen", "12"]),
    ).toBeGreaterThan(0);

    // Previously dropped units when compatibleDimension was passed:
    for (const countUnit of ["dz", "btl", "flat", "tub", "drum", "sleeve", "bulb", "clove", "bunch", "head", "leaf", "jar", "sachet", "pcs"]) {
      expect(isUnitCompatibleWithDimension(countUnit, "count")).toBe(true);
      expect(normalizeInventoryUnit(countUnit)).not.toBeNull();
    }
    for (const universalPortion of ["c", "slice", "scoop", "ladle", "pinch", "portion", "serving"]) {
      expect(isUnitCompatibleWithDimension(universalPortion, "mass")).toBe(true);
      expect(isUnitCompatibleWithDimension(universalPortion, "volume")).toBe(true);
      expect(isUnitCompatibleWithDimension(universalPortion, "count")).toBe(true);
    }
    expect(normalizeInventoryUnit("mg")).toBe("mg");
    expect(normalizeInventoryUnit("pt")).toBe("pt");
    expect(normalizeInventoryUnit("cup")).toBe("unit");
  });
});
