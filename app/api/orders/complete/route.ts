import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { requirePermission, type ApiSession } from "@/lib/api-auth";
import { publishRealtime } from "@/lib/realtime";
import { recordFinancialLedgerEntry } from "@/lib/financial-ledger";
import { calculateTaxes, getTaxConfiguration } from "@/lib/tax";
import {
  deductSingleOrderItemInventory,
  ensurePosOrderSchema,
  lockAndValidateDirectPosStock,
  normalizePosPaymentMethod,
  toSafeUuid,
} from "@/lib/pos-order-inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderItem = {
  id?: string;
  name: string;
  price: number;
  barcode?: string;
  category?: string;
  quantity: number;
  notes?: string;
  prepTime?: number;
  discountPercent?: number;
  discountAmount?: number;
  discountReason?: string;
  approvedBy?: string;
};

type OrderDiscount = {
  type: "percent" | "fixed";
  value: number;
  reason: string;
  approvedBy?: string;
};

export async function POST(req: Request) {
  try {
    const headerIdempotencyKey = req.headers.get("idempotency-key")?.trim() || "";
    const offlineSyncHeader = req.headers.get("x-offline-sync") === "true";

    const authResult = await requirePermission("pos");
    let session: ApiSession | null = authResult.session;
    if (authResult.error) {
      let allowedOfflineBypass = false;
      if ((offlineSyncHeader || Boolean(headerIdempotencyKey)) && authResult.error.status === 403) {
        const errPayload = await authResult.error
          .clone()
          .json()
          .catch(() => null);
        if (errPayload?.code === "ATTENDANCE_APPROVAL_REQUIRED") {
          const [{ getSession }, { hasPermission }] = await Promise.all([
            import("@/lib/auth"),
            import("@/lib/roles"),
          ]);
          const rawSession = await getSession();
          if (rawSession && hasPermission(rawSession.role, "pos")) {
            session = rawSession as ApiSession;
            allowedOfflineBypass = true;
          }
        }
      }
      if (!allowedOfflineBypass || !session) {
        return authResult.error;
      }
    }

    await ensurePosOrderSchema();

    const body = await req.json();
    const {
      orderNumber,
      total,
      tax,
      orderType = "dine-in",
      tableNumber,
      customerName,
      paymentMethod = "cash",
      items,
      priority = "normal",
      estimatedTime,
      orderDiscount,
      idempotencyKey: bodyIdempotencyKey,
      offlineSync,
    } = body as {
      orderNumber: string;
      total: number;
      tax?: number;
      orderType?: string;
      tableNumber?: string;
      customerName?: string;
      paymentMethod?: string;
      items: OrderItem[];
      priority?: string;
      estimatedTime?: number;
      orderDiscount?: OrderDiscount;
      idempotencyKey?: string;
      offlineSync?: boolean;
    };

    const effectiveIdempotencyKey =
      headerIdempotencyKey || (typeof bodyIdempotencyKey === "string" ? bodyIdempotencyKey.trim() : "");
    if (effectiveIdempotencyKey.length > 160) {
      return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 });
    }
    const isOfflineSync = Boolean(offlineSyncHeader || offlineSync || effectiveIdempotencyKey);

    if (!orderNumber || !Number.isFinite(Number(total)) || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Order number, total, and items are required" },
        { status: 400 },
      );
    }

    for (const item of items) {
      if (
        !Number.isFinite(Number(item.price)) ||
        Number(item.price) < 0 ||
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid order item pricing or quantity" },
          { status: 400 },
        );
      }
      if (
        !Number.isFinite(Number(item.discountPercent ?? 0)) ||
        Number(item.discountPercent ?? 0) < 0 ||
        Number(item.discountPercent ?? 0) > 100
      ) {
        return NextResponse.json(
          { error: "Discount must be between 0 and 100 percent" },
          { status: 400 },
        );
      }
    }

    const pricedItems = items.map((item) => ({
      ...item,
      discountPercent: Number(item.discountPercent ?? 0),
      price: Number(item.price) * (1 - Number(item.discountPercent ?? 0) / 100),
    }));
    let rawSubtotal = pricedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    if (orderDiscount && Number(orderDiscount.value) > 0) {
      if (orderDiscount.type === "fixed") {
        rawSubtotal = Math.max(0, rawSubtotal - Number(orderDiscount.value));
      } else if (orderDiscount.type === "percent") {
        rawSubtotal = Math.max(0, rawSubtotal * (1 - Math.min(100, Number(orderDiscount.value)) / 100));
      }
    }
    const computedSubtotal = rawSubtotal;

    // Support both tax-exclusive totals, tax-inclusive POS totals, and offline-queued historical tax rates
    const numericTotal = Number(total);
    const roundingTolerance = Math.max(0.05, items.length * 0.01);
    const explicitTax = Number.isFinite(Number(tax)) && Number(tax) >= 0 ? Number(tax) : 0;
    const matchesSubtotal = Math.abs(computedSubtotal - numericTotal) <= roundingTolerance;
    const matchesExplicitTax =
      explicitTax > 0 && Math.abs(computedSubtotal + explicitTax - numericTotal) <= roundingTolerance;

    let matchesConfiguredTax = false;
    if (!matchesSubtotal && !matchesExplicitTax) {
      try {
        const taxConfig = await getTaxConfiguration();
        const taxResult = calculateTaxes(computedSubtotal, taxConfig, "pos");
        matchesConfiguredTax = Math.abs(taxResult.total - numericTotal) <= roundingTolerance;
      } catch {
        matchesConfiguredTax = false;
      }
    }

    const matchesOfflineHistoricalTax =
      isOfflineSync &&
      numericTotal >= computedSubtotal - roundingTolerance &&
      numericTotal <= computedSubtotal * 1.5 + 1;

    if (!matchesSubtotal && !matchesExplicitTax && !matchesConfiguredTax && !matchesOfflineHistoricalTax) {
      return NextResponse.json(
        { error: "Order total does not match discounted line items" },
        { status: 400 },
      );
    }

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const activeSession: ApiSession = session;
    const safePerformedByUuid = toSafeUuid(activeSession.id);
    const normalizedPaymentMethod = normalizePosPaymentMethod(paymentMethod);

    const result = await transaction(async (client) => {
      if (effectiveIdempotencyKey) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [effectiveIdempotencyKey]);
        const existingByKey = await client.query(
          `SELECT order_id, order_number FROM order_idempotency_keys WHERE idempotency_key = $1::text LIMIT 1`,
          [effectiveIdempotencyKey],
        );
        if (existingByKey.rows[0]?.order_id) {
          return {
            id: existingByKey.rows[0].order_id,
            orderNumber: String(existingByKey.rows[0].order_number || orderNumber),
            idempotent: true,
          };
        }
      }

      let resolvedOrderNumber = orderNumber;
      const existing = await client.query(
        "SELECT id FROM kitchenorders WHERE ordernumber = $1 LIMIT 1",
        [resolvedOrderNumber],
      );
      if ((existing.rows?.length ?? existing.rowCount ?? 0) > 0 && existing.rows[0]?.id) {
        if (!isOfflineSync || !effectiveIdempotencyKey) {
          return { id: existing.rows[0].id, orderNumber: resolvedOrderNumber, idempotent: true };
        }
        const existingDetails = await client.query(
          `SELECT total, customername, tablenumber FROM kitchenorders WHERE id = $1 LIMIT 1`,
          [existing.rows[0].id],
        );
        const detail = existingDetails.rows[0];
        const sameTotal = detail ? Math.abs(Number(detail.total ?? 0) - numericTotal) <= 0.05 : true;
        const sameCustomer = detail
          ? String(detail.customername || "") === String(customerName || "")
          : true;
        const sameTable = detail
          ? String(detail.tablenumber || "") === String(tableNumber || "")
          : true;

        if (sameTotal && sameCustomer && sameTable) {
          await client.query(
            `INSERT INTO order_idempotency_keys (idempotency_key, actor_id, order_id, order_number)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [effectiveIdempotencyKey, String(activeSession.id), existing.rows[0].id, resolvedOrderNumber],
          );
          return { id: existing.rows[0].id, orderNumber: resolvedOrderNumber, idempotent: true };
        }

        const keySuffix = (
          effectiveIdempotencyKey.replace(/[^a-zA-Z0-9]/g, "").slice(-4) ||
          Math.random().toString(36).slice(2, 6)
        ).toUpperCase();
        resolvedOrderNumber = `${orderNumber}-${keySuffix}`;
      }

      const preparedStock = await lockAndValidateDirectPosStock(client, pricedItems, {
        allowZeroClamp: isOfflineSync,
      });

      const itemsColCheck = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kitchenorders' AND column_name = 'items'`,
      );
      const hasItemsColumn = (itemsColCheck.rows?.length ?? 0) > 0;
      const serializedItems = JSON.stringify(
        pricedItems.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          category: item.category || "other",
          quantity: item.quantity,
          notes: item.notes || null,
          prepTime: item.prepTime || 0,
        })),
      );

      const order = hasItemsColumn
        ? await client.query(
            `INSERT INTO kitchenorders (ordernumber, total, ordertype, tablenumber, customername, paymentmethod, priority, estimatedtime, status, items, performed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9::jsonb,$10) RETURNING id`,
            [
              resolvedOrderNumber,
              numericTotal,
              orderType,
              tableNumber || null,
              customerName || null,
              normalizedPaymentMethod,
              priority,
              estimatedTime || null,
              serializedItems,
              safePerformedByUuid,
            ],
          )
        : await client.query(
            `INSERT INTO kitchenorders (ordernumber, total, ordertype, tablenumber, customername, paymentmethod, priority, estimatedtime, status, performed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING id`,
            [
              resolvedOrderNumber,
              numericTotal,
              orderType,
              tableNumber || null,
              customerName || null,
              normalizedPaymentMethod,
              priority,
              estimatedTime || null,
              safePerformedByUuid,
            ],
          );
      const orderId = order.rows[0].id;

      const recordDiscountSafely = async (params: {
        itemName: string;
        originalUnitPrice: number;
        discountedUnitPrice: number;
        discountPercent: number;
        quantity: number;
        approvedBy?: string;
        reason: string;
      }) => {
        const approverLabel = String(
          params.approvedBy || activeSession.name || activeSession.email || activeSession.id,
        );
        const enrichedReason =
          params.approvedBy && !toSafeUuid(params.approvedBy)
            ? `${params.reason} (Approved by: ${params.approvedBy})`
            : params.reason;
        await client.query(`SAVEPOINT sp_discount_insert`);
        try {
          await client.query(
            `INSERT INTO discount_applications (order_id, item_name, original_unit_price, discounted_unit_price, discount_percent, quantity, applied_by, reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              orderId,
              params.itemName,
              params.originalUnitPrice,
              params.discountedUnitPrice,
              params.discountPercent,
              params.quantity,
              approverLabel,
              enrichedReason,
            ],
          );
          await client.query(`RELEASE SAVEPOINT sp_discount_insert`);
        } catch {
          await client.query(`ROLLBACK TO SAVEPOINT sp_discount_insert`);
          await client.query(`SAVEPOINT sp_discount_uuid_fallback`);
          try {
            await client.query(
              `INSERT INTO discount_applications (order_id, item_name, original_unit_price, discounted_unit_price, discount_percent, quantity, applied_by, reason)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                orderId,
                params.itemName,
                params.originalUnitPrice,
                params.discountedUnitPrice,
                params.discountPercent,
                params.quantity,
                toSafeUuid(params.approvedBy) || safePerformedByUuid,
                enrichedReason,
              ],
            );
            await client.query(`RELEASE SAVEPOINT sp_discount_uuid_fallback`);
          } catch {
            await client.query(`ROLLBACK TO SAVEPOINT sp_discount_uuid_fallback`);
          }
        }
      };

      for (const item of pricedItems) {
        await client.query(
          `INSERT INTO kitchen_orderitems (kitchenorderid, name, price, category, quantity, status, preptime, notes)
           VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,
          [
            orderId,
            item.name,
            item.price,
            item.category || "other",
            item.quantity,
            item.prepTime || 0,
            item.notes || null,
          ],
        );
        if (item.discountPercent > 0) {
          const originalUnitPrice = item.price / (1 - item.discountPercent / 100);
          await recordDiscountSafely({
            itemName: item.name,
            originalUnitPrice,
            discountedUnitPrice: item.price,
            discountPercent: item.discountPercent,
            quantity: item.quantity,
            approvedBy: item.approvedBy,
            reason: item.discountReason || "POS item discount",
          });
        }

        await deductSingleOrderItemInventory(
          client,
          {
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            barcode: item.barcode,
          },
          {
            preparedStock,
            orderNumber: resolvedOrderNumber,
            orderId: String(orderId),
            actorId: activeSession.id,
            sourceType: "pos_order",
            allowZeroClamp: isOfflineSync,
          },
        );
      }

      if (orderDiscount && Number(orderDiscount.value) > 0) {
        const rawGross = items.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
        const concessionAmount = orderDiscount.type === "fixed"
          ? Math.min(rawGross, Number(orderDiscount.value))
          : (rawGross * Math.min(100, Number(orderDiscount.value))) / 100;
        await recordDiscountSafely({
          itemName: "Ticket Concession",
          originalUnitPrice: rawGross,
          discountedUnitPrice: Math.max(0, rawGross - concessionAmount),
          discountPercent:
            orderDiscount.type === "percent"
              ? orderDiscount.value
              : Number(((concessionAmount / (rawGross || 1)) * 100).toFixed(2)),
          quantity: 1,
          approvedBy: orderDiscount.approvedBy,
          reason: orderDiscount.reason || "Ticket concession",
        });
      }

      const finance = await client.query(
        "SELECT id FROM transactions WHERE transaction_reference = $1 LIMIT 1",
        [resolvedOrderNumber],
      );
      if (!finance.rowCount) {
        await client.query(
          `INSERT INTO transactions (order_id, transaction_reference, amount, currency, method, status, metadata, performed_by)
           VALUES (NULL,$1,$2,'GHS',$3,'completed',$4,$5)`,
          [
            resolvedOrderNumber,
            numericTotal,
            normalizedPaymentMethod,
            JSON.stringify({
              source: "pos-order-completion",
              department: "restaurant",
              departmentLabel: "Restaurant",
              orderNumber: resolvedOrderNumber,
              originalOrderNumber: resolvedOrderNumber !== orderNumber ? orderNumber : undefined,
              offlineSynced: isOfflineSync || undefined,
              orderType,
              tableNumber: tableNumber || undefined,
              customerName: customerName || undefined,
              customerRefused: !customerName,
              items: pricedItems,
              discounts: pricedItems
                .filter((item) => item.discountPercent > 0)
                .map((item) => ({
                  itemId: item.id,
                  itemName: item.name,
                  discountPercent: item.discountPercent,
                  originalUnitPrice: Number(item.price) / (1 - item.discountPercent / 100),
                  discountedUnitPrice: item.price,
                  quantity: item.quantity,
                })),
              kitchenOrderId: orderId,
              performedBy: {
                id: activeSession.id,
                accountName: activeSession.name,
                name: activeSession.name,
                email: activeSession.email,
                role: activeSession.role,
              },
            }),
            safePerformedByUuid,
          ],
        );
      }
      await recordFinancialLedgerEntry(client, {
        eventKey: `pos-order:${resolvedOrderNumber}`,
        amount: numericTotal,
        direction: "credit",
        status: "posted",
        source: "pos-order-completion",
        paymentMethod: normalizedPaymentMethod,
        entityType: "restaurant_order",
        entityId: String(orderId),
        metadata: {
          department: "restaurant",
          departmentLabel: "Restaurant",
          orderNumber: resolvedOrderNumber,
          originalOrderNumber: resolvedOrderNumber !== orderNumber ? orderNumber : undefined,
          offlineSynced: isOfflineSync || undefined,
          orderType,
          tableNumber: tableNumber || null,
          customerName: customerName || null,
          kitchenOrderId: orderId,
          items,
          performedBy: {
            id: activeSession.id,
            accountName: activeSession.name,
            name: activeSession.name,
            email: activeSession.email,
            role: activeSession.role,
          },
        },
      });

      if (effectiveIdempotencyKey) {
        await client.query(
          `INSERT INTO order_idempotency_keys (idempotency_key, actor_id, order_id, order_number)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [effectiveIdempotencyKey, String(activeSession.id), orderId, resolvedOrderNumber],
        );
      }

      return { id: orderId, orderNumber: resolvedOrderNumber, idempotent: false };
    });

    if (!result.idempotent) {
      await publishRealtime("orders.updated", String(result.id));
      await publishRealtime("pos.updated", String(result.id));
      await publishRealtime("inventory.updated", String(result.id));
      await publishRealtime("finance.updated", String(result.id));
    }
    return NextResponse.json({
      success: true,
      orderId: result.id,
      orderNumber: result.orderNumber,
      idempotent: result.idempotent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete order";
    const status = message.toLowerCase().includes("out of stock") ? 409 : 500;
    console.error("Failed to complete POS order:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  const result = await query("SELECT 1");
  return NextResponse.json({ ok: result.rowCount === 1 });
}
