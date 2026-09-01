import { NextResponse } from "next/server"
import { z } from "zod"
import { query } from "@/lib/db"
import { requireRole } from "@/lib/api-auth"

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

export async function GET() {
  const auth = await requireRole("admin", "manager", "finance")
  if (auth.error) return auth.error
  try {
    const [profiles, records] = await Promise.all([
      query(`SELECT cp.*, sp.first_name, sp.last_name, sp.position FROM compensation_profiles cp JOIN staff_profiles sp ON sp.id = cp.staff_profile_id WHERE cp.is_active = true ORDER BY sp.last_name, sp.first_name`),
      query(`SELECT pr.*, sp.first_name, sp.last_name FROM payroll_records pr JOIN staff_profiles sp ON sp.id = pr.staff_profile_id ORDER BY pr.pay_period_end DESC, sp.last_name LIMIT 200`),
    ])
    return NextResponse.json({ profiles: profiles.rows, records: records.rows })
  } catch (error) {
    console.error("[v0] Failed to read payroll:", error)
    return NextResponse.json({ error: "Failed to load payroll" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireRole("admin", "manager", "finance")
  if (auth.error) return auth.error
  const body = await request.json().catch(() => null)
  const mode = body?.mode === "profile" ? "profile" : "record"
  const parsed = mode === "profile" ? profileSchema.safeParse(body) : recordSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid payroll data", issues: parsed.error.flatten() }, { status: 400 })
  try {
    if (mode === "profile") {
      const data = parsed.data as z.infer<typeof profileSchema>
      const result = await query(`WITH deactivated AS (UPDATE compensation_profiles SET is_active = false, updated_at = now() WHERE staff_profile_id = $1 AND is_active = true) INSERT INTO compensation_profiles (staff_profile_id, pay_frequency, base_amount, allowances, default_deductions, effective_from, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [data.staffProfileId, data.payFrequency, data.baseAmount, data.allowances, data.defaultDeductions, data.effectiveFrom, auth.session.id])
      return NextResponse.json(result.rows.at(-1), { status: 201 })
    }
    const data = parsed.data as z.infer<typeof recordSchema>
    if (new Date(data.payPeriodEnd) < new Date(data.payPeriodStart)) return NextResponse.json({ error: "Pay period end must be on or after start" }, { status: 400 })
    const result = await query(`INSERT INTO payroll_records (compensation_profile_id, staff_profile_id, pay_period_start, pay_period_end, gross_amount, deductions, net_amount, idempotency_key, created_by) VALUES ($1,$2,$3,$4,$5,$6,$5-$6,$7,$8) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, [data.compensationProfileId ?? null, data.staffProfileId, data.payPeriodStart, data.payPeriodEnd, data.grossAmount, data.deductions, data.idempotencyKey, auth.session.id])
    if (!result.rows[0]) return NextResponse.json({ error: "Payroll record already exists" }, { status: 409 })
    return NextResponse.json(result.rows[0], { status: 201 })
  } catch (error) {
    console.error("[v0] Failed to write payroll:", error)
    return NextResponse.json({ error: "Failed to save payroll" }, { status: 500 })
  }
}
