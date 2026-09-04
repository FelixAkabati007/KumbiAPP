import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requireFinanceAccess } from "@/lib/api-auth";

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
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const category = typeof body?.category === "string" ? body.category : "";
  const department = typeof body?.department === "string" ? body.department.trim() : "";
  const amount = Number(body?.amount);
  const expenseDate = typeof body?.expenseDate === "string" ? body.expenseDate : "";
  if (!title || title.length > 160 || !categories.includes(category) || !department || department.length > 80 || !Number.isFinite(amount) || amount <= 0 || !expenseDate) return NextResponse.json({ error: "Enter a valid title, category, department, amount, and date" }, { status: 400 });
  const result = await transaction(async (client) => {
    const inserted = await client.query(`INSERT INTO public.expenses (title, category, department, vendor, description, amount, currency, expense_date, payment_method, status, requested_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted',$10) RETURNING *`, [title, category, department, String(body?.vendor || "").slice(0, 160) || null, String(body?.description || "").slice(0, 10000) || null, amount, String(body?.currency || "GHS").slice(0, 3).toUpperCase(), expenseDate, String(body?.paymentMethod || "").slice(0, 40) || null, auth.session.id]);
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
    const updated = await client.query(`UPDATE public.expenses SET status=$2, approved_by=CASE WHEN $2 IN ('approved','rejected') THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2 IN ('approved','rejected') THEN now() ELSE approved_at END, paid_by=CASE WHEN $2='paid' THEN $3 ELSE paid_by END, paid_at=CASE WHEN $2='paid' THEN now() ELSE paid_at END, rejection_reason=CASE WHEN $2='rejected' THEN $4 ELSE rejection_reason END, updated_at=now() WHERE id=$1 AND status NOT IN ('paid','rejected','cancelled') RETURNING *`, [id, status, auth.session.id, String(body?.note || "").slice(0, 1000) || null]);
    if (!updated.rowCount) return null;
    await client.query(`INSERT INTO public.expense_approvals (expense_id, action, actor_id, note) VALUES ($1,$2,$3,$4)`, [id, status, auth.session.id, String(body?.note || "").slice(0, 1000) || null]);
    return updated.rows[0];
  });
  if (!result) return NextResponse.json({ error: "Expense is no longer actionable" }, { status: 409 });
  return NextResponse.json({ expense: result });
}
