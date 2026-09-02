import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

export async function GET(_request: Request, context: { params: Promise<{ receiptId: string }> }) {
  const { error } = await requirePermission("checkIn");
  if (error) return error;
  const { receiptId } = await context.params;

  try {
    const result = await query(
      `SELECT id, order_id, order_number, receipt_type, version, snapshot, created_at
       FROM hotel_receipts WHERE id = $1`,
      [receiptId]
    );
    if (!result.rows[0]) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

    const receipt = result.rows[0] as {
      id: string; order_id: string; order_number: string; receipt_type: string;
      version: number; snapshot: { guestName?: string; roomNumber?: string; items?: Array<{ description: string; quantity: number; total_amount: number }>; total?: number };
      created_at: string;
    };
    const snapshot = receipt.snapshot || {};
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const itemRows = items.map((item) => `<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.quantity)}</td><td>GHS ${Number(item.total_amount || 0).toFixed(2)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Hotel Receipt ${escapeHtml(receipt.order_number)}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:32px auto;color:#202020}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:10px 4px}td:last-child,th:last-child{text-align:right}.meta{line-height:1.7}.total{text-align:right;font-size:18px;font-weight:700;margin-top:20px}</style></head><body><h1>Kumbisaly Heritage Hotel</h1><div class="meta"><strong>Hotel Receipt</strong><br>Order number: ${escapeHtml(receipt.order_number)}<br>Order ID: ${escapeHtml(receipt.order_id)}<br>Guest: ${escapeHtml(snapshot.guestName)}<br>Room: ${escapeHtml(snapshot.roomNumber)}<br>Receipt version: ${escapeHtml(receipt.version)}<br>Date: ${escapeHtml(new Date(receipt.created_at).toLocaleString())}</div><table><thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table><div class="total">Total: GHS ${Number(snapshot.total || 0).toFixed(2)}</div><p>Keep this receipt for your hotel records.</p></body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="hotel-receipt-${receipt.order_number}.html"` } });
  } catch (error) {
    console.error("Error downloading hotel receipt:", error);
    return NextResponse.json({ error: "Failed to download receipt" }, { status: 500 });
  }
}
