import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; type: string }> }) {
  const { error } = await requirePermission("events");
  if (error) return error;
  const { id, type } = await params;
  const result = await query(`SELECT e.id, e.name, e.client_name, e.venue, e.starts_at, e.ends_at, e.guest_count, e.status, e.receipt_id, r.order_number, r.snapshot FROM events e LEFT JOIN hotel_receipts r ON r.id = e.receipt_id WHERE e.id = $1`, [id]);
  if (!result.rows[0]) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const event = result.rows[0];
  const labels: Record<string, string> = { confirmation: "Booking confirmation", invoice: "Invoice" };
  const title = labels[type] ?? "Event document";
  const snapshot = event.snapshot ?? {};
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title} - ${event.name}</title><style>body{font-family:Arial;max-width:760px;margin:40px auto;color:#202020}h1{margin-bottom:8px}.meta{line-height:1.8}table{width:100%;margin-top:24px;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #ddd}td:last-child{text-align:right}</style></head><body><h1>${title}</h1><div class="meta"><strong>${event.name}</strong><br>Client: ${event.client_name}<br>Venue: ${event.venue}<br>Date: ${new Date(event.starts_at).toLocaleString()}<br>Guests: ${event.guest_count}<br>Status: ${event.status}<br>Receipt: ${event.order_number ?? "Not generated"}</div><table><tr><td>Subtotal</td><td>GHS ${Number(snapshot.subtotal || 0).toFixed(2)}</td></tr><tr><td>VAT / tax</td><td>GHS ${Number(snapshot.tax || 0).toFixed(2)}</td></tr><tr><td><strong>Total</strong></td><td><strong>GHS ${Number(snapshot.total || 0).toFixed(2)}</strong></td></tr></table><script>window.print()</script></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
