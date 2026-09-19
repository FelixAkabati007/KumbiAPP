import { NextResponse } from "next/server"
import { z } from "zod"
import { query, transaction } from "@/lib/db"
import { requireFinanceAccess } from "@/lib/api-auth"

const profileSchema = z.object({
  staffProfileId: z.string().uuid(),
  payFrequency: z.enum(["weekly", "biweekly", "monthly"]),
  baseAmount: z.number().finite().nonnegative(),
  allowances: z.number().finite().nonnegative().default(0),
  defaultDeductions: z.number().finite().nonnegative().default(0),
  effectiveFrom: z.string().date(),
})

const recordSchema = z.object({
  staffProfileId: z.string().uuid(),
  compensationProfileId: z.string().uuid().optional(),
  payPeriodStart: z.string().date(),
  payPeriodEnd: z.string().date(),
  grossAmount: z.number().finite().nonnegative(),
  deductions: z.number().finite().nonnegative().default(0),
  idempotencyKey: z.string().trim().min(8).max(255),
})

const generateSchema = z.object({
  mode: z.literal("generate"),
  payPeriodStart: z.string().date(),
  payPeriodEnd: z.string().date(),
})

const statusSchema = z.object({
  mode: z.literal("status"),
  id: z.string().uuid(),
  status: z.enum(["draft", "submitted", "approved", "processed", "paid", "rejected"]),
})

export async function GET() {
  const auth = await requireFinanceAccess()
  if (auth.error) return auth.error
  try {
    const [profiles, records, runs, staff] = await Promise.all([
      query(`SELECT cp.*, sp.first_name, sp.last_name, sp.position FROM compensation_profiles cp JOIN staff_profiles sp ON sp.id = cp.staff_profile_id WHERE cp.is_active = true ORDER BY sp.last_name, sp.first_name`),
      query(`SELECT pr.*, sp.first_name, sp.last_name, COALESCE(jsonb_agg(pd ORDER BY pd.deduction_type) FILTER (WHERE pd.id IS NOT NULL), '[]'::jsonb) AS deduction_lines FROM payroll_records pr JOIN staff_profiles sp ON sp.id = pr.staff_profile_id LEFT JOIN payroll_deductions pd ON pd.payroll_record_id = pr.id GROUP BY pr.id, sp.first_name, sp.last_name ORDER BY pr.pay_period_end DESC, sp.last_name LIMIT 200`),
      query(`SELECT * FROM payroll_runs ORDER BY pay_period_end DESC LIMIT 50`),
      query(`SELECT id, first_name, last_name, position FROM staff_profiles WHERE is_active = true ORDER BY last_name, first_name`),
    ])
    return NextResponse.json({ profiles: profiles.rows, records: records.rows, runs: runs.rows, staff: staff.rows })
  } catch (error) {
    console.error("[v0] Failed to read payroll:", error)
    return NextResponse.json({ error: "Failed to load payroll" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireFinanceAccess()
  if (auth.error) return auth.error
  const body = await request.json().catch(() => null)
  const mode = body?.mode === "profile" || body?.mode === "generate" || body?.mode === "status" ? body.mode : "record"
  const parsed = mode === "profile" ? profileSchema.safeParse(body) : mode === "generate" ? generateSchema.safeParse(body) : mode === "status" ? statusSchema.safeParse(body) : recordSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid payroll data", issues: parsed.error.flatten() }, { status: 400 })
  try {
    if (mode === "generate") {
      const data = parsed.data as z.infer<typeof generateSchema>
      if (new Date(data.payPeriodEnd) < new Date(data.payPeriodStart)) return NextResponse.json({ error: "Pay period end must be on or after start" }, { status: 400 })
      const result = await transaction(async (client) => {
        const runResult = await client.query(`INSERT INTO payroll_runs (pay_period_start, pay_period_end, status, created_by) VALUES ($1, $2, 'draft', $3) ON CONFLICT (pay_period_start, pay_period_end) DO UPDATE SET updated_at = now() RETURNING *`, [data.payPeriodStart, data.payPeriodEnd, auth.session.id])
        const run = runResult.rows[0]
        const recordsResult = await client.query(`INSERT INTO payroll_records (run_id, compensation_profile_id, staff_profile_id, pay_period_start, pay_period_end, gross_amount, deductions, net_amount, currency, compensation_snapshot, idempotency_key, created_by) SELECT $3, cp.id, cp.staff_profile_id, $1, $2, cp.base_amount + cp.allowances, cp.default_deductions, GREATEST(cp.base_amount + cp.allowances - cp.default_deductions, 0), 'GHS', jsonb_build_object('baseAmount', cp.base_amount, 'allowances', cp.allowances, 'defaultDeductions', cp.default_deductions, 'effectiveFrom', cp.effective_from), CONCAT('period:', cp.staff_profile_id, ':', $1, ':', $2), $4 FROM compensation_profiles cp JOIN staff_profiles sp ON sp.id = cp.staff_profile_id WHERE cp.is_active = true AND sp.is_active = true AND cp.effective_from <= $2 ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, [data.payPeriodStart, data.payPeriodEnd, run.id, auth.session.id])
        for (const record of recordsResult.rows) {
          if (Number(record.deductions) > 0) await client.query(`INSERT INTO payroll_deductions (payroll_record_id, deduction_type, amount) VALUES ($1, 'default', $2) ON CONFLICT (payroll_record_id, deduction_type) DO NOTHING`, [record.id, record.deductions])
        }
        await client.query(`UPDATE payroll_runs SET total_gross = COALESCE((SELECT SUM(gross_amount) FROM payroll_records WHERE run_id = $1), 0), total_deductions = COALESCE((SELECT SUM(deductions) FROM payroll_records WHERE run_id = $1), 0), total_net = COALESCE((SELECT SUM(net_amount) FROM payroll_records WHERE run_id = $1), 0), updated_at = now() WHERE id = $1`, [run.id])
        return { run, records: recordsResult.rows }
      })
      return NextResponse.json({ created: result.records.length, run: result.run, records: result.records }, { status: 201 })
    }
    if (mode === "status") {
      const data = parsed.data as z.infer<typeof statusSchema>
      const result = await transaction(async (client) => {
        const currentResult = await client.query(`SELECT pr.id, pr.status, pr.created_by, pr.gross_amount, pr.deductions, pr.net_amount, pr.pay_period_end, pr.staff_profile_id, pr.run_id FROM payroll_records pr WHERE pr.id = $1 FOR UPDATE`, [data.id])
        const current = currentResult.rows[0]
        if (!current) return { kind: "missing" as const }
        const transitions: Record<string, string[]> = {
          draft: ["submitted"],
          submitted: ["approved", "rejected"],
          approved: ["processed"],
          processed: ["paid"],
          rejected: ["submitted"],
          paid: [],
        }
        if (!transitions[current.status]?.includes(data.status)) return { kind: "invalid" as const, from: current.status, to: data.status }
        if ((data.status === "approved" || data.status === "paid") && current.created_by === auth.session.id) return { kind: "self_action" as const }
        const updated = await client.query(`UPDATE payroll_records SET status = $1, paid_at = CASE WHEN $1 = 'paid' THEN now() ELSE paid_at END, updated_at = now() WHERE id = $2 RETURNING *`, [data.status, data.id])
        if (current.run_id) await client.query(`UPDATE payroll_runs SET status = $1, approved_by = CASE WHEN $1 = 'approved' THEN $2 ELSE approved_by END, processed_by = CASE WHEN $1 = 'processed' THEN $2 ELSE processed_by END, paid_by = CASE WHEN $1 = 'paid' THEN $2 ELSE paid_by END, updated_at = now() WHERE id = $3`, [data.status, auth.session.id, current.run_id])
        if (data.status === "paid") {
          await client.query(`INSERT INTO transaction_logs (transaction_id, amount, currency, status, payment_method, customer_id, items, metadata) VALUES ($1, $2, 'GHS', 'paid', 'payroll', $3, $4::jsonb, $5::jsonb) ON CONFLICT DO NOTHING`, [data.id, current.net_amount, current.staff_profile_id, JSON.stringify([{ description: "Payroll net payment", amount: Number(current.net_amount) }]), JSON.stringify({ source: "payroll", payrollRecordId: data.id, grossAmount: current.gross_amount, deductions: current.deductions, payPeriodEnd: current.pay_period_end, paidBy: auth.session.id })])
        }
        return updated.rows[0]
      })
      if (!result || ("kind" in result && result.kind === "missing")) return NextResponse.json({ error: "Payroll record not found" }, { status: 404 })
      if ("kind" in result && result.kind === "invalid") return NextResponse.json({ error: `Invalid payroll transition from ${result.from} to ${result.to}` }, { status: 409 })
      if ("kind" in result && result.kind === "self_action") return NextResponse.json({ error: "The payroll creator cannot approve or pay the same record" }, { status: 403 })
      return NextResponse.json(result)
    }
    if (mode === "profile") {
      const data = parsed.data as z.infer<typeof profileSchema>
      const result = await query(`WITH deactivated AS (UPDATE compensation_profiles SET is_active = false, updated_at = now() WHERE staff_profile_id = $1 AND is_active = true) INSERT INTO compensation_profiles (staff_profile_id, pay_frequency, base_amount, allowances, default_deductions, effective_from, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [data.staffProfileId, data.payFrequency, data.baseAmount, data.allowances, data.defaultDeductions, data.effectiveFrom, auth.session.id])
      if (auth.actingAuthority) {
        await query(`INSERT INTO audit_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4::jsonb)`, [auth.session.id, "delegated_finance_profile_write", "compensation_profile", JSON.stringify({ delegated: true })])
      }
      return NextResponse.json(result.rows.at(-1), { status: 201 })
    }
    const data = parsed.data as z.infer<typeof recordSchema>
    if (new Date(data.payPeriodEnd) < new Date(data.payPeriodStart)) return NextResponse.json({ error: "Pay period end must be on or after start" }, { status: 400 })
    const result = await query(`INSERT INTO payroll_records (compensation_profile_id, staff_profile_id, pay_period_start, pay_period_end, gross_amount, deductions, net_amount, idempotency_key, created_by) VALUES ($1,$2,$3,$4,$5,$6,$5-$6,$7,$8) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, [data.compensationProfileId ?? null, data.staffProfileId, data.payPeriodStart, data.payPeriodEnd, data.grossAmount, data.deductions, data.idempotencyKey, auth.session.id])
    if (!result.rows[0]) return NextResponse.json({ error: "Payroll record already exists" }, { status: 409 })
    if (auth.actingAuthority) {
      await query(`INSERT INTO audit_logs (user_id, action, entity_type, details) VALUES ($1, $2, $3, $4::jsonb)`, [auth.session.id, "delegated_finance_record_write", "payroll_record", JSON.stringify({ delegated: true })])
    }
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error("[v0] Failed to write payroll:", error)
    return NextResponse.json({ error: "Failed to save payroll" }, { status: 500 })
  }
}
