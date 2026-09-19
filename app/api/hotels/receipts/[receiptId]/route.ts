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
      version: number; snapshot: { guestName?: string; roomNumber?: string; performedBy?: { name?: string | null; email?: string; role?: string }; bookedBy?: { name?: string | null; email?: string; role?: string }; checkedInBy?: { name?: string | null; email?: string; role?: string }; checkedOutBy?: { name?: string | null; email?: string; role?: string }; items?: Array<{ description: string; quantity: number; total_amount: number }>; total?: number };
      created_at: string;
    };
    const profileResult = await query(`SELECT restaurant_name, email, phone, address, logo FROM restaurant_profile WHERE id = 1`);
    const profile = profileResult.rows[0] || {};
    const hotel = { name: profile.restaurant_name || "Hotel", email: profile.email || "", phone: profile.phone || "", address: profile.address || "", logo: profile.logo || "" };
    const snapshot = receipt.snapshot || {};
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const itemRows = items.map((item) => `<tr><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.quantity)}</td><td>GHS ${Number(item.total_amount || 0).toFixed(2)}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Hotel Receipt ${escapeHtml(receipt.order_number)}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:32px auto;color:#202020}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:10px 4px}td:last-child,th:last-child{text-align:right}.meta{line-height:1.7}.total{text-align:right;font-size:18px;font-weight:700;margin-top:20px}</style></head><body>${hotel.logo ? `<img src="${escapeHtml(hotel.logo)}" alt="${escapeHtml(hotel.name)} logo" style="max-width:220px;max-height:90px;object-fit:contain">` : ""}<h1>${escapeHtml(hotel.name)}</h1><div class="meta">${escapeHtml(hotel.address)}<br>${escapeHtml(hotel.phone)}<br>${escapeHtml(hotel.email)}<br><strong>Hotel Receipt</strong><br>Order number: ${escapeHtml(receipt.order_number)}<br>Order ID: ${escapeHtml(receipt.order_id)}<br>Guest: ${escapeHtml(snapshot.guestName)}<br>Room: ${escapeHtml(snapshot.roomNumber)}<br>Booked by: ${escapeHtml(snapshot.bookedBy?.name || snapshot.bookedBy?.email || "—")}${snapshot.bookedBy?.role ? ` (${escapeHtml(snapshot.bookedBy.role)})` : ""}<br>Checked in by: ${escapeHtml(snapshot.checkedInBy?.name || snapshot.checkedInBy?.email || "—")}<br>Checked out by: ${escapeHtml(snapshot.checkedOutBy?.name || snapshot.checkedOutBy?.email || "—")}<br>Receipt version: ${escapeHtml(receipt.version)}<br>Date: ${escapeHtml(new Date(receipt.created_at).toLocaleString())}</div><table><thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table><div class="total">Total: GHS ${Number(snapshot.total || 0).toFixed(2)}</div><p>Keep this receipt for your hotel records.</p></body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="hotel-receipt-${receipt.order_number}.html"` } });
  } catch (error) {
    console.error("Error downloading hotel receipt:", error);
    return NextResponse.json({ error: "Failed to download receipt" }, { status: 500 });
  }
}
