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
  hotel: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    logo?: string;
  };
  bookedBy?: { name?: string | null; role?: string | null };
  checkedInBy?: { name?: string | null };
  checkedOutBy?: { name?: string | null };
  checkedInAt?: string | Date | null;
  checkedOutAt?: string | Date | null;
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
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=420,height=720");
  if (!printWindow) {
    // Popup blockers reject windows opened after an async check-in request. The
    // browser print command itself is not a popup and remains available.
    window.print();
    return;
  }
  const date = receipt.date || new Date();
  const items = (receipt.items.length ? receipt.items : [{ description: "Guest folio charge", quantity: 1, totalAmount: receipt.total }]).map((item) => `<div class="item"><span>${escapeHtml(item.description)}</span><span>${item.quantity}</span><strong>GHS ${item.totalAmount.toFixed(2)}</strong></div>`).join("");
  const markup = `<!doctype html><html><head><title>${escapeHtml(receipt.title)} ${escapeHtml(receipt.orderNumber)}</title><style>
    @page { size: 80mm auto; margin: 4mm; } * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: #fff; font: 12px/1.4 Arial, sans-serif; }
    .receipt { width: 72mm; margin: 0 auto; } .header, .footer { text-align: center; }
    .header h2 { margin: 0 0 4px; font-size: 17px; } .header p, .footer p { margin: 2px 0; } .header img { max-width: 42mm; max-height: 18mm; object-fit: contain; margin-bottom: 4px; }
    .meta p, .item, .total { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
    .meta strong, .item strong { white-space: nowrap; } hr { border: 0; border-top: 1px solid #111; margin: 8px 0; }
    .total { border-top: 1px solid #111; margin-top: 8px; padding-top: 6px; font-size: 14px; font-weight: 700; }
    @media print { body { width: 72mm; } }
  </style></head><body><main class="receipt"><header class="header">${receipt.hotel.logo ? `<img src="${escapeHtml(receipt.hotel.logo)}" alt="${escapeHtml(receipt.hotel.name)} logo">` : ""}<h2>${escapeHtml(receipt.hotel.name)}</h2>${receipt.hotel.address ? `<p>${escapeHtml(receipt.hotel.address)}</p>` : ""}${receipt.hotel.phone ? `<p>${escapeHtml(receipt.hotel.phone)}</p>` : ""}${receipt.hotel.email ? `<p>${escapeHtml(receipt.hotel.email)}</p>` : ""}<p>${escapeHtml(receipt.title)}</p></header><section class="meta"><p><strong>Receipt #:</strong><span>${escapeHtml(receipt.orderNumber)}</span></p><p><strong>Guest:</strong><span>${escapeHtml(receipt.guestName)}</span></p>${receipt.roomNumber ? `<p><strong>Room:</strong><span>${escapeHtml(receipt.roomNumber)}</span></p>` : ""}<p><strong>Date:</strong><span>${date.toLocaleString()}</span></p>${receipt.bookedBy?.name ? `<p><strong>Booked by:</strong><span>${escapeHtml(receipt.bookedBy.name)}${receipt.bookedBy.role ? ` (${escapeHtml(receipt.bookedBy.role)})` : ""}</span></p>` : ""}${receipt.checkedInBy?.name ? `<p><strong>Checked in by:</strong><span>${escapeHtml(receipt.checkedInBy.name)}</span></p>` : ""}${receipt.checkedInAt ? `<p><strong>Checked in:</strong><span>${escapeHtml(new Date(receipt.checkedInAt).toLocaleString())}</span></p>` : ""}${receipt.checkedOutBy?.name ? `<p><strong>Checked out by:</strong><span>${escapeHtml(receipt.checkedOutBy.name)}</span></p>` : ""}${receipt.checkedOutAt ? `<p><strong>Checked out:</strong><span>${escapeHtml(new Date(receipt.checkedOutAt).toLocaleString())}</span></p>` : ""}</section><hr>${items}<div class="total"><span>Total</span><span>GHS ${receipt.total.toFixed(2)}</span></div>${receipt.balance !== undefined ? `<div class="total"><span>Outstanding</span><span>GHS ${receipt.balance.toFixed(2)}</span></div>` : ""}<footer class="footer"><p>${escapeHtml(receipt.footer || "Thank you for choosing Kumbisaly Heritage")}</p></footer></main></body></html>`;
  printWindow.document.open();
  printWindow.document.write(markup);
  printWindow.document.close();
  await new Promise<void>((resolve) => {
    const print = () => {
      printWindow.focus();
      printWindow.print();
      window.setTimeout(() => { if (!printWindow.closed) printWindow.close(); resolve(); }, 1000);
    };
    printWindow.addEventListener("afterprint", () => { printWindow.close(); resolve(); }, { once: true });
    if (printWindow.document.readyState === "complete") {
      window.setTimeout(print, 150);
    } else {
      printWindow.addEventListener("load", () => window.setTimeout(print, 150), { once: true });
    }
  });
}
