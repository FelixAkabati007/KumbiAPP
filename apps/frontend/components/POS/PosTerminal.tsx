/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { openDB } from "idb";

// Mock Supabase Realtime removed

type CartItem = { menu_item_id: string; qty: number; notes?: string };

const DB_NAME = "khhrest-pos";
const STORE_ORDERS = "pending_orders";

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db: unknown) {
      const _db: any = db;
      if (!_db.objectStoreNames.contains(STORE_ORDERS)) {
        _db.createObjectStore(STORE_ORDERS, { keyPath: "id" });
      }
    },
  });
}

type PosOrder = {
  id: string;
  tenant_id: string;
  created_by: string;
  items: CartItem[];
  order_number?: string;
  status?: string;
};

async function queueOrder(order: PosOrder) {
  const db: any = await getDB();
  await db.put(STORE_ORDERS, order);
}

async function drainQueue(sendFn: (order: PosOrder) => Promise<unknown>) {
  const db: any = await getDB();
  const tx = db.transaction(STORE_ORDERS, "readwrite");
  const store = tx.objectStore(STORE_ORDERS);
  let cursor = await store.openCursor();
  while (cursor) {
    const order = cursor.value as PosOrder;
    try {
      await sendFn(order);
      await cursor.delete();
    } catch (err) {
      console.error("failed to send queued order", err);
      // stop further tries for now
      break;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

export default function PosTerminal({
  tenantId,
  profile,
}: {
  tenantId: string;
  profile: { id: string; [k: string]: unknown };
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders] = useState<PosOrder[]>([]);

  const sendOrderToEdge = useCallback(async (order: PosOrder) => {
    // order should contain id (idempotency), items, tenant, created_by
    // send to API Route that interacts with Neon database
    const res = await fetch("/api/edge/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    if (!res.ok) throw new Error("failed to create order");
    return res.json();
  }, []);

  // Realtime updates handled by polling or WebSocket

  // attempt to drain queue whenever online
  useEffect(() => {
    const tryDrain = async () => {
      if (navigator.onLine) {
        await drainQueue(sendOrderToEdge);
      }
    };
    window.addEventListener("online", tryDrain);
    tryDrain();
    return () => window.removeEventListener("online", tryDrain);
  }, [sendOrderToEdge, tenantId]);

  const addToCart = (item: CartItem) => setCart((c) => [...c, item]);

  const buildOrderPayload = (cartItems: CartItem[]) => {
    const items = cartItems.map((ci) => ({
      menu_item_id: ci.menu_item_id,
      qty: ci.qty,
      notes: ci.notes,
    }));
    return { tenant_id: tenantId, created_by: profile.id, items };
  };

  const checkout = async () => {
    const idempotencyKey = crypto.randomUUID();
    const orderPayload = buildOrderPayload(cart);
    const order: PosOrder = { id: idempotencyKey, ...orderPayload };

    if (!navigator.onLine) {
      await queueOrder(order);
      setCart([]);
      alert("You are offline — order queued");
      return;
    }

    try {
      await sendOrderToEdge(order);
      setCart([]);
      alert("Order created");
    } catch (err) {
      console.error(err);
      // queue for retry
      await queueOrder(order);
      alert("Order queued for retry");
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold">POS Terminal</h2>
        <div>Cart: {cart.length} items</div>
      </div>
      <div className="mb-4">
        <button className="btn" onClick={checkout}>
          Checkout
        </button>
        {/* debug helper to exercise addToCart during development */}
        <button
          className="btn ml-2"
          onClick={() => addToCart({ menu_item_id: "debug-1", qty: 1 })}
        >
          Add test item
        </button>
      </div>
      <div>
        <h3>Recent Orders</h3>
        <ul>
          {orders.map((o) => (
            <li key={o.id}>
              {o.order_number || o.id} — {o.status}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
