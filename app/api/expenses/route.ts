import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/api-auth";
import { z } from "zod";
import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";

const expenseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  category: z.enum(["utilities", "maintenance", "transport", "supplies", "communications", "guest_amenities", "laundry_linen", "security", "food_beverage", "cooking_fuel", "packaging", "pest_control", "marketing", "professional_services", "rent_property", "bank_charges", "taxes_licenses", "staff_welfare", "miscellaneous"]),
  department: z.enum(["hotel", "restaurant", "operations", "administration", "finance"]),
  vendor: z.string().trim().max(160).optional(),
  description: z.string().trim().max(10000).optional(),
  amount: z.coerce.number().positive().finite().max(100000000),
  currency: z.string().trim().toUpperCase().length(3).default("GHS"),
  expenseDate: z.string().date(),
  paymentMethod: z.enum(["cash", "bank_transfer", "mobile_money", "card", "other"]).optional(),
});

const categories = ["utilities", "maintenance", "transport", "supplies", "communications", "guest_amenities", "laundry_linen", "security", "food_beverage", "cooking_fuel", "packaging", "pest_control", "marketing", "professional_services", "rent_property", "bank_charges", "taxes_licenses", "staff_welfare", "miscellaneous"];
const statuses = ["submitted", "approved", "rejected", "paid", "cancelled"];

export async function GET() {
  const auth = await requireFinanceAccess();
  if (auth.error) return auth.error;
  const result = await query(`SELECT e.*, requester.name AS requester_name, approver.name AS approver_name FROM public.expenses e LEFT JOIN public.users requester ON requester.id = e.requested_by LEFT JOIN public.users approver ON approver.id = e.approved_by ORDER BY e.created_at DESC LIMIT 200`);
  return NextResponse.json({ expenses: result.rows, actingAuthority: Boolean(auth.actingAuthority) });
}

export async function POST(request: Request) {
  const auth = await requireFinanceAccess();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Enter valid expense details" }, { status: 400 });
  const { title, category, department, vendor, description, amount, currency, expenseDate, paymentMethod } = parsed.data;
  const result = await transaction(async (client) => {
    const inserted = await client.query(`INSERT INTO public.expenses (title, category, department, vendor, description, amount, currency, expense_date, payment_method, status, requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted',$10) RETURNING *`, [title, category, department, vendor || null, description || null, amount, currency, expenseDate, paymentMethod || null, auth.session.id]);
    await client.query(`INSERT INTO public.expense_approvals (expense_id, action, actor_id, note) VALUES ($1,'submitted',$2,$3)`, [inserted.rows[0].id, auth.session.id, "Expense submitted"]);
    return inserted.rows[0];
  });
  return NextResponse.json({ expense: result }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireFinanceAccess();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  if (!id || !statuses.includes(status) || status === "submitted" || status === "cancelled") return NextResponse.json({ error: "Invalid expense status change" }, { status: 400 });
  const result = await transaction(async (client) => {
    const current = await client.query(`SELECT id, status, requested_by, amount, currency, title, department, payment_method FROM public.expenses WHERE id = $1 FOR UPDATE`, [id]);
    const expense = current.rows[0];
    if (!expense) return { kind: "missing" as const };
    if ((status === "approved" || status === "rejected") && expense.requested_by === auth.session.id) return { kind: "self_approval" as const };
    const updated = await client.query(`UPDATE public.expenses SET status=$2, approved_by=CASE WHEN $2 IN ('approved','rejected') THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2 IN ('approved','rejected') THEN now() ELSE approved_at END, paid_by=CASE WHEN $2='paid' THEN $3 ELSE paid_by END, paid_at=CASE WHEN $2='paid' THEN now() ELSE paid_at END, rejection_reason=CASE WHEN $2='rejected' THEN $4 ELSE rejection_reason END, updated_at=now() WHERE id=$1 AND ((status='submitted' AND $2 IN ('approved','rejected')) OR (status='approved' AND $2='paid')) RETURNING *`, [id, status, auth.session.id, String(body?.note || "").slice(0, 1000) || null]);
    if (!updated.rowCount) return null;
    await client.query(`INSERT INTO public.expense_approvals (expense_id, action, actor_id, note) VALUES ($1,$2,$3,$4)`, [id, status, auth.session.id, String(body?.note || "").slice(0, 1000) || null]);
    if (status === "paid") {
      await recordFinancialLedgerEntry(client, {
        eventKey: `expense-paid-${id}`,
        amount: Number(expense.amount),
        currency: expense.currency,
        direction: "debit",
        status: "paid",
        source: "expense",
        paymentMethod: expense.payment_method,
        entityType: "expense",
        entityId: id,
        metadata: { title: expense.title, category: expense.category, department: expense.department, paidBy: auth.session.id },
      });
      await client.query(`INSERT INTO public.transaction_logs (transaction_id, amount, currency, status, payment_method, customer_id, items, metadata) SELECT $1, amount, currency, 'paid', payment_method, requested_by::text, jsonb_build_array(jsonb_build_object('title', title, 'category', category)), jsonb_build_object('source', 'expense', 'expenseId', id, 'department', department, 'paidBy', $2) FROM public.expenses WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM public.transaction_logs WHERE transaction_id = $1 AND metadata->>'source' = 'expense')`, [id, auth.session.id]);
    }
    return updated.rows[0];
  });
  if (!result || ("kind" in result && result.kind === "missing")) return NextResponse.json({ error: "Expense is no longer actionable" }, { status: 409 });
  if ("kind" in result && result.kind === "self_approval") return NextResponse.json({ error: "The requester cannot approve or reject their own expense" }, { status: 403 });
  return NextResponse.json({ expense: result });
}
