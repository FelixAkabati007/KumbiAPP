"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

import { RoleGuard } from "@/components/role-guard";

export default function ReceiptRedirectPage() {
  const router = useRouter();
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = params?.orderNumber || "";

  useEffect(() => {
    try {
      // Redirect to the canonical receipt page which renders the preview
      if (orderNumber) {
        router.replace(
          `/receipt?orderNumber=${encodeURIComponent(orderNumber)}`,
        );
      } else {
        router.replace("/receipt");
      }
    } catch (e) {
      // Avoid console errors during generation; swallow and continue
      // eslint-disable-next-line no-console
      console.warn("Receipt redirect warning:", e);
    }
  }, [orderNumber, router]);

  return (
    <RoleGuard section="receipt">
      <div className="p-6 text-center text-sm text-gray-600 dark:text-gray-300">
        Preparing receipt preview…
      </div>
    </RoleGuard>
  );
}
