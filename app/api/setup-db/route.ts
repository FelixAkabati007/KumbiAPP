import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // Enable UUID extension
    await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 1. Transaction Logs Table
    await query(`
      CREATE TABLE IF NOT EXISTS transaction_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        transaction_id VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'GHS',
        status VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50),
        customer_id VARCHAR(255),
        items JSONB,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uniq_transaction_id UNIQUE (transaction_id)
      );
    `);

    // 2. Refund Requests Table
    await query(`
      CREATE TABLE IF NOT EXISTS refundrequests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        orderid VARCHAR(255) NOT NULL,
        ordernumber VARCHAR(255) NOT NULL,
        customername VARCHAR(255) NOT NULL,
        originalamount DECIMAL(10, 2) NOT NULL,
        refundamount DECIMAL(10, 2) NOT NULL,
        paymentmethod VARCHAR(50) NOT NULL,
        reason TEXT NOT NULL,
        authorizedby VARCHAR(255) NOT NULL,
        additionalnotes TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        requestedby VARCHAR(255) NOT NULL,
        requestedat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        approvedby VARCHAR(255),
        approvedat TIMESTAMP WITH TIME ZONE,
        completedat TIMESTAMP WITH TIME ZONE,
        refundmethod VARCHAR(50),
        transactionid VARCHAR(255)
      );
    `);

    // 3. Kitchen Orders Table
    await query(`
      CREATE TABLE IF NOT EXISTS kitchenorders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ordernumber VARCHAR(255) NOT NULL,
        total DECIMAL(10, 2) NOT NULL,
        ordertype VARCHAR(50),
        tablenumber VARCHAR(50),
        customername VARCHAR(255),
        paymentmethod VARCHAR(50),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Order Items Table
    await query(`
      CREATE TABLE IF NOT EXISTS orderitems (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        orderid UUID REFERENCES kitchenorders(id),
        productid VARCHAR(255),
        name VARCHAR(255),
        quantity INTEGER NOT NULL,
        price DECIMAL(10, 2) NOT NULL
      );
    `);

    // 5. Users Table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'staff',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add indexes
    await query(
      `CREATE INDEX IF NOT EXISTS idx_transaction_logs_created_at ON transaction_logs(created_at);`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_transaction_logs_status ON transaction_logs(status);`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_refundrequests_status ON refundrequests(status);`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_refundrequests_requestedat ON refundrequests(requestedat);`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_refundrequests_ordernumber ON refundrequests(ordernumber);`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_refundrequests_orderid ON refundrequests(orderid);`
    );

    // 6. Favicons Table
    await query(`
      CREATE TABLE IF NOT EXISTS favicons (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        urls JSONB NOT NULL,
        data BYTEA,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_favicons_created_at ON favicons(created_at);`
    );

    return NextResponse.json({
      message: "Database tables set up successfully",
    });
  } catch (error) {
    console.error("Database setup failed:", error);
    return NextResponse.json(
      { error: "Database setup failed", details: String(error) },
      { status: 500 }
    );
  }
}
