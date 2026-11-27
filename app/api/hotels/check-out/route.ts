import { NextRequest, NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { syncOverdueRoomCharges, syncShortStayRoomCharges } from "@/lib/services/hotel-folio";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";

// Check-out guest from room
export async function POST(request: NextRequest) {
  try {
    const { session, error } = await requirePermission("checkOut");
    if (error) return error;

    const { reservationId, roomId, balancePaid } = await request.json();
    const paid = balancePaid === undefined || balancePaid === null || balancePaid === "" ? 0 : Number(balancePaid);

    if (!reservationId || !roomId) {
      return NextResponse.json(
        { error: "Reservation ID and Room ID are required" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(paid) || paid < 0) {
      return NextResponse.json(
        { error: "Payment amount must be a valid non-negative number" },
        { status: 400 }
      );
    }

    // Use the same authoritative clock displayed on the dashboard for checkout billing.
    const canonicalNow = await getCanonicalTransactionTimestamp();
    const canonicalNowDate = new Date(canonicalNow);

    // Use transaction to ensure all operations succeed
    const result = await transaction(async (client) => {
      // Serialize this reservation transition and lock the exact row first.
      const lockedReservation = await client.query(
        `SELECT r.id, r.room_id, r.guest_id, r.status, r.check_in_date,
              (
                SELECT h.snapshot->>'checkedInAt'
                FROM hotel_receipts h
                WHERE h.reservation_id = r.id AND h.receipt_type = 'check_in'
                ORDER BY h.created_at DESC
                LIMIT 1
              ) AS checked_in_at
         FROM reservations r
         WHERE r.id = $1::uuid
         FOR UPDATE`,
        [reservationId]
      );
      const currentReservation = lockedReservation.rows[0];
      if (!currentReservation) throw new Error("Reservation not found");
      if (currentReservation.status !== "checked_in") {
        throw new Error(`Reservation is ${currentReservation.status}; only checked-in guests can check out`);
      }
      await syncOverdueRoomCharges(client, reservationId, canonicalNowDate);
      await syncShortStayRoomCharges(client, reservationId, canonicalNowDate);

      // Lock and validate all related rows before changing any state. This
      // prevents a late validation failure from rolling back the mutation
      // while the client has already shown a success message.
      const folioResult = await client.query(
        `SELECT id, total_charges, paid_amount, balance,
                GREATEST(
                  COALESCE(balance, 0),
                  GREATEST(0, COALESCE(room_charge, 0) - COALESCE(paid_amount, 0))
                  + COALESCE(service_charges, 0) + COALESCE(food_charges, 0) + COALESCE(other_charges, 0)
                  - GREATEST(0, COALESCE(paid_amount, 0) - COALESCE(room_charge, 0))
                ) AS extras_outstanding
         FROM guest_folios WHERE reservation_id = $1::uuid FOR UPDATE`,
        [reservationId]
      );
      if (folioResult.rowCount !== 1) throw new Error("Guest folio not found");
      const folio = folioResult.rows[0];
      const outstandingBalance = Number(folio.extras_outstanding ?? 0);
      const folioItems = await client.query(`SELECT category, description, quantity, unit_amount, total_amount FROM guest_folio_items WHERE folio_id = $1 ORDER BY created_at ASC`, [folio.id]);
      const complimentaryResult = await client.query(`SELECT COALESCE(SUM(u.amount_used), 0) AS complimentary_amount FROM complimentary_authorization_usage u JOIN complimentary_authorizations a ON a.id = u.authorization_id WHERE a.reservation_id = $1`, [reservationId]);
      const grossSpent = Number(folio.total_charges ?? 0);
      const complimentaryAmount = Number(complimentaryResult.rows[0]?.complimentary_amount || 0);
      const netSpent = Math.max(0, grossSpent - complimentaryAmount);
      const roundedPaid = Math.round(paid * 100) / 100;
      const roundedOutstanding = Math.round(outstandingBalance * 100) / 100;
      if (paid < outstandingBalance) {
        if (roundedPaid < roundedOutstanding) {
          throw new Error(`Full payment of ${outstandingBalance.toFixed(2)} is required before checkout`);
        }
      }
      if (paid > outstandingBalance) {
        if (roundedPaid > roundedOutstanding) {
          throw new Error(`Payment cannot exceed the outstanding balance of ${outstandingBalance.toFixed(2)}`);
        }
      }

      const checkoutActor = { id: session?.id ?? null, name: session?.name ?? null, email: session?.email ?? null, role: session?.role ?? null };

      if (roundedPaid > 0) {
        await client.query(`UPDATE guest_folios SET paid_amount = COALESCE(paid_amount, 0) + $1, balance = GREATEST(0, balance - $1), last_updated = $3::timestamptz WHERE reservation_id = $2::uuid`, [roundedPaid, reservationId, canonicalNow]);

        const paymentRef = `HOTEL-CHECKOUT-${reservationId}`;
        const actorUserId = checkoutActor.id && /^[0-9a-f-]{36}$/i.test(checkoutActor.id) ? checkoutActor.id : null;
        await client.query(
          `INSERT INTO transactions (order_id, transaction_reference, amount, currency, method, status, metadata, performed_by)
           SELECT NULL, $1::text, $2::numeric, 'GHS', 'cash', 'completed', $3::jsonb, $4::uuid
           WHERE NOT EXISTS (
             SELECT 1 FROM transactions WHERE transaction_reference = $1::text
           )`,
          [
            paymentRef,
            roundedPaid.toFixed(2),
            JSON.stringify({ source: "hotel-checkout", department: "hotel", departmentLabel: "Hotel", reservationId, performedBy: checkoutActor }),
            actorUserId,
          ],
        );

        await recordFinancialLedgerEntry(client, {
          eventKey: paymentRef,
          amount: roundedPaid,
          direction: "credit",
          status: "posted",
          source: "hotel_checkout",
          paymentMethod: "cash",
          entityType: "reservation",
          entityId: reservationId,
          metadata: { department: "hotel", departmentLabel: "Hotel", reservationId, performedBy: checkoutActor },
        });
      }

      const resResult = await client.query(
        `UPDATE reservations SET status = 'checked_out', updated_at = $2::timestamptz
         WHERE id = $1::uuid AND status = 'checked_in' RETURNING *`,
        [reservationId, canonicalNow]
      );
      if (resResult.rowCount !== 1) throw new Error("Reservation is no longer checked in");

      // Use the reservation's persisted room assignment as the source of truth.
      // The client may have rendered an older room_id during live refresh.
      const checkedOutRoomId = resResult.rows[0].room_id || roomId;
      const roomResult = await client.query(
        `UPDATE rooms SET status = 'dirty', current_guest_id = NULL, updated_at = $2::timestamptz
         WHERE id = $1::uuid RETURNING id`,
        [checkedOutRoomId, canonicalNow]
      );
      if (roomResult.rowCount !== 1) throw new Error("Room was not found");

      // Checkout always creates the housekeeping work item in the same transaction
      // as the dirty-room transition, so the room and task cannot drift apart.
      await client.query(
        `INSERT INTO housekeeping_tasks (room_id, task_type, priority, notes)
         SELECT $1::uuid, 'cleaning', 'normal', $2::text
         WHERE NOT EXISTS (
           SELECT 1 FROM housekeeping_tasks
           WHERE room_id = $1::uuid AND task_type = 'cleaning'
             AND status IN ('pending', 'in_progress')
         )`,
        [checkedOutRoomId, `Automatic cleaning task created after checkout ${reservationId}`],
      );

      const verified = await client.query(
        `SELECT id, status, room_id, guest_id FROM reservations WHERE id = $1::uuid AND status = 'checked_out'`,
        [reservationId]
      );
      if (verified.rowCount !== 1) throw new Error("Checkout could not be verified after the transaction update");
      const formattedItems = folioItems.rows.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity) || 1,
        total_amount: Number(item.total_amount) || 0,
        category: item.category,
      }));

      let checkoutReceiptId = null;
      let checkoutReceiptSnapshot = null;

      const receiptResult = await client.query(
        `UPDATE hotel_receipts
         SET version = version + 1,
             receipt_type = 'check_out',
             snapshot = snapshot || jsonb_build_object('checkedOutBy', $2::jsonb, 'checkedOutAt', $4::text, 'balance', 0, 'paymentStatus', 'paid', 'total', $5::numeric, 'items', $6::jsonb)
         WHERE reservation_id = $1::uuid AND (folio_id = $3::uuid OR folio_id IS NULL)
         RETURNING id, snapshot`,
        [
          reservationId,
          JSON.stringify(checkoutActor),
          folio.id,
          canonicalNow,
          Number(grossSpent || folio.total_charges || 0),
          JSON.stringify(formattedItems),
        ]
      );

      if (receiptResult.rowCount && receiptResult.rowCount > 0) {
        checkoutReceiptId = receiptResult.rows[0].id;
        checkoutReceiptSnapshot = receiptResult.rows[0].snapshot;
      } else {
        const guestInfo = await client.query(
          `SELECT concat_ws(' ', g.first_name, g.last_name) as guest_name, r.reservation_number, rm.room_number
           FROM reservations r
           JOIN guests g ON g.id = r.guest_id
           LEFT JOIN rooms rm ON rm.id = r.room_id
           WHERE r.id = $1::uuid`,
          [reservationId]
        );
        const gRow = guestInfo.rows[0] || {};
        const newSnapshot = {
          guestName: gRow.guest_name || "Hotel Guest",
          roomNumber: gRow.room_number || "—",
          orderNumber: gRow.reservation_number || String(reservationId),
          items: formattedItems,
          total: Number(grossSpent || folio.total_charges || 0),
          balance: 0,
          paymentStatus: "paid",
          checkedOutBy: checkoutActor,
          checkedOutAt: canonicalNow,
          performedBy: checkoutActor,
        };
        const receiptActorUserId = checkoutActor.id && /^[0-9a-f-]{36}$/i.test(checkoutActor.id) ? checkoutActor.id : null;
        const ins = await client.query(
          `INSERT INTO hotel_receipts (reservation_id, folio_id, order_id, order_number, receipt_type, snapshot, created_by)
           VALUES ($1::uuid, $2::uuid, $3::text, $4::text, 'check_out', $5::jsonb, $6::uuid)
           RETURNING id, snapshot`,
          [
            reservationId,
            folio.id,
            String(reservationId),
            gRow.reservation_number || String(reservationId),
            JSON.stringify(newSnapshot),
            receiptActorUserId,
          ]
        );
        checkoutReceiptId = ins.rows[0]?.id;
        checkoutReceiptSnapshot = ins.rows[0]?.snapshot;
      }

      await client.query(
        `INSERT INTO operational_outbox (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
         SELECT 'hotel.checked_out', 'reservation', $1::text, $2::text, $3::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM operational_outbox WHERE idempotency_key = $2::text
         )`,
        [reservationId, `hotel-checkout:${reservationId}`, JSON.stringify({ reservationId, guestId: verified.rows[0].guest_id, roomId: checkedOutRoomId, paid, housekeeping: true, ledger: true })],
      );
      return { ...verified.rows[0], receiptId: checkoutReceiptId, receipt: checkoutReceiptSnapshot, folioDisclosure: { grossSpent, complimentaryAmount, netSpent, outstandingBalance, items: folioItems.rows } };
    });

    try {
      await query(
        `INSERT INTO notifications (recipient_user_id, title, message, type)
         SELECT u.id, $1::text, $2::text, 'housekeeping'
         FROM users u
         WHERE u.role IN ('housekeeping', 'admin', 'manager') AND u.is_active = true
           AND NOT EXISTS (
             SELECT 1 FROM notifications n
             WHERE n.recipient_user_id::text = u.id::text AND n.type = 'housekeeping'
               AND n.title = $1::text AND n.created_at > NOW() - INTERVAL '10 minutes'
           )`,
        [
          `Room ${result.room_id} needs cleaning`,
          `Room ${result.room_id} is dirty after checkout and is ready for cleaning.`,
        ],
      );
      const { publishRealtime } = await import("@/lib/realtime");
      await publishRealtime("notifications.updated", String(result.room_id)).catch(() => undefined);
    } catch (notificationError) {
      console.error("Checkout succeeded but housekeeping notification failed:", notificationError);
    }

    return NextResponse.json(
      { ...result, persisted: true, status: "checked_out" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error checking out guest:", error);
    const message = error instanceof Error ? error.message : "Failed to check out guest";
    const status = message.includes("no longer checked in") || message.includes("cannot exceed") || message.includes("Full payment") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
