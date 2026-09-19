export interface HotelReceiptItem {
  description: string;
  quantity: number;
  totalAmount: number;
}

export interface HotelReceiptData {
  title: string;
  orderNumber: string;
  guestName: string;
  roomNumber?: string;
  accountName: string;
  bookedBy?: { name?: string | null };
  checkedInBy?: { name?: string | null };
  checkedOutBy?: { name?: string | null };
  date?: Date;
  items: HotelReceiptItem[];
  total: number;
  balance?: number;
  footer?: string;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export async function printHotelReceipt(receipt: HotelReceiptData) {
  const printWindow = window.open("", "kumbiapp-receipt-print", "width=420,height=720");
  if (!printWindow) throw new Error("The print dialog was blocked. Allow pop-ups for KumbiAPP and try again.");
  const date = receipt.date || new Date();
  const items = receipt.items.map((item) => `<div class="item"><span>${escapeHtml(item.description)}</span><span>${item.quantity}</span><strong>GHS ${item.totalAmount.toFixed(2)}</strong></div>`).join("");
  printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(receipt.title)} ${escapeHtml(receipt.orderNumber)}</title><style>
    @page { size: 80mm auto; margin: 4mm; } * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: #fff; font: 12px/1.4 Arial, sans-serif; }
    .receipt { width: 72mm; margin: 0 auto; } .header, .footer { text-align: center; }
    .header h2 { margin: 0 0 4px; font-size: 17px; } .header p, .footer p { margin: 2px 0; }
    .meta p, .item, .total { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
    .meta strong, .item strong { white-space: nowrap; } hr { border: 0; border-top: 1px solid #111; margin: 8px 0; }
    .total { border-top: 1px solid #111; margin-top: 8px; padding-top: 6px; font-size: 14px; font-weight: 700; }
    @media print { body { width: 72mm; } }
  </style></head><body><main class="receipt"><header class="header"><h2>Kumbisaly Heritage</h2><p>${escapeHtml(receipt.title)}</p></header><section class="meta"><p><strong>Receipt #:</strong><span>${escapeHtml(receipt.orderNumber)}</span></p><p><strong>Guest:</strong><span>${escapeHtml(receipt.guestName)}</span></p>${receipt.roomNumber ? `<p><strong>Room:</strong><span>${escapeHtml(receipt.roomNumber)}</span></p>` : ""}<p><strong>Date:</strong><span>${date.toLocaleString()}</span></p><p><strong>Account:</strong><span>${escapeHtml(receipt.accountName)}</span></p>${receipt.bookedBy?.name ? `<p><strong>Booked by:</strong><span>${escapeHtml(receipt.bookedBy.name)}</span></p>` : ""}${receipt.checkedInBy?.name ? `<p><strong>Checked in by:</strong><span>${escapeHtml(receipt.checkedInBy.name)}</span></p>` : ""}${receipt.checkedOutBy?.name ? `<p><strong>Checked out by:</strong><span>${escapeHtml(receipt.checkedOutBy.name)}</span></p>` : ""}</section><hr>${items}<div class="total"><span>Total</span><span>GHS ${receipt.total.toFixed(2)}</span></div>${receipt.balance !== undefined ? `<div class="total"><span>Outstanding</span><span>GHS ${receipt.balance.toFixed(2)}</span></div>` : ""}<footer class="footer"><p>${escapeHtml(receipt.footer || "Thank you for choosing Kumbisaly Heritage")}</p></footer></main></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  await new Promise<void>((resolve) => {
    printWindow.addEventListener("afterprint", () => { printWindow.close(); resolve(); }, { once: true });
    window.setTimeout(() => { printWindow.print(); window.setTimeout(() => { if (!printWindow.closed) printWindow.close(); resolve(); }, 1000); }, 150);
  });
}
