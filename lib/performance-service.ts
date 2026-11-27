import { query } from "@/lib/db";
import { publishRealtime } from "@/lib/realtime";

export type PerformanceQueryExecutor = <R = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<{ rows: R[]; rowCount?: number | null }>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let performanceSchemaEnsured = false;

export async function ensurePerformanceSchema(
  executor: PerformanceQueryExecutor = query as unknown as PerformanceQueryExecutor,
): Promise<void> {
  const isDefault = executor === (query as unknown as PerformanceQueryExecutor);
  if (performanceSchemaEnsured && isDefault) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS performance_events (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       staff_id UUID NOT NULL,
       user_id UUID,
       source_type VARCHAR(100) NOT NULL,
       source_id VARCHAR(255),
       points NUMERIC(10, 2) NOT NULL DEFAULT 1,
       completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
       verification_status VARCHAR(50) NOT NULL DEFAULT 'verified',
       verified_by UUID,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    `ALTER TABLE performance_events ADD COLUMN IF NOT EXISTS user_id UUID`,
    `ALTER TABLE performance_events ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE performance_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`,
    `ALTER TABLE performance_events ALTER COLUMN points TYPE NUMERIC(10, 2) USING points::numeric`,
    `ALTER TABLE performance_events DROP CONSTRAINT IF EXISTS performance_events_staff_id_fkey`,
    `ALTER TABLE performance_events DROP CONSTRAINT IF EXISTS performance_events_verified_by_fkey`,
    `UPDATE performance_events
     SET completed_at = COALESCE(completed_at, created_at, CURRENT_TIMESTAMP)
     WHERE completed_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_performance_events_source ON performance_events(source_type, source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_performance_events_staff ON performance_events(staff_id, completed_at DESC)`,
  ];

  for (const stmt of statements) {
    await executor(stmt).catch(() => undefined);
  }

  if (isDefault) {
    performanceSchemaEnsured = true;
  }
}

export async function resolveStaffAndUserIds(
  staffOrUserId: string,
  executor: PerformanceQueryExecutor = query as unknown as PerformanceQueryExecutor,
): Promise<{ staffId: string; userId: string | null } | null> {
  const clean = String(staffOrUserId ?? "").trim();
  if (!UUID_REGEX.test(clean)) return null;

  const lookup = await executor<{ staff_id: string | null; user_id: string | null }>(
    `SELECT sp.id::text AS staff_id, COALESCE(sp.user_id, u.id)::text AS user_id
     FROM users u
     FULL OUTER JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE sp.id::text = $1::text OR sp.user_id::text = $1::text OR u.id::text = $1::text
     ORDER BY CASE WHEN sp.id::text = $1::text THEN 0 WHEN sp.user_id::text = $1::text THEN 1 ELSE 2 END
     LIMIT 1`,
    [clean],
  ).catch(() => ({ rows: [] as Array<{ staff_id: string | null; user_id: string | null }> }));

  const row = lookup.rows[0];
  return {
    staffId: row?.staff_id || clean,
    userId: row?.user_id || (UUID_REGEX.test(clean) ? clean : null),
  };
}

export async function recordWorkforcePerformanceEvent(
  input: {
    staffOrUserId: string;
    sourceType: string;
    sourceId: string;
    points: number;
    completedAt?: string | Date;
    verifiedBy?: string | null;
    category: string;
    reason: string;
    extraMetadata?: Record<string, unknown>;
  },
  executor: PerformanceQueryExecutor = query as unknown as PerformanceQueryExecutor,
): Promise<boolean> {
  if (!Number.isFinite(input.points) || input.points === 0 || !input.sourceId) return false;

  await ensurePerformanceSchema(executor);
  const resolved = await resolveStaffAndUserIds(input.staffOrUserId, executor);
  if (!resolved) return false;

  const verifiedByUuid =
    input.verifiedBy && UUID_REGEX.test(input.verifiedBy) ? input.verifiedBy : null;
  const completedIso = input.completedAt
    ? input.completedAt instanceof Date
      ? input.completedAt.toISOString()
      : input.completedAt
    : new Date().toISOString();

  const metadataJson = JSON.stringify({
    ...(input.extraMetadata ?? {}),
    category: input.category,
    reason: input.reason,
  });

  const ins = await executor<{ id: string }>(
    `INSERT INTO performance_events (
       staff_id, user_id, source_type, source_id, points, completed_at, verified_by, verification_status, metadata
     )
     SELECT $1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::numeric, $6::timestamptz, $7::uuid, 'verified', $8::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM performance_events pe
       WHERE pe.source_id::text = $9::text
         AND pe.source_type = $10::varchar
     )
     RETURNING id::text AS id`,
    [
      resolved.staffId,
      resolved.userId,
      input.sourceType,
      String(input.sourceId),
      input.points,
      completedIso,
      verifiedByUuid,
      metadataJson,
      String(input.sourceId),
      input.sourceType,
    ],
  ).catch((err) => {
    console.warn("[performance] Event insert skipped:", err);
    return { rows: [] as Array<{ id: string }>, rowCount: 0 };
  });

  const inserted = (ins.rowCount ?? ins.rows.length) > 0;
  if (inserted && executor === (query as unknown as PerformanceQueryExecutor)) {
    await publishRealtime("performance.updated", String(input.sourceId)).catch(() => undefined);
  }
  return inserted;
}

export async function syncOperationalPerformanceEvents(
  options?: {
    from?: string;
    to?: string;
    actorId?: string | null;
  },
  executor: PerformanceQueryExecutor = query as unknown as PerformanceQueryExecutor,
): Promise<{
  synced: number;
  attendance: number;
  shiftsCompleted: number;
  tasks: number;
  maintenance: number;
  orders: number;
}> {
  await ensurePerformanceSchema(executor);

  const from = options?.from || "1970-01-01";
  const to = options?.to || "2999-12-31";
  const actorUuid =
    options?.actorId && UUID_REGEX.test(options.actorId) ? options.actorId : null;

  // 1. Verified / Approved Attendance Check-Ins (+1 on-time, +0.5 late)
  const attRes = await executor(
    `INSERT INTO performance_events (staff_id, user_id, source_type, source_id, points, completed_at, verified_by, verification_status, metadata)
     SELECT
       COALESCE(sp.id, ar.staff_id),
       COALESCE(sp.user_id, ar.user_id),
       'attendance_verified',
       ar.id,
       CASE
         WHEN ar.verification_status IN ('late', 'approved_late') OR ar.late_minutes > 15 THEN 0.5
         ELSE 1
       END,
       COALESCE(ar.verified_at, ar.check_in_at, ar.created_at, CURRENT_TIMESTAMP),
       ar.verified_by,
       'verified',
       jsonb_build_object(
         'category', 'Attendance',
         'reason', CASE
           WHEN ar.verification_status IN ('late', 'approved_late') OR ar.late_minutes > 15
             THEN 'Verified shift attendance (late arrival)'
           ELSE 'Verified on-time shift attendance'
         END
       )
     FROM (
       SELECT
         ar_raw.id::text AS id,
         ar_raw.staff_id,
         (NULLIF(to_jsonb(ar_raw)->>'user_id', ''))::uuid AS user_id,
         ar_raw.verified_at,
         ar_raw.check_in_at,
         ar_raw.created_at,
         ar_raw.verified_by,
         ar_raw.verification_status,
         COALESCE((NULLIF(to_jsonb(ar_raw)->>'late_minutes', ''))::numeric, 0) AS late_minutes
       FROM attendance_records ar_raw
     ) ar
     LEFT JOIN staff_profiles sp ON sp.id = ar.staff_id OR sp.user_id = ar.staff_id
     WHERE ar.verification_status IN ('verified', 'approved', 'approved_late', 'late')
       AND (timezone('Africa/Accra', COALESCE(ar.verified_at, ar.check_in_at, ar.created_at)))::date BETWEEN $1::date AND $2::date
       AND NOT EXISTS (
         SELECT 1 FROM performance_events pe
         WHERE pe.source_id = ar.id AND pe.source_type = 'attendance_verified'
       )`,
    [from, to],
  ).catch(() => ({ rows: [], rowCount: 0 }));

  // 2. Completed Shift Check-Outs (+1 full shift, +0.5 early departure)
  const shiftOutRes = await executor(
    `INSERT INTO performance_events (staff_id, user_id, source_type, source_id, points, completed_at, verified_by, verification_status, metadata)
     SELECT
       COALESCE(sp.id, ar.staff_id),
       COALESCE(sp.user_id, (NULLIF(to_jsonb(ar)->>'user_id', ''))::uuid),
       'shift_checkout_completed',
       ar.id::text,
       CASE WHEN COALESCE((NULLIF(to_jsonb(ar)->>'early_checkout_minutes', ''))::numeric, 0) > 15 THEN 0.5 ELSE 1 END,
       COALESCE(ar.check_out_at, (NULLIF(to_jsonb(ar)->>'updated_at', ''))::timestamptz, CURRENT_TIMESTAMP),
       ar.verified_by,
       'verified',
       jsonb_build_object(
         'category', 'Shift Completion',
         'reason', CASE
           WHEN COALESCE((NULLIF(to_jsonb(ar)->>'early_checkout_minutes', ''))::numeric, 0) > 15
             THEN 'Shift check-out recorded (early departure)'
           ELSE 'Completed full scheduled work shift'
         END
       )
     FROM attendance_records ar
     LEFT JOIN staff_profiles sp ON sp.id = ar.staff_id OR sp.user_id = ar.staff_id
     WHERE ar.check_in_at IS NOT NULL
       AND ar.check_out_at IS NOT NULL
       AND COALESCE(ar.verification_status, 'pending') <> 'rejected'
       AND COALESCE(to_jsonb(ar)->>'status', '') <> 'auto_checked_out'
       AND (timezone('Africa/Accra', ar.check_out_at))::date BETWEEN $1::date AND $2::date
       AND NOT EXISTS (
         SELECT 1 FROM performance_events pe
         WHERE pe.source_id::text = ar.id::text AND pe.source_type = 'shift_checkout_completed'
       )`,
    [from, to],
  ).catch(() => ({ rows: [], rowCount: 0 }));

  // 3. Housekeeping Completed Tasks (+2 points; resolves users.id -> staff_profiles.id cleanly)
  const tasksRes = await executor(
    `INSERT INTO performance_events (staff_id, user_id, source_type, source_id, points, completed_at, verified_by, verification_status, metadata)
     SELECT
       COALESCE(sp.id, ht.assigned_to),
       COALESCE(sp.user_id, u.id),
       'housekeeping_task_completed',
       ht.id::text,
       2,
       COALESCE(ht.completed_at, (NULLIF(to_jsonb(ht)->>'updated_at', ''))::timestamptz, CURRENT_TIMESTAMP),
       $3::uuid,
       'verified',
       jsonb_build_object('category', 'Housekeeping', 'reason', 'Completed room housekeeping task')
     FROM housekeeping_tasks ht
     LEFT JOIN staff_profiles sp ON sp.id = ht.assigned_to OR sp.user_id = ht.assigned_to
     LEFT JOIN users u ON u.id = ht.assigned_to
     WHERE ht.status IN ('completed', 'done')
       AND ht.assigned_to IS NOT NULL
       AND (timezone('Africa/Accra', COALESCE(ht.completed_at, (NULLIF(to_jsonb(ht)->>'updated_at', ''))::timestamptz, CURRENT_TIMESTAMP)))::date BETWEEN $1::date AND $2::date
       AND NOT EXISTS (
         SELECT 1 FROM performance_events pe
         WHERE pe.source_id::text = ht.id::text AND pe.source_type = 'housekeeping_task_completed'
       )`,
    [from, to, actorUuid],
  ).catch(() => ({ rows: [], rowCount: 0 }));

  // 4. Maintenance Resolved Tickets (+2 points)
  const maintRes = await executor(
    `INSERT INTO performance_events (staff_id, user_id, source_type, source_id, points, completed_at, verified_by, verification_status, metadata)
     SELECT
       COALESCE(sp.id, mt.assigned_to),
       COALESCE(sp.user_id, u.id),
       'maintenance_ticket_resolved',
       mt.id::text,
       2,
       COALESCE(
         (NULLIF(to_jsonb(mt)->>'completed_at', ''))::timestamptz,
         (NULLIF(to_jsonb(mt)->>'resolved_at', ''))::timestamptz,
         (NULLIF(to_jsonb(mt)->>'updated_at', ''))::timestamptz,
         CURRENT_TIMESTAMP
       ),
       $3::uuid,
       'verified',
       jsonb_build_object(
         'category', 'Maintenance',
         'reason', CONCAT('Resolved maintenance ticket ', COALESCE(to_jsonb(mt)->>'ticket_number', mt.id::text))
       )
     FROM maintenance_tickets mt
     LEFT JOIN staff_profiles sp ON sp.id = mt.assigned_to OR sp.user_id = mt.assigned_to
     LEFT JOIN users u ON u.id = mt.assigned_to
     WHERE mt.status IN ('resolved', 'completed', 'closed')
       AND mt.assigned_to IS NOT NULL
       AND (timezone('Africa/Accra', COALESCE(
         (NULLIF(to_jsonb(mt)->>'completed_at', ''))::timestamptz,
         (NULLIF(to_jsonb(mt)->>'resolved_at', ''))::timestamptz,
         (NULLIF(to_jsonb(mt)->>'updated_at', ''))::timestamptz,
         CURRENT_TIMESTAMP
       )))::date BETWEEN $1::date AND $2::date
       AND NOT EXISTS (
         SELECT 1 FROM performance_events pe
         WHERE pe.source_id::text = mt.id::text AND pe.source_type = 'maintenance_ticket_resolved'
       )`,
    [from, to, actorUuid],
  ).catch(() => ({ rows: [], rowCount: 0 }));

  // 5a. Restaurant POS / Waiter / Cashier Completed Guest Orders from kitchenorders (+1 point)
  const kitchenOrdersRes = await executor(
    `INSERT INTO performance_events (staff_id, user_id, source_type, source_id, points, completed_at, verified_by, verification_status, metadata)
     SELECT
       COALESCE(sp.id, ko.performed_by),
       COALESCE(sp.user_id, u.id),
       'pos_order_completed',
       ko.id::text,
       1,
       COALESCE(
         (NULLIF(to_jsonb(ko)->>'created_at', ''))::timestamptz,
         (NULLIF(to_jsonb(ko)->>'createdat', ''))::timestamptz,
         CURRENT_TIMESTAMP
       ),
       $3::uuid,
       'verified',
       jsonb_build_object(
         'category', 'Guest Service (POS)',
         'reason', CONCAT('Processed guest order #', COALESCE(to_jsonb(ko)->>'ordernumber', ko.id::text))
       )
     FROM kitchenorders ko
     LEFT JOIN staff_profiles sp ON sp.id = ko.performed_by OR sp.user_id = ko.performed_by
     LEFT JOIN users u ON u.id = ko.performed_by
     WHERE ko.performed_by IS NOT NULL
       AND COALESCE(u.role::text, 'staff') <> 'admin'
       AND LOWER(COALESCE(ko.status, '')) NOT IN ('cancelled', 'void', 'refunded')
       AND (timezone('Africa/Accra', COALESCE(
         (NULLIF(to_jsonb(ko)->>'created_at', ''))::timestamptz,
         (NULLIF(to_jsonb(ko)->>'createdat', ''))::timestamptz,
         CURRENT_TIMESTAMP
       )))::date BETWEEN $1::date AND $2::date
       AND NOT EXISTS (
         SELECT 1 FROM performance_events pe
         WHERE pe.source_id::text = ko.id::text AND pe.source_type = 'pos_order_completed'
       )`,
    [from, to, actorUuid],
  ).catch(() => ({ rows: [], rowCount: 0 }));

  // 5b. Canonical orders table fallback (+1 point when created_by is recorded on orders)
  const canonicalOrdersRes = await executor(
    `INSERT INTO performance_events (staff_id, user_id, source_type, source_id, points, completed_at, verified_by, verification_status, metadata)
     SELECT
       COALESCE(sp.id, o.created_by),
       COALESCE(sp.user_id, u.id),
       'pos_order_completed',
       o.id::text,
       1,
       COALESCE(o.created_at, CURRENT_TIMESTAMP),
       $3::uuid,
       'verified',
       jsonb_build_object(
         'category', 'Guest Service (POS)',
         'reason', CONCAT('Processed guest order #', COALESCE(to_jsonb(o)->>'order_number', o.id::text))
       )
     FROM orders o
     LEFT JOIN staff_profiles sp ON sp.id = o.created_by OR sp.user_id = o.created_by
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.created_by IS NOT NULL
       AND COALESCE(u.role::text, 'staff') <> 'admin'
       AND LOWER(COALESCE(o.status, '')) IN ('completed', 'served', 'paid')
       AND (timezone('Africa/Accra', COALESCE(o.created_at, CURRENT_TIMESTAMP)))::date BETWEEN $1::date AND $2::date
       AND NOT EXISTS (
         SELECT 1 FROM performance_events pe
         WHERE pe.source_id::text = o.id::text AND pe.source_type = 'pos_order_completed'
       )`,
    [from, to, actorUuid],
  ).catch(() => ({ rows: [], rowCount: 0 }));

  const attendance = attRes.rowCount ?? 0;
  const shiftsCompleted = shiftOutRes.rowCount ?? 0;
  const tasks = tasksRes.rowCount ?? 0;
  const maintenance = maintRes.rowCount ?? 0;
  const orders = (kitchenOrdersRes.rowCount ?? 0) + (canonicalOrdersRes.rowCount ?? 0);

  return {
    synced: attendance + shiftsCompleted + tasks + maintenance + orders,
    attendance,
    shiftsCompleted,
    tasks,
    maintenance,
    orders,
  };
}
