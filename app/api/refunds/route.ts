import { NextResponse } from "next/server";
import { query, transaction } from "@/lib/db";
import { getServerSettings } from "@/lib/server-settings";

const VALID_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "completed",
] as const;

function isValidStatus(
  value: unknown
): value is (typeof VALID_STATUSES)[number] {
  return (
    typeof value === "string" &&
    (VALID_STATUSES as readonly string[]).includes(value)
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId")?.trim() || undefined;
    const statusParam = searchParams.get("status")?.trim() || undefined;
    const limitParam = searchParams.get("limit")?.trim() || undefined;
    const offsetParam = searchParams.get("offset")?.trim() || undefined;

    const limit = Math.min(Math.max(Number(limitParam || "200"), 1), 500);
    const offset = Math.max(Number(offsetParam || "0"), 0);

    if (statusParam && !isValidStatus(statusParam)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const whereParts: string[] = [];
    const params: (string | number)[] = [];

    if (orderId) {
      params.push(orderId);
      whereParts.push(`orderid = $${params.length}`);
    }

    if (statusParam) {
      params.push(statusParam);
      whereParts.push(`status = $${params.length}`);
    }

    params.push(limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    const whereSql =
      whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    const result = await query(
      `
        SELECT
          id,
          orderid,
          ordernumber,
          customername,
          originalamount,
          refundamount,
          paymentmethod,
          reason,
          authorizedby,
          additionalnotes,
          status,
          requestedby,
          requestedat,
          approvedby,
          approvedat,
          completedat,
          refundmethod,
          transactionid
        FROM refundrequests
        ${whereSql}
        ORDER BY requestedat DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      params
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch refunds:", error);
    return NextResponse.json(
      { error: "Failed to fetch refunds" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      orderId,
      orderNumber,
      customerName,
      originalAmount,
      refundAmount,
      paymentMethod,
      reason,
      authorizedBy,
      additionalNotes,
      requestedBy,
      transactionId,
    } = body as Record<string, unknown>;

    const fullSettings = await getServerSettings();
    const settings = fullSettings.system.refunds;

    if (!settings.enabled) {
      return NextResponse.json(
        { error: "Refunds are not enabled" },
        { status: 400 }
      );
    }

    if (
      typeof orderId !== "string" ||
      typeof orderNumber !== "string" ||
      typeof customerName !== "string" ||
      typeof paymentMethod !== "string" ||
      typeof reason !== "string" ||
      typeof authorizedBy !== "string" ||
      typeof requestedBy !== "string"
    ) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const original = Number(originalAmount);
    const refund = Number(refundAmount);

    if (!Number.isFinite(original) || original <= 0) {
      return NextResponse.json(
        { error: "Invalid originalAmount" },
        { status: 400 }
      );
    }
    if (!Number.isFinite(refund) || refund <= 0) {
      return NextResponse.json(
        { error: "Invalid refundAmount" },
        { status: 400 }
      );
    }
    if (refund > original) {
      return NextResponse.json(
        { error: "Refund amount cannot exceed original amount" },
        { status: 400 }
      );
    }
    if (!settings.allowedPaymentMethods.includes(paymentMethod)) {
      return NextResponse.json(
        { error: "Payment method not allowed for refunds" },
        { status: 400 }
      );
    }

    // Determine initial status based on settings
    let status = "pending";
    let approvedBy: string | null = null;
    let approvedAt: string | null = null;
    let autoApprovalNote = "";

    if (
      settings.autoApproveSmallAmounts &&
      refund <= settings.smallAmountThreshold
    ) {
      status = "approved";
      autoApprovalNote = "Auto-approved (Small Amount)";
      approvedBy = authorizedBy;
      approvedAt = new Date().toISOString();
    } else if (
      authorizedBy === "Restaurant Manager" &&
      refund > settings.maxManagerRefund
    ) {
      status = "pending";
    } else if (
      !settings.requireApproval ||
      refund <= settings.approvalThreshold
    ) {
      status = "approved";
      autoApprovalNote = "Auto-approved (Below Threshold)";
      approvedBy = authorizedBy;
      approvedAt = new Date().toISOString();
    }

    const nowIso = new Date().toISOString();
    const finalNotes =
      typeof additionalNotes === "string"
        ? additionalNotes +
          (autoApprovalNote ? `\n[System]: ${autoApprovalNote}` : "")
        : autoApprovalNote
          ? `[System]: ${autoApprovalNote}`
          : null;

    const created = await transaction(async (client) => {
      const insertRes = await client.query(
        `
          INSERT INTO refundrequests (
            orderid,
            ordernumber,
            customername,
            originalamount,
            refundamount,
            paymentmethod,
            reason,
            authorizedby,
            additionalnotes,
            status,
            requestedby,
            requestedat,
            transactionid,
            approvedby,
            approvedat
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, NOW(), $12, $13, $14
          )
          RETURNING *
        `,
        [
          orderId,
          orderNumber,
          customerName,
          original.toFixed(2),
          refund.toFixed(2),
          paymentMethod,
          reason,
          authorizedBy,
          finalNotes,
          status,
          requestedBy,
          typeof transactionId === "string" ? transactionId : null,
          approvedBy,
          approvedAt,
        ]
      );

      const refundRow = insertRes.rows[0];

      await client.query(
        `
          INSERT INTO refund_audit_logs (refund_id, action, actor, message, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          refundRow.id,
          "requested",
          requestedBy,
          "Refund requested",
          JSON.stringify({
            orderId,
            orderNumber,
            paymentMethod,
            originalAmount: original,
            refundAmount: refund,
            status,
          }),
          nowIso,
        ]
      );

      if (status === "approved") {
        await client.query(
          `
            INSERT INTO refund_audit_logs (refund_id, action, actor, message, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            refundRow.id,
            "approved",
            "System",
            autoApprovalNote,
            JSON.stringify({
              autoApproved: true,
              reason: autoApprovalNote,
            }),
            nowIso,
          ]
        );
      }

      return refundRow;
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("Failed to create refund:", error);
    return NextResponse.json(
      { error: "Failed to create refund" },
      { status: 500 }
    );
  }
}
