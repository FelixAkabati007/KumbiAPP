import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";
import type { SalesData, OrderItem } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RawFolioItem {
  id?: string;
  category?: string;
  description?: string;
  quantity?: number;
  unit_amount?: number;
  total_amount?: number;
  amount?: number;
}

interface RawReceiptItem {
  id?: string;
  name?: string;
  description?: string;
  quantity?: number;
  price?: number;
  originalPrice?: number;
  original_unit_price?: number;
  discountPercent?: number;
  discount_percent?: number;
  unit_amount?: number;
  total?: number;
  total_amount?: number;
  amount?: number;
}

function normalizeItems(items: unknown): OrderItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item: RawReceiptItem | RawFolioItem, index) => {
    const raw = item as Record<string, unknown>;
    const qty = Number(raw.quantity ?? 1) || 1;
    const name = String(raw.name ?? raw.description ?? raw.label ?? `Item ${index + 1}`);
    const totalAmount = Number(raw.total_amount ?? raw.total ?? raw.amount);
    const rawUnitPrice = Number(
      raw.price ?? raw.unit_amount ?? (Number.isFinite(totalAmount) ? totalAmount / qty : 0),
    );
    const pct = Number(raw.discountPercent ?? raw.discount_percent ?? 0);
    const explicitOriginal = Number(raw.originalPrice ?? raw.original_unit_price);
    const hasDistinctOriginal =
      pct > 0 && Number.isFinite(explicitOriginal) && explicitOriginal > 0;

    return {
      id: String(raw.id ?? `item-${index}`),
      name,
      description: name,
      price: hasDistinctOriginal ? explicitOriginal : rawUnitPrice,
      discountPercent: hasDistinctOriginal ? pct : undefined,
      quantity: qty,
      category: "beverages",
      inStock: true,
    };
  });
}

function pushUniqueRecent(
  target: Array<{ id: string; label: string; amount: number; source: string; date: string }>,
  seen: Set<string>,
  entry: { id: string; label: string; amount: number; source: string; date: string },
) {
  const cleanId = String(entry.id || "").trim();
  if (!cleanId) return;
  const dedupKey = `${entry.source}:${cleanId.toUpperCase()}`;
  if (seen.has(dedupKey)) return;
  seen.add(dedupKey);
  target.push({ ...entry, id: cleanId });
}

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("query") ?? "").trim();
  const source = String(searchParams.get("source") ?? "all").toLowerCase();
  const isRecent = searchParams.get("recent") === "true";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? (isRecent ? 8 : 1)), 1), 20);

  try {
    // 1. RECENT RECEIPTS LOOKUP (for quick-search filter chips)
    if (isRecent) {
      const recentList: Array<{ id: string; label: string; amount: number; source: string; date: string }> = [];
      const seenKeys = new Set<string>();

      if (source === "hotel" || source === "all") {
        try {
          const res = await query(
            `SELECT r.id, r.order_number, r.receipt_type, r.created_at,
                    COALESCE((r.snapshot->>'total')::numeric, 0) as total,
                    r.snapshot->>'guestName' as guest_name
             FROM hotel_receipts r
             WHERE r.receipt_type IN ('check_in', 'check_out', 'hotel_stay')
             ORDER BY r.created_at DESC
             LIMIT $1`,
            [limit]
          );
          for (const row of res.rows) {
            pushUniqueRecent(recentList, seenKeys, {
              id: String(row.order_number || row.id),
              label: `${row.order_number || "Res"} (${row.guest_name ? String(row.guest_name).split(" ")[0] : "Guest"})`,
              amount: Number(row.total || 0),
              source: "hotel",
              date: String(row.created_at || new Date().toISOString()),
            });
          }
        } catch (err) {
          console.warn("Failed fetching recent hotel receipts:", err);
        }

        try {
          const fallbackRes = await query(
            `SELECT r.id, r.reservation_number, r.total_price, r.created_at,
                    concat_ws(' ', g.first_name, g.last_name) as guest_name
             FROM reservations r
             JOIN guests g ON g.id = r.guest_id
             ORDER BY r.created_at DESC
             LIMIT $1`,
            [limit]
          );
          for (const row of fallbackRes.rows) {
            pushUniqueRecent(recentList, seenKeys, {
              id: String(row.reservation_number || row.id),
              label: `${row.reservation_number} (${row.guest_name ? String(row.guest_name).split(" ")[0] : "Guest"})`,
              amount: Number(row.total_price || 0),
              source: "hotel",
              date: String(row.created_at || new Date().toISOString()),
            });
          }
        } catch (err) {
          console.warn("Failed fetching recent hotel reservations:", err);
        }
      }

      if (source === "restaurant" || source === "all") {
        try {
          const res = await query(
            `SELECT
               k.ordernumber,
               k.total,
               k.customername,
               COALESCE(
                 NULLIF(to_jsonb(k)->>'created_at', '')::timestamptz,
                 NULLIF(to_jsonb(k)->>'createdat', '')::timestamptz,
                 CURRENT_TIMESTAMP
               ) AS resolved_created_at
             FROM kitchenorders k
             WHERE LOWER(COALESCE(k.status, '')) NOT IN ('cancelled', 'void')
             ORDER BY resolved_created_at DESC
             LIMIT $1`,
            [limit]
          );
          for (const row of res.rows) {
            const rawDate = row.resolved_created_at ?? row.created_at ?? row.createdat ?? new Date().toISOString();
            pushUniqueRecent(recentList, seenKeys, {
              id: String(row.ordernumber),
              label: String(row.ordernumber),
              amount: Number(row.total || 0),
              source: "restaurant",
              date: String(rawDate),
            });
          }
        } catch (err) {
          console.warn("Failed fetching recent restaurant receipts from kitchenorders:", err);
        }

        try {
          const txRes = await query(
            `SELECT
               COALESCE(NULLIF(t.metadata->>'orderNumber', ''), t.transaction_reference) AS order_ref,
               t.amount,
               t.created_at
             FROM transactions t
             WHERE COALESCE(t.metadata->>'department', t.metadata->>'source', '') ILIKE '%restaurant%'
                OR COALESCE(t.metadata->>'source', '') ILIKE '%pos%'
                OR COALESCE(t.transaction_reference, '') LIKE 'ORD-%'
             ORDER BY t.created_at DESC
             LIMIT $1`,
            [limit]
          );
          for (const row of txRes.rows) {
            if (!row.order_ref) continue;
            pushUniqueRecent(recentList, seenKeys, {
              id: String(row.order_ref),
              label: String(row.order_ref),
              amount: Number(row.amount || 0),
              source: "restaurant",
              date: String(row.created_at || new Date().toISOString()),
            });
          }
        } catch (err) {
          console.warn("Failed fetching recent restaurant receipts from transactions:", err);
        }
      }

      if (source === "event" || source === "all") {
        try {
          const res = await query(
            `SELECT r.order_number, r.created_at,
                    COALESCE((r.snapshot->>'total')::numeric, 0) as total,
                    r.snapshot->'event'->>'name' as event_name,
                    r.snapshot->'event'->>'client_name' as client_name
             FROM hotel_receipts r
             WHERE r.receipt_type = 'event_booking'
             ORDER BY r.created_at DESC
             LIMIT $1`,
            [limit]
          );
          for (const row of res.rows) {
            pushUniqueRecent(recentList, seenKeys, {
              id: String(row.order_number),
              label: String(row.order_number),
              amount: Number(row.total || 0),
              source: "event",
              date: String(row.created_at || new Date().toISOString()),
            });
          }
        } catch (err) {
          console.warn("Failed fetching recent event receipts:", err);
        }

        try {
          const evFallback = await query(
            `SELECT e.id, e.name, e.total_invoiced, e.created_at
             FROM events e
             ORDER BY e.created_at DESC
             LIMIT $1`,
            [limit]
          );
          for (const row of evFallback.rows) {
            const evRef = `EVENT-${String(row.id).slice(0, 8).toUpperCase()}`;
            pushUniqueRecent(recentList, seenKeys, {
              id: evRef,
              label: evRef,
              amount: Number(row.total_invoiced || 0),
              source: "event",
              date: String(row.created_at || new Date().toISOString()),
            });
          }
        } catch (err) {
          console.warn("Failed fetching recent events:", err);
        }
      }

      recentList.sort((a, b) => {
        const ta = new Date(a.date).getTime();
        const tb = new Date(b.date).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });

      return NextResponse.json({ recentReceipts: recentList.slice(0, limit) });
    }

    // 2. SEARCH BY QUERY STRING
    if (!q) {
      return NextResponse.json({ receipt: null });
    }

    // A. SEARCH HOTEL RESERVATION & GUEST FOLIOS
    if (source === "hotel" || source === "all") {
      // 1. Check hotel_receipts
      try {
        const hr = await query(
          `SELECT r.id, r.order_number, r.order_id, r.reservation_id, r.folio_id, r.receipt_type, r.snapshot, r.created_at
           FROM hotel_receipts r
           WHERE (
             r.order_number ILIKE $1
             OR r.order_id = $1
             OR r.reservation_id::text = $1
             OR r.folio_id::text = $1
             OR r.id::text = $1
           )
           AND r.receipt_type IN ('check_in', 'check_out', 'hotel_stay')
           ORDER BY r.created_at DESC
           LIMIT 1`,
          [q]
        );

        if (hr.rows[0]) {
          const row = hr.rows[0];
          const snap = (row.snapshot || {}) as Record<string, unknown>;
          const items = normalizeItems(snap.items);
          const total = Number(snap.total || 0);
          const subtotal = Number(snap.subtotal || total);
          const tax = Number(snap.tax || Math.max(0, total - subtotal));

          const result: SalesData = {
            id: String(row.id),
            orderNumber: String(row.order_number || snap.orderNumber || q),
            orderId: row.reservation_id ? String(row.reservation_id) : undefined,
            date: String(row.created_at),
            items,
            subtotal,
            tax,
            total,
            orderType: row.receipt_type === "check_out" ? "guest checkout folio" : "hotel reservation",
            tableNumber: snap.roomNumber ? `Room ${snap.roomNumber}` : undefined,
            customerName: snap.guestName ? String(snap.guestName) : undefined,
            paymentMethod: snap.paymentMethod ? String(snap.paymentMethod) : "Hotel Folio / Cash",
            source: "hotel",
            performedBy: snap.performedBy as SalesData["performedBy"],
          };
          return NextResponse.json({ receipt: result });
        }
      } catch (err) {
        console.warn("Hotel receipts table lookup failed:", err);
      }

      // 2. Check reservations table joined with guests, rooms, and guest_folios
      try {
        const resQuery = await query(
          `SELECT r.id, r.reservation_number, r.check_in_date, r.check_out_date, r.stay_type,
                  r.status, r.total_price, r.paid_amount, r.created_at,
                  concat_ws(' ', g.first_name, g.last_name) as guest_name,
                  g.email as guest_email, g.phone as guest_phone,
                  rm.room_number,
                  gf.id as folio_id, gf.total_charges as folio_total, gf.paid_amount as folio_paid, gf.balance as folio_balance
           FROM reservations r
           JOIN guests g ON g.id = r.guest_id
           LEFT JOIN rooms rm ON rm.id = r.room_id
           LEFT JOIN guest_folios gf ON gf.reservation_id = r.id
           WHERE r.reservation_number ILIKE $1
              OR r.id::text = $1
              OR rm.room_number ILIKE $1
              OR gf.id::text = $1
              OR concat_ws(' ', g.first_name, g.last_name) ILIKE $1
           ORDER BY r.created_at DESC
           LIMIT 1`,
          [q]
        );

        if (resQuery.rows[0]) {
          const r = resQuery.rows[0];

          // Fetch line items from guest_folio_items (room charges, POS restaurant food charges, etc.)
          let folioItems: OrderItem[] = [];
          if (r.folio_id) {
            const fiRes = await query(
              `SELECT id, category, description, quantity, unit_amount, total_amount
               FROM guest_folio_items
               WHERE folio_id = $1::uuid OR reservation_id = $2::uuid
               ORDER BY created_at ASC`,
              [r.folio_id, r.id]
            );
            folioItems = normalizeItems(fiRes.rows);
          }

          // If no folio line items exist, synthesize the room stay charge item
          if (folioItems.length === 0) {
            const roomPrice = Number(r.total_price || 0);
            folioItems = [
              {
                id: `room-${r.id}`,
                name: `Room ${r.room_number || "Stay"} (${r.stay_type || "overnight"})`,
                description: `Stay from ${r.check_in_date} to ${r.check_out_date}`,
                price: roomPrice,
                quantity: 1,
                category: "beverages",
                inStock: true,
              },
            ];
          }

          const total = Number(r.folio_total ?? r.total_price ?? 0);
          const subtotal = folioItems.reduce((acc, i) => acc + (Number(i.price) * i.quantity), 0);
          const tax = Math.max(0, total - subtotal);

          const result: SalesData = {
            id: String(r.id),
            orderNumber: String(r.reservation_number),
            orderId: String(r.id),
            date: String(r.created_at),
            items: folioItems,
            subtotal: subtotal || total,
            tax,
            total: total || subtotal,
            orderType: r.status === "checked_out" ? "guest checkout folio" : "hotel reservation",
            tableNumber: r.room_number ? `Room ${r.room_number}` : undefined,
            customerName: r.guest_name ? String(r.guest_name) : undefined,
            paymentMethod: Number(r.folio_balance ?? 0) <= 0 ? "Paid in Full" : "Folio Balance",
            source: "hotel",
          };
          return NextResponse.json({ receipt: result });
        }
      } catch (err) {
        console.warn("Reservations table lookup failed:", err);
      }
    }

    // B. SEARCH RESTAURANT POS ORDERS
    if (source === "restaurant" || source === "all") {
      // 1. Check kitchenorders (schema-safe across created_at / createdat and optional items column)
      try {
        const koRes = await query(
          `SELECT
             k.id,
             k.ordernumber,
             k.total,
             k.ordertype,
             k.tablenumber,
             k.customername,
             k.paymentmethod,
             k.status,
             COALESCE(
               NULLIF(to_jsonb(k)->>'created_at', '')::timestamptz,
               NULLIF(to_jsonb(k)->>'createdat', '')::timestamptz,
               CURRENT_TIMESTAMP
             ) AS resolved_created_at,
             to_jsonb(k)->'items' AS raw_items,
             u.name as performed_by_name,
             u.email as performed_by_email,
             u.role as performed_by_role
           FROM kitchenorders k
           LEFT JOIN users u ON u.id = k.performed_by
           WHERE k.ordernumber ILIKE $1
              OR k.id::text = $1
              OR k.ordernumber ILIKE ('%' || $1 || '%')
           ORDER BY (LOWER(COALESCE(k.ordernumber, '')) = LOWER($1)) DESC, resolved_created_at DESC
           LIMIT 1`,
          [q]
        );

        if (koRes.rows[0]) {
          const ko = koRes.rows[0];

          // Check for line items in kitchen_orderitems if JSON items is empty
          let items = normalizeItems(ko.raw_items ?? ko.items);
          if (items.length === 0) {
            const koiRes = await query(
              `SELECT id, name, price, quantity FROM kitchen_orderitems WHERE kitchenorderid = $1`,
              [ko.id]
            ).catch(() => ({ rows: [] }));
            items = normalizeItems(koiRes.rows);
          }

          let txPerformedBy: SalesData["performedBy"] | undefined;
          let txCustomerRefused: boolean | undefined;
          try {
            const txMetaRes = await query(
              `SELECT metadata FROM transactions
               WHERE transaction_reference = $1 OR (metadata->>'orderNumber')::text = $1
               ORDER BY created_at DESC LIMIT 1`,
              [String(ko.ordernumber)],
            );
            const txMeta = (txMetaRes.rows[0]?.metadata || null) as Record<string, unknown> | null;
            if (txMeta) {
              if (txMeta.performedBy && typeof txMeta.performedBy === "object") {
                txPerformedBy = txMeta.performedBy as SalesData["performedBy"];
              }
              if (typeof txMeta.customerRefused === "boolean") {
                txCustomerRefused = txMeta.customerRefused;
              }
            }
          } catch {
            // Optional metadata enrichment
          }

          const total = Number(ko.total || 0);

          if (items.length === 0) {
            items = [
              {
                id: `ord-${ko.id}`,
                name: `Restaurant Order #${ko.ordernumber}`,
                description: `Restaurant Order #${ko.ordernumber}`,
                price: total,
                quantity: 1,
                category: "beverages",
                inStock: true,
              },
            ];
          }

          const subtotal = items.reduce((sum, item) => {
            const pct = Number(item.discountPercent || 0);
            const unit = pct > 0 ? item.price * (1 - pct / 100) : item.price;
            return sum + unit * item.quantity;
          }, 0);
          const tax = Math.max(0, total - subtotal);
          const resolvedDate = ko.resolved_created_at ?? ko.created_at ?? ko.createdat ?? new Date().toISOString();

          const result: SalesData = {
            id: String(ko.id),
            orderNumber: String(ko.ordernumber),
            orderId: String(ko.id),
            date: String(resolvedDate),
            items,
            subtotal: subtotal || total,
            tax,
            total,
            orderType: String(ko.ordertype || "dine-in"),
            tableNumber: ko.tablenumber ? String(ko.tablenumber) : undefined,
            customerName: ko.customername ? String(ko.customername) : undefined,
            customerRefused: txCustomerRefused,
            paymentMethod: String(ko.paymentmethod || "cash"),
            source: "restaurant",
            performedBy: ko.performed_by_name
              ? { name: ko.performed_by_name, email: ko.performed_by_email, role: ko.performed_by_role }
              : txPerformedBy,
          };
          return NextResponse.json({ receipt: result });
        }
      } catch (err) {
        console.warn("kitchenorders table lookup failed:", err);
      }

      // 2. Check transactions table (POS completion & restaurant payments)
      try {
        const txRes = await query(
          `SELECT id, transaction_reference, amount, method, metadata, created_at
           FROM transactions
           WHERE transaction_reference ILIKE $1
              OR (metadata->>'orderNumber')::text ILIKE $1
              OR (metadata->>'originalOrderNumber')::text ILIKE $1
              OR id::text = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [q]
        );

        if (txRes.rows[0]) {
          const tx = txRes.rows[0];
          const meta = (tx.metadata || {}) as Record<string, unknown>;
          let items = normalizeItems(meta.items);
          const total = Number(tx.amount || 0);
          const subtotal = items.reduce((sum, item) => {
            const pct = Number(item.discountPercent || 0);
            const unit = pct > 0 ? item.price * (1 - pct / 100) : item.price;
            return sum + unit * item.quantity;
          }, 0);
          const resolvedOrderNumber = String(meta.orderNumber ?? tx.transaction_reference ?? tx.id);

          if (items.length === 0) {
            items = [
              {
                id: `tx-${tx.id}`,
                name: `Restaurant Order #${resolvedOrderNumber}`,
                description: `Restaurant Order #${resolvedOrderNumber}`,
                price: total,
                quantity: 1,
                category: "beverages",
                inStock: true,
              },
            ];
          }

          const result: SalesData = {
            id: String(tx.id),
            orderNumber: resolvedOrderNumber,
            orderId: meta.kitchenOrderId ? String(meta.kitchenOrderId) : undefined,
            date: String(tx.created_at),
            items,
            subtotal: subtotal || total,
            tax: Math.max(0, total - subtotal),
            total,
            orderType: String(meta.orderType || "dine-in"),
            tableNumber: meta.tableNumber ? String(meta.tableNumber) : undefined,
            customerName: meta.customerName ? String(meta.customerName) : undefined,
            customerRefused: typeof meta.customerRefused === "boolean" ? meta.customerRefused : undefined,
            paymentMethod: String(tx.method || "cash"),
            source: "restaurant",
            performedBy: meta.performedBy as SalesData["performedBy"],
          };
          return NextResponse.json({ receipt: result });
        }
      } catch (err) {
        console.warn("transactions table lookup failed:", err);
      }

      // 3. Check transaction_logs
      try {
        const tlRes = await query(
          `SELECT transaction_id, amount, payment_method, items, metadata, created_at
           FROM transaction_logs
           WHERE transaction_id ILIKE $1 OR (metadata->>'orderNumber')::text ILIKE $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [q]
        );

        if (tlRes.rows[0]) {
          const tl = tlRes.rows[0];
          const meta = (tl.metadata || {}) as Record<string, unknown>;
          let items = normalizeItems(tl.items ?? meta.items);
          const total = Number(tl.amount || 0);
          const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
          if (items.length === 0) {
            items = [
              {
                id: `tx-${tl.transaction_id}`,
                name: `Restaurant Transaction #${meta.orderNumber ?? tl.transaction_id}`,
                description: `Restaurant Order`,
                price: total,
                quantity: 1,
                category: "beverages",
                inStock: true,
              },
            ];
          }

          const result: SalesData = {
            id: String(tl.transaction_id),
            orderNumber: String(meta.orderNumber ?? tl.transaction_id),
            date: String(tl.created_at),
            items,
            subtotal: subtotal || total,
            tax: Math.max(0, total - subtotal),
            total,
            orderType: String(meta.orderType || "dine-in"),
            tableNumber: meta.tableNumber ? String(meta.tableNumber) : undefined,
            customerName: meta.customerName ? String(meta.customerName) : undefined,
            paymentMethod: String(tl.payment_method || "cash"),
            source: "restaurant",
          };
          return NextResponse.json({ receipt: result });
        }
      } catch (err) {
        console.warn("transaction_logs lookup failed:", err);
      }
    }

    // C. SEARCH EVENT BOOKINGS
    if (source === "event" || source === "all") {
      // 1. Check hotel_receipts with receipt_type = 'event_booking'
      try {
        const evRec = await query(
          `SELECT id, order_number, order_id, snapshot, created_at
           FROM hotel_receipts
           WHERE receipt_type = 'event_booking'
             AND (order_number ILIKE $1 OR order_id = $1 OR id::text = $1)
           ORDER BY created_at DESC
           LIMIT 1`,
          [q]
        );

        if (evRec.rows[0]) {
          const row = evRec.rows[0];
          const snap = (row.snapshot || {}) as Record<string, unknown>;
          const items = normalizeItems(snap.items);
          const total = Number(snap.total || 0);
          const subtotal = Number(snap.subtotal || total);
          const tax = Number(snap.tax || Math.max(0, total - subtotal));
          const evInfo = (snap.event || {}) as Record<string, unknown>;

          const result: SalesData = {
            id: String(row.id),
            orderNumber: String(row.order_number),
            orderId: row.order_id ? String(row.order_id) : undefined,
            date: String(row.created_at),
            items,
            subtotal,
            tax,
            total,
            orderType: "event booking",
            customerName: evInfo.client_name ? String(evInfo.client_name) : undefined,
            paymentMethod: "Event Contract",
            source: "event",
            performedBy: snap.bookedBy as SalesData["performedBy"],
          };
          return NextResponse.json({ receipt: result });
        }
      } catch (err) {
        console.warn("Event hotel_receipts lookup failed:", err);
      }

      // 2. Check events table joined with event_quotes
      try {
        const evRes = await query(
          `SELECT e.id, e.name, e.client_name, e.venue, e.total_invoiced, e.total_paid, e.balance_due, e.created_at,
                  q.id as quote_id, q.subtotal as quote_subtotal, q.tax_amount as quote_tax, q.total as quote_total
           FROM events e
           LEFT JOIN event_quotes q ON q.event_id = e.id AND q.status IN ('accepted', 'approved')
           WHERE e.name ILIKE $1 OR e.id::text = $1 OR e.client_name ILIKE $1 OR ('EVENT-' || UPPER(SUBSTRING(e.id::text, 1, 8))) ILIKE $1
           ORDER BY e.created_at DESC
           LIMIT 1`,
          [q]
        );

        if (evRes.rows[0]) {
          const ev = evRes.rows[0];
          let eventItems: OrderItem[] = [];

          if (ev.quote_id) {
            const eqi = await query(
              `SELECT id, label as description, quantity, amount as total_amount FROM event_quote_items WHERE quote_id = $1`,
              [ev.quote_id]
            );
            eventItems = normalizeItems(eqi.rows);
          }

          if (eventItems.length === 0) {
            const evTotal = Number(ev.total_invoiced || ev.quote_total || 0);
            eventItems = [
              {
                id: `evt-${ev.id}`,
                name: `${ev.name} (${ev.venue || "Venue"})`,
                description: `Event organized for ${ev.client_name}`,
                price: evTotal,
                quantity: 1,
                category: "beverages",
                inStock: true,
              },
            ];
          }

          const total = Number(ev.total_invoiced || ev.quote_total || 0);
          const subtotal = Number(ev.quote_subtotal || total);
          const tax = Number(ev.quote_tax || Math.max(0, total - subtotal));
          const orderNum = `EVENT-${String(ev.id).slice(0, 8).toUpperCase()}`;

          const result: SalesData = {
            id: String(ev.id),
            orderNumber: orderNum,
            orderId: String(ev.id),
            date: String(ev.created_at),
            items: eventItems,
            subtotal: subtotal || total,
            tax,
            total,
            orderType: "event booking",
            customerName: ev.client_name ? String(ev.client_name) : undefined,
            paymentMethod: Number(ev.balance_due || 0) <= 0 ? "Paid in Full" : "Event Contract",
            source: "event",
          };
          return NextResponse.json({ receipt: result });
        }
      } catch (err) {
        console.warn("Events table lookup failed:", err);
      }
    }

    return NextResponse.json({ receipt: null });
  } catch (error) {
    console.error("Unified receipts lookup failed:", error);
    return NextResponse.json({ error: "Failed to look up receipt" }, { status: 500 });
  }
}
