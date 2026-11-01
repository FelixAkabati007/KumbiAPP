"use client";

import React from "react";
import type { TaxConfiguration } from "@/lib/settings";
import type { TaxCalculationResult } from "@/lib/tax";
import { levyRows, STATUTORY_LEVIES_HEADER } from "@/lib/levy-presentation";

export interface StatutoryLevyTotalsSectionProps {
  subtotal: number;
  total: number;
  taxResult: TaxCalculationResult;
  config?: Partial<TaxConfiguration>;
  currencyPrefix?: string;
  grossSubtotal?: number;
  discountTotal?: number;
  paymentMethod?: string;
  module?: "pos" | "rooms" | "events";
  className?: string;
}

export function StatutoryLevyTotalsSection({
  subtotal,
  total,
  taxResult,
  config,
  currencyPrefix = "₵",
  grossSubtotal,
  discountTotal,
  paymentMethod,
  module = "pos",
  className = "",
}: StatutoryLevyTotalsSectionProps) {
  const isEnabled =
    Boolean(config?.enabled) &&
    (module === "pos"
      ? config?.appliesToPos !== false
      : module === "rooms"
      ? config?.appliesToRooms !== false
      : config?.appliesToEvents !== false);

  const rows = isEnabled
    ? levyRows(taxResult.breakdown, config, subtotal, currencyPrefix)
    : [];

  return (
    <div className={`space-y-1 font-mono text-sm ${className}`}>
      {grossSubtotal !== undefined && (
        <div className="flex justify-between">
          <span>Gross Subtotal:</span>
          <span className="font-mono">{currencyPrefix}{grossSubtotal.toFixed(2)}</span>
        </div>
      )}

      {discountTotal !== undefined && discountTotal > 0 && (
        <div className="flex justify-between text-orange-700 dark:text-orange-400 font-medium">
          <span>Concessions / Discounts:</span>
          <span className="font-mono">-{currencyPrefix}{discountTotal.toFixed(2)}</span>
        </div>
      )}

      <div className="flex justify-between">
        <span>Taxable Subtotal:</span>
        <span className="font-mono">{currencyPrefix}{subtotal.toFixed(2)}</span>
      </div>

      {isEnabled && rows.length > 0 && (
        <div className="space-y-0.5 pt-1.5 border-t border-dashed border-orange-200 dark:border-orange-700">
          <div className="flex justify-between font-semibold text-xs text-orange-950 dark:text-orange-200">
            <span>{STATUTORY_LEVIES_HEADER}</span>
            <span className="font-mono">{currencyPrefix}{taxResult.tax.toFixed(2)}</span>
          </div>
          {rows.map((levy) => (
            <div
              key={levy.key}
              className="flex justify-between pl-2 text-[11px] text-gray-600 dark:text-gray-400"
            >
              <span>{levy.label}:</span>
              <span className="font-mono">{levy.formatted}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between font-bold text-lg text-orange-700 dark:text-orange-300 border-t border-orange-200 dark:border-orange-600 pt-2">
        <span>TOTAL:</span>
        <span className="font-mono">{currencyPrefix}{total.toFixed(2)}</span>
      </div>

      {paymentMethod && (
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 pt-1">
          <span>Payment:</span>
          <span className="capitalize">{paymentMethod}</span>
        </div>
      )}
    </div>
  );
}
