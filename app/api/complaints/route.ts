import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, transaction } from "@/lib/db";

const departments = ["restaurant", "hotel", "finance", "corporate"] as const;
const subjects = ["service", "conduct", "safety", "payroll", "operations", "other"] as const;
const priorities = ["low", "normal", "high", "urgent"] as const;

type Department = (typeof departments)[number];

async function recipientsFor(department: Department, role: string) {
  if (role === "manager") return query<{ id: string }>(`SELECT id FROM users WHERE role = 'admin' AND is_active IS DISTINCT FROM false`, []);
  if (department === "finance") return query<{ id: string }>(`SELECT id FROM users WHERE role IN ('manager','admin') AND is_active IS DISTINCT FROM false`, []);
  return query<{ id: string }>(`SELECT id FROM users WHERE role IN ('manager','admin') AND is_active IS DISTINCT FROM false`, []);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await query(
    `SELECT c.*, u.name AS submitter_name, a.name AS assignee_name, a.role AS assignee_role,
      COALESCE((SELECT json_agg(m ORDER BY m.created_at) FROM complaint_messages m WHERE m.complaint_id = c.id), '[]') AS messages
     FROM complaints c
     LEFT JOIN users u ON u.id = c.submitted_by
     LEFT JOIN users a ON a.id = c.assigned_to
     WHERE c.submitted_by = $1 OR c.assigned_to = $1 OR $2 IN ('manager','admin')
     ORDER BY c.created_at DESC LIMIT 100`,
    [session.id, session.role],
  );
  return NextResponse.json({ complaints: result.rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const department = typeof body?.department === "string" ? body.department : "";
  const subjectType = typeof body?.subjectType === "string" ? body.subjectType : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const priority = typeof body?.priority === "string" ? body.priority : "normal";
  if (!departments.includes(department as Department) || !subjects.includes(subjectType as never) || !priorities.includes(priority as never) || !title || !description || title.length > 160 || description.length > 10000) {
    return NextResponse.json({ error: "Invalid complaint details" }, { status: 400 });
  }
  const recipients = await recipientsFor(department as Department, session.role);
  if (recipients.rows.length === 0) return NextResponse.json({ error: "No escalation authority is configured" }, { status: 409 });
  const result = await transaction(async (client) => {
    const complaint = await client.query(
      `INSERT INTO complaints (submitted_by, department, subject_type, title, description, priority, confidentiality, subject_user_id, reservation_id, order_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [session.id, department, subjectType, title, description, priority, body?.confidentiality === "confidential" ? "confidential" : "standard", body?.subjectUserId || null, body?.reservationId || null, body?.orderId || null],
    );
    for (const recipient of recipients.rows) {
      await client.query(`INSERT INTO notifications (recipient_user_id, title, message, type) VALUES ($1,$2,$3,$4)`, [recipient.id, `New ${department} complaint`, title, "complaint"]);
    }
    return complaint.rows[0];
  });
  return NextResponse.json({ complaint: result }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: string; status?: string; message?: string; internal?: boolean } | null;
  if (!body?.id) return NextResponse.json({ error: "Complaint id is required" }, { status: 400 });
  const allowed = ["acknowledged", "investigating", "awaiting_response", "resolved", "escalated", "closed", "reopened"];
  const result = await transaction(async (client) => {
    const access = await client.query(`SELECT * FROM complaints WHERE id = $1 AND (submitted_by = $2 OR assigned_to = $2 OR $3 IN ('manager','admin'))`, [body.id, session.id, session.role]);
    if (!access.rows[0]) return null;
    const complaint = access.rows[0];
    if (body.message?.trim()) {
      await client.query(`INSERT INTO complaint_messages (complaint_id, author_id, message, is_internal) VALUES ($1,$2,$3,$4)`, [body.id, session.id, body.message.trim().slice(0, 10000), !!body.internal && ["manager", "admin"].includes(session.role)]);
    }
    const nextStatus = body.status && allowed.includes(body.status) ? body.status : complaint.status;
    const updated = await client.query(`UPDATE complaints SET status = $1, acknowledged_at = CASE WHEN $1 = 'acknowledged' AND acknowledged_at IS NULL THEN NOW() ELSE acknowledged_at END, resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END, closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE closed_at END, assigned_to = COALESCE(assigned_to, CASE WHEN $2 IN ('manager','admin') THEN $3 ELSE NULL END) WHERE id = $4 RETURNING *`, [nextStatus, session.role, session.id, body.id]);
    const notify = await client.query(`SELECT DISTINCT recipient_id FROM (SELECT submitted_by AS recipient_id FROM complaints WHERE id = $1 UNION SELECT assigned_to FROM complaints WHERE id = $1 AND assigned_to IS NOT NULL) x WHERE recipient_id <> $2`, [body.id, session.id]);
    for (const recipient of notify.rows) await client.query(`INSERT INTO notifications (recipient_user_id, title, message, type) VALUES ($1,$2,$3,'complaint')`, [recipient.recipient_id, `Complaint ${nextStatus.replaceAll("_", " ")}`, body.message?.trim() || complaint.title]);
    return updated.rows[0];
  });
  if (!result) return NextResponse.json({ error: "Complaint not found or inaccessible" }, { status: 404 });
  return NextResponse.json({ complaint: result });
}
