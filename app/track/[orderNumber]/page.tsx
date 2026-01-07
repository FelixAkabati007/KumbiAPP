"use client";

import { useEffect, useState } from "react";
import type { SalesData, OrderItem } from "@/lib/types";
import { findSaleByOrderNumber } from "@/lib/data";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogoDisplay } from "@/components/logo-display";

interface TrackOrderPageProps {
  // Next.js can provide params/searchParams as Promises in type definitions.
  // Support both resolved objects and Promises to satisfy Next.js PageProps.
  params?: Promise<{ orderNumber?: string; [key: string]: unknown }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default function TrackOrderPage({ params }: TrackOrderPageProps) {
  const [sale, setSale] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderNumber, setOrderNumber] = useState<string>("");

  useEffect(() => {
    let canceled = false;
    setLoading(true);

    const resolveParams = async () => {
      const resolved = await params;
      const orderNum =
        typeof resolved?.orderNumber === "string" ? resolved.orderNumber : "";
      const found = (await findSaleByOrderNumber(orderNum)) || null;
      if (!canceled) {
        setOrderNumber(orderNum);
        setSale(found);
        setLoading(false);
      }
    };

    resolveParams();

    return () => {
      canceled = true;
    };
  }, [params]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <span className="text-gray-400 text-lg">Loading...</span>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Card className="max-w-md w-full p-6 text-center">
          <CardHeader>
            <CardTitle>Order Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">
              No order found for{" "}
              <span className="font-mono bg-orange-100 px-2 py-1 rounded">
                {orderNumber || ""}
              </span>
              .
            </p>
            <Link href="/receipt">
              <Button>Back to Receipt Search</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 p-4">
      <Card className="max-w-lg w-full mt-8">
        <CardHeader className="flex flex-col items-center">
          <LogoDisplay size="sm" />
          <CardTitle>Order Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-2 text-sm">
            <div>
              <span className="font-semibold">Order Number:</span>{" "}
              <span className="font-mono">{sale.orderNumber}</span>
            </div>
            <div>
              <span className="font-semibold">Date:</span>{" "}
              {new Date(sale.date).toLocaleDateString()}{" "}
              <span className="ml-2 font-semibold">Time:</span>{" "}
              {new Date(sale.date).toLocaleTimeString()}
            </div>
            <div>
              <span className="font-semibold">Payment Method:</span>{" "}
              {sale.paymentMethod}
            </div>
            <div>
              <span className="font-semibold">Order Type:</span>{" "}
              {sale.orderType}
            </div>
            {sale.customerName && (
              <div>
                <span className="font-semibold">Customer:</span>{" "}
                {sale.customerName}
              </div>
            )}
            {sale.tableNumber && (
              <div>
                <span className="font-semibold">Table:</span> {sale.tableNumber}
              </div>
            )}
            <div>
              <span className="font-semibold">Total:</span> ₵
              {sale.total?.toFixed(2)}
            </div>
          </div>
          <div className="mb-2 font-semibold">Items:</div>
          <ul className="mb-4 space-y-1">
            {sale.items.map((item: OrderItem, idx: number) => (
              <li
                key={idx}
                className="flex justify-between text-xs border-b border-orange-100 py-1"
              >
                <span>
                  {item.name} x{item.quantity}
                </span>
                <span>₵{(item.price * item.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <Link href="/receipt">
            <Button variant="outline">Back to Receipt Search</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
