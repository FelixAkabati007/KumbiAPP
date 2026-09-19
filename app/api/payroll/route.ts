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
    const [profiles, records, staff] = await Promise.all([
      query(`SELECT cp.*, sp.first_name, sp.last_name, sp.position FROM compensation_profiles cp JOIN staff_profiles sp ON sp.id = cp.staff_profile_id WHERE cp.is_active = true ORDER BY sp.last_name, sp.first_name`),
      query(`SELECT pr.*, sp.first_name, sp.last_name FROM payroll_records pr JOIN staff_profiles sp ON sp.id = pr.staff_profile_id ORDER BY pr.pay_period_end DESC, sp.last_name LIMIT 200`),
      query(`SELECT id, first_name, last_name, position FROM staff_profiles WHERE is_active = true ORDER BY last_name, first_name`),
    ])
    return NextResponse.json({ profiles: profiles.rows, records: records.rows, staff: staff.rows })
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
      const result = await query(`INSERT INTO payroll_records (compensation_profile_id, staff_profile_id, pay_period_start, pay_period_end, gross_amount, deductions, net_amount, idempotency_key, created_by) SELECT cp.id, cp.staff_profile_id, $1, $2, cp.base_amount + cp.allowances, cp.default_deductions, GREATEST(cp.base_amount + cp.allowances - cp.default_deductions, 0), CONCAT('period:', cp.staff_profile_id, ':', $1, ':', $2), $3 FROM compensation_profiles cp JOIN staff_profiles sp ON sp.id = cp.staff_profile_id WHERE cp.is_active = true AND sp.is_active = true ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, [data.payPeriodStart, data.payPeriodEnd, auth.session.id])
      return NextResponse.json({ created: result.rowCount ?? 0, records: result.rows }, { status: 201 })
    }
    if (mode === "status") {
      const data = parsed.data as z.infer<typeof statusSchema>
      const result = await transaction(async (client) => {
        const currentResult = await client.query(`SELECT id, status, created_by, gross_amount, deductions, net_amount, pay_period_end, staff_profile_id FROM payroll_records WHERE id = $1 FOR UPDATE`, [data.id])
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
        const updated = await client.query(`UPDATE payroll_records SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`, [data.status, data.id])
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
