import type { TaxConfiguration } from "@/lib/settings";
import { calculateTaxes } from "@/lib/tax";
import {
  levyRowsHtml,
  graFiscalHeaderHtml,
  graFiscalFooterHtml,
  STATUTORY_LEVIES_HEADER,
} from "@/lib/levy-presentation";

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
  bookingAccount?: { name?: string | null; email?: string | null; role?: string | null };
  bookedBy?: { name?: string | null; role?: string | null };
  checkedInBy?: { name?: string | null };
  checkedOutBy?: { name?: string | null };
  checkedInAt?: string | Date | null;
  checkedOutAt?: string | Date | null;
  date?: Date;
  items: HotelReceiptItem[];
  subtotal?: number;
  total: number;
  balance?: number;
  footer?: string;
  taxConfig?: Partial<TaxConfiguration>;
  module?: "rooms" | "pos" | "events";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

export async function printHotelReceipt(receipt: HotelReceiptData) {
  const printWindow = window.open("", "kumbiapp-hotel-receipt-print", "width=420,height=720");
  if (!printWindow) {
    // Popup blockers reject windows opened after an async check-in request. The
    // browser print command itself is not a popup and remains available.
    window.print();
    return;
  }
  const date = receipt.date || new Date();
  const items = (receipt.items.length ? receipt.items : [{ description: "Guest folio charge", quantity: 1, totalAmount: receipt.total }]).map((item) => `<div class="item"><span>${escapeHtml(item.description)}</span><span>${item.quantity}</span><strong>GHS ${item.totalAmount.toFixed(2)}</strong></div>`).join("");

  const moduleName = receipt.module || (receipt.title.toLowerCase().includes("event") ? "events" : "rooms");
  const isTaxEnabled =
    Boolean(receipt.taxConfig?.enabled) &&
    (moduleName === "events"
      ? receipt.taxConfig?.appliesToEvents !== false
      : receipt.taxConfig?.appliesToRooms !== false);

  const subtotal = receipt.subtotal != null ? receipt.subtotal : receipt.total;
  const levyResult = isTaxEnabled
    ? calculateTaxes(subtotal, receipt.taxConfig, moduleName)
    : { breakdown: {}, tax: 0, total: receipt.total };

  const isFiscal = isTaxEnabled && receipt.taxConfig?.graEVatEnabled !== false;
  const fiscalHeader = isFiscal
    ? graFiscalHeaderHtml({
        tin: receipt.taxConfig?.tin,
        orderNumber: receipt.orderNumber,
        total: receipt.total,
        date: date.toISOString().slice(0, 10),
      })
    : "";

  const fiscalFooter = isFiscal
    ? graFiscalFooterHtml({
        tin: receipt.taxConfig?.tin,
        orderNumber: receipt.orderNumber,
        total: receipt.total,
        date: date.toISOString().slice(0, 10),
      })
    : "";

  const levyRowsBlock =
    isTaxEnabled && levyResult.tax > 0
      ? `<div class="statutory-levies" style="border-top: 1px dashed #bbb; margin-top: 6px; padding-top: 4px;">
          <div style="font-weight: 600; font-size: 11px; margin-bottom: 3px;">${STATUTORY_LEVIES_HEADER}</div>
          ${levyRowsHtml(levyResult.breakdown, receipt.taxConfig, subtotal, "GHS ")}
         </div>`
      : "";

  const markup = `<!doctype html><html><head><title>${escapeHtml(receipt.title)} ${escapeHtml(receipt.orderNumber)}</title><style>
    @page { size: 80mm auto; margin: 4mm; } * { box-sizing: border-box; }
    body { margin: 0; color: #111; background: #fff; font: 12px/1.4 Arial, sans-serif; }
    .receipt { width: 72mm; margin: 0 auto; } .header, .footer { text-align: center; }
    .header h2 { margin: 0 0 4px; font-size: 17px; } .header p, .footer p { margin: 2px 0; } .header img { max-width: 42mm; max-height: 18mm; object-fit: contain; margin-bottom: 4px; }
    .meta p, .item, .total { display: flex; justify-content: space-between; gap: 8px; margin: 4px 0; }
    .meta strong, .item strong { white-space: nowrap; } hr { border: 0; border-top: 1px solid #111; margin: 8px 0; }
    .total { border-top: 1px solid #111; margin-top: 8px; padding-top: 6px; font-size: 14px; font-weight: 700; }
    @media print { body { width: 72mm; } }
  </style></head><body><main class="receipt"><header class="header">${receipt.hotel.logo ? `<img src="${escapeHtml(receipt.hotel.logo)}" alt="${escapeHtml(receipt.hotel.name)} logo">` : ""}<h2>${escapeHtml(receipt.hotel.name)}</h2>${receipt.hotel.address ? `<p>${escapeHtml(receipt.hotel.address)}</p>` : ""}${receipt.hotel.phone ? `<p>${escapeHtml(receipt.hotel.phone)}</p>` : ""}${receipt.hotel.email ? `<p>${escapeHtml(receipt.hotel.email)}</p>` : ""}<p>${escapeHtml(receipt.title)}</p></header><section class="meta"><p><strong>Receipt #:</strong><span>${escapeHtml(receipt.orderNumber)}</span></p><p><strong>Guest:</strong><span>${escapeHtml(receipt.guestName)}</span></p>${receipt.roomNumber ? `<p><strong>Room:</strong><span>${escapeHtml(receipt.roomNumber)}</span></p>` : ""}<p><strong>Date:</strong><span>${date.toLocaleString()}</span></p>${receipt.bookingAccount?.name || receipt.bookingAccount?.email ? `<p><strong>Booking account:</strong><span>${escapeHtml(receipt.bookingAccount.name || receipt.bookingAccount.email || "—")}${receipt.bookingAccount.role ? ` (${escapeHtml(receipt.bookingAccount.role)})` : ""}</span></p>` : ""}${receipt.bookedBy?.name ? `<p><strong>Booked by:</strong><span>${escapeHtml(receipt.bookedBy.name)}${receipt.bookedBy.role ? ` (${receipt.bookedBy.role})` : ""}</span></p>` : ""}${receipt.checkedInBy?.name ? `<p><strong>Checked in by:</strong><span>${escapeHtml(receipt.checkedInBy.name)}</span></p>` : ""}${receipt.checkedInAt ? `<p><strong>Checked in:</strong><span>${escapeHtml(new Date(receipt.checkedInAt).toLocaleString())}</span></p>` : ""}${receipt.checkedOutBy?.name ? `<p><strong>Checked out by:</strong><span>${escapeHtml(receipt.checkedOutBy.name)}</span></p>` : ""}${receipt.checkedOutAt ? `<p><strong>Checked out:</strong><span>${escapeHtml(new Date(receipt.checkedOutAt).toLocaleString())}</span></p>` : ""}</section>${fiscalHeader}<hr>${items}<div class="totals-section" style="border-top: 1px solid #111; margin-top: 8px; padding-top: 6px;">${isTaxEnabled ? `<div class="item"><span>Taxable Subtotal</span><strong>GHS ${subtotal.toFixed(2)}</strong></div>` : ""}${levyRowsBlock}<div class="total" style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; margin-top: 6px; border-top: ${isTaxEnabled ? "1px solid #111" : "none"}; padding-top: ${isTaxEnabled ? "4px" : "0"};"><span>TOTAL:</span><span>GHS ${receipt.total.toFixed(2)}</span></div>${receipt.balance !== undefined ? `<div class="item" style="color: #c2410c; margin-top: 4px;"><span>Outstanding</span><strong>GHS ${receipt.balance.toFixed(2)}</strong></div>` : ""}</div>${fiscalFooter}<footer class="footer"><p>${escapeHtml(receipt.footer || "Thank you for choosing Kumbisaly Heritage")}</p></footer></main></body></html>`;
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
