import { NextResponse } from "next/server";
import { query } from "@/lib/db";

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

    let queryText = "";
    let queryParams: (string | number | boolean | null)[] = [];

    if (status === "approved") {
      queryText = `
        UPDATE refundrequests 
        SET status = $1, approvedby = $2, approvedat = NOW(), additionalnotes = COALESCE(additionalnotes, '') || $3 
        WHERE id = $4 
        RETURNING *`;
      queryParams = [
        "approved",
        approvedBy,
        notes ? `\nNote: ${notes}` : "",
        id,
      ];
    } else if (status === "rejected") {
      queryText = `
        UPDATE refundrequests 
        SET status = $1, approvedby = $2, approvedat = NOW(), additionalnotes = COALESCE(additionalnotes, '') || $3 
        WHERE id = $4 
        RETURNING *`;
      queryParams = [
        "rejected",
        approvedBy,
        notes ? `\nRejected: ${notes}` : "",
        id,
      ];
    } else if (status === "completed") {
      queryText = `
        UPDATE refundrequests 
        SET status = $1, completedat = NOW(), refundmethod = $2, transactionid = $3 
        WHERE id = $4 
        RETURNING *`;
      queryParams = ["completed", refundMethod, transactionId, id];
    } else {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const result = await query(queryText, queryParams);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Refund request not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update refund request:", error);
    return NextResponse.json(
      { error: "Failed to update refund request" },
      { status: 500 },
    );
  }
}
