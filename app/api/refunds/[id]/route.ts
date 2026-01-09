import { NextResponse } from "next/server";
import { transaction } from "@/lib/db";
import { getSettings } from "@/lib/settings";

const VALID_STATUSES = ["pending", "approved", "rejected", "completed"] as const;

function isValidStatus(value: unknown): value is (typeof VALID_STATUSES)[number] {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, approvedBy, notes, refundMethod, transactionId } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Refund ID is required" },
        { status: 400 },
      );
    }

    if (!isValidStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const settings = getSettings().system.refunds;

    const updated = await transaction(async (client) => {
      const currentRes = await client.query(
        `SELECT * FROM refundrequests WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const current = currentRes.rows[0];

      if (!current) {
        return { notFound: true as const };
      }

      const currentStatus = String(current.status);

      if (status === "approved") {
        if (typeof approvedBy !== "string" || approvedBy.trim().length === 0) {
          return { error: "approvedBy is required" as const };
        }
        if (currentStatus === "approved") {
          return { row: current };
        }
        if (currentStatus !== "pending") {
          return { error: "Invalid status transition" as const };
        }

        const res = await client.query(
          `
            UPDATE refundrequests
            SET status = 'approved',
                approvedby = $1,
                approvedat = NOW(),
                additionalnotes = COALESCE(additionalnotes, '') || $2
            WHERE id = $3
            RETURNING *
          `,
          [approvedBy, typeof notes === "string" && notes ? `\nNote: ${notes}` : "", id],
        );

        const row = res.rows[0];
        await client.query(
          `
            INSERT INTO refund_audit_logs (refund_id, action, actor, message, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            row.id,
            "approved",
            approvedBy,
            "Refund approved",
            JSON.stringify({ from: currentStatus, to: "approved" }),
            nowIso,
          ],
        );
        return { row };
      }

      if (status === "rejected") {
        if (typeof approvedBy !== "string" || approvedBy.trim().length === 0) {
          return { error: "approvedBy is required" as const };
        }
        if (currentStatus === "rejected") {
          return { row: current };
        }
        if (currentStatus !== "pending" && currentStatus !== "approved") {
          return { error: "Invalid status transition" as const };
        }

        const res = await client.query(
          `
            UPDATE refundrequests
            SET status = 'rejected',
                approvedby = $1,
                approvedat = NOW(),
                additionalnotes = COALESCE(additionalnotes, '') || $2
            WHERE id = $3
            RETURNING *
          `,
          [
            approvedBy,
            typeof notes === "string" && notes ? `\nRejected: ${notes}` : "",
            id,
          ],
        );

        const row = res.rows[0];
        await client.query(
          `
            INSERT INTO refund_audit_logs (refund_id, action, actor, message, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            row.id,
            "rejected",
            approvedBy,
            "Refund rejected",
            JSON.stringify({ from: currentStatus, to: "rejected", reason: notes }),
            nowIso,
          ],
        );
        return { row };
      }

      if (status === "completed") {
        if (currentStatus === "completed") {
          return { row: current };
        }
        if (currentStatus !== "approved") {
          return { error: "Refund must be approved first" as const };
        }
        if (typeof refundMethod !== "string" || refundMethod.trim().length === 0) {
          return { error: "refundMethod is required" as const };
        }
        if (!settings.allowedPaymentMethods.includes(refundMethod)) {
          return { error: "Payment method not allowed for refunds" as const };
        }

        const targetTransactionId =
          (typeof transactionId === "string" && transactionId.trim().length > 0
            ? transactionId
            : typeof current.transactionid === "string"
              ? current.transactionid
              : null) || null;

        if (refundMethod !== "cash" && !targetTransactionId) {
          return { error: "transactionId is required for non-cash refunds" as const };
        }

        const res = await client.query(
          `
            UPDATE refundrequests
            SET status = 'completed',
                completedat = NOW(),
                refundmethod = $1,
                transactionid = COALESCE($2, transactionid)
            WHERE id = $3
            RETURNING *
          `,
          [refundMethod, targetTransactionId, id],
        );

        const row = res.rows[0];
        await client.query(
          `
            INSERT INTO refund_audit_logs (refund_id, action, actor, message, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            row.id,
            "completed",
            typeof approvedBy === "string" ? approvedBy : null,
            "Refund completed",
            JSON.stringify({
              from: currentStatus,
              to: "completed",
              refundMethod,
              transactionId: targetTransactionId,
            }),
            nowIso,
          ],
        );
        return { row };
      }

      return { error: "Invalid status" as const };
    });

    if ("notFound" in updated) {
      return NextResponse.json({ error: "Refund request not found" }, { status: 404 });
    }
    if ("error" in updated) {
      return NextResponse.json({ error: updated.error }, { status: 400 });
    }

    return NextResponse.json(updated.row);
  } catch (error) {
    console.error("Failed to update refund request:", error);
    return NextResponse.json(
      { error: "Failed to update refund request" },
      { status: 500 },
    );
  }
}
