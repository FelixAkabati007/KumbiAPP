"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Percent,
  DollarSign,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Gift,
  Clock,
  Sparkles,
  UserCheck,
  Trash2,
  Lock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface DiscountConfig {
  type: "percent" | "fixed";
  value: number;
  reason: string;
  approvedBy?: string;
  isComplimentary?: boolean;
}

interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (discount: DiscountConfig | null) => void;
  targetName: string; // e.g. "Whole Order" or "Grilled Tilapia"
  originalPrice: number;
  currentDiscount?: DiscountConfig | null;
  currentUserRole?: string;
  currentUserName?: string;
}

const PRESET_DISCOUNTS = [
  { id: "staff", label: "Staff Meal", type: "percent" as const, value: 50, icon: UserCheck, reason: "Staff meal allowance (50%)" },
  { id: "hotel_guest", label: "Hotel In-House Guest", type: "percent" as const, value: 10, icon: Tag, reason: "Hotel guest dining concession (10%)" },
  { id: "happy_hour", label: "Happy Hour", type: "percent" as const, value: 15, icon: Clock, reason: "Happy Hour beverage promotion (15%)" },
  { id: "vip", label: "VIP Customer", type: "percent" as const, value: 15, icon: Sparkles, reason: "VIP patron courtesy (15%)" },
  { id: "comp", label: "Manager Courtesy (Comp)", type: "percent" as const, value: 100, icon: Gift, reason: "Management courtesy 100% comp" },
];

export function DiscountModal({
  isOpen,
  onClose,
  onApply,
  targetName,
  originalPrice,
  currentDiscount,
  currentUserRole = "staff",
  currentUserName = "Staff",
}: DiscountModalProps) {
  const { toast } = useToast();
  const isManagerOrAdmin = ["admin", "manager"].includes(currentUserRole);

  const [discountType, setDiscountType] = useState<"percent" | "fixed">(
    currentDiscount?.type || "percent"
  );
  const [discountValue, setDiscountValue] = useState<number>(
    currentDiscount?.value || 10
  );
  const [reason, setReason] = useState<string>(
    currentDiscount?.reason || "Customer concession"
  );

  // Supervisor override state
  const [managerCredential, setManagerCredential] = useState("");
  const [managerSecret, setManagerSecret] = useState("");
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [supervisorApprovedBy, setSupervisorApprovedBy] = useState<string | null>(
    currentDiscount?.approvedBy || (isManagerOrAdmin ? currentUserName : null)
  );

  // Reset or initialize when opened
  useEffect(() => {
    if (isOpen) {
      if (currentDiscount) {
        setDiscountType(currentDiscount.type);
        setDiscountValue(currentDiscount.value);
        setReason(currentDiscount.reason);
        setSupervisorApprovedBy(currentDiscount.approvedBy || (isManagerOrAdmin ? currentUserName : null));
      } else {
        setDiscountType("percent");
        setDiscountValue(10);
        setReason("Customer concession (10%)");
        setSupervisorApprovedBy(isManagerOrAdmin ? currentUserName : null);
      }
      setManagerCredential("");
      setManagerSecret("");
    }
  }, [isOpen, currentDiscount, isManagerOrAdmin, currentUserName]);

  // Calculate simulated figures
  const numericValue = Math.max(0, Number(discountValue) || 0);
  let discountAmount = 0;
  if (discountType === "percent") {
    const clampedPercent = Math.min(100, numericValue);
    discountAmount = (originalPrice * clampedPercent) / 100;
  } else {
    discountAmount = Math.min(originalPrice, numericValue);
  }
  const finalPrice = Math.max(0, originalPrice - discountAmount);

  // Check if this discount exceeds standard staff limit (10%)
  const requiresManagerApproval =
    !isManagerOrAdmin &&
    (discountType === "fixed" || numericValue > 10 || discountAmount > originalPrice * 0.1);

  const isApproved = !requiresManagerApproval || Boolean(supervisorApprovedBy);

  const handlePresetSelect = (preset: typeof PRESET_DISCOUNTS[number]) => {
    setDiscountType(preset.type);
    setDiscountValue(preset.value);
    setReason(preset.reason);
  };

  const handleAuthorizeSupervisor = async () => {
    if (!managerCredential.trim() || !managerSecret.trim()) {
      toast({
        title: "Credentials Required",
        description: "Please enter manager username/email and PIN or password.",
        variant: "destructive",
      });
      return;
    }

    setIsAuthorizing(true);
    try {
      const response = await fetch("/api/auth/verify-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerEmailOrName: managerCredential.trim(),
          pinOrPassword: managerSecret.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authorized) {
        throw new Error(data.error || "Manager authorization failed");
      }

      setSupervisorApprovedBy(data.manager?.name || "Manager");
      toast({
        title: "Manager Authorized",
        description: `Concession verified by ${data.manager?.name || "Manager"}.`,
      });
    } catch (err) {
      toast({
        title: "Authorization Failed",
        description: err instanceof Error ? err.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSave = () => {
    if (numericValue <= 0) {
      onApply(null);
      onClose();
      return;
    }

    if (requiresManagerApproval && !supervisorApprovedBy) {
      toast({
        title: "Approval Required",
        description: "Discounts above 10% require manager sign-off.",
        variant: "destructive",
      });
      return;
    }

    onApply({
      type: discountType,
      value: discountType === "percent" ? Math.min(100, numericValue) : numericValue,
      reason: reason.trim() || "Discount concession",
      approvedBy: supervisorApprovedBy || currentUserName,
      isComplimentary: discountType === "percent" && numericValue >= 100,
    });
    onClose();
  };

  const handleRemove = () => {
    onApply(null);
    onClose();
    toast({
      title: "Discount Removed",
      description: `Removed concession from ${targetName}.`,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-orange-200 dark:border-orange-800 rounded-3xl p-5 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge
              variant="outline"
              className="bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300"
            >
              Enterprise Concession Desk
            </Badge>
            {currentDiscount && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="text-destructive hover:bg-destructive/10 text-xs h-7 px-2"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            )}
          </div>
          <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mt-1">
            <Tag className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            Apply Concession: {targetName}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure percentage or flat concession with audit tracking and supervisor authorization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Quick Preset Pills */}
          <div>
            <Label className="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-1.5 block">
              Quick 1-Tap Presets
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_DISCOUNTS.map((preset) => {
                const Icon = preset.icon;
                const isSelected =
                  discountType === preset.type && Number(discountValue) === preset.value;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium transition-all border ${
                      isSelected
                        ? "bg-orange-500 text-white border-orange-600 shadow-sm"
                        : "bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/40"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{preset.label}</span>
                    <span className="opacity-75">({preset.value}%)</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discount Type & Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Concession Type</Label>
              <div className="grid grid-cols-2 gap-1 mt-1 bg-orange-100/50 dark:bg-orange-950/30 p-1 rounded-xl border border-orange-200 dark:border-orange-800">
                <Button
                  type="button"
                  size="sm"
                  variant={discountType === "percent" ? "default" : "ghost"}
                  onClick={() => setDiscountType("percent")}
                  className={`h-8 text-xs rounded-lg ${
                    discountType === "percent"
                      ? "bg-orange-500 hover:bg-orange-600 text-white"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <Percent className="h-3.5 w-3.5 mr-1" />
                  Percent (%)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={discountType === "fixed" ? "default" : "ghost"}
                  onClick={() => setDiscountType("fixed")}
                  className={`h-8 text-xs rounded-lg ${
                    discountType === "fixed"
                      ? "bg-orange-500 hover:bg-orange-600 text-white"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <DollarSign className="h-3.5 w-3.5 mr-1" />
                  Flat (₵ GHS)
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="discount-value" className="text-xs font-semibold">
                {discountType === "percent" ? "Rate Percentage" : "Concession Amount (₵)"}
              </Label>
              <Input
                id="discount-value"
                type="number"
                min="0"
                max={discountType === "percent" ? "100" : String(originalPrice)}
                step={discountType === "percent" ? "1" : "0.5"}
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                className="mt-1 h-9 rounded-xl border-orange-200 dark:border-orange-800 text-sm font-semibold"
              />
            </div>
          </div>

          {/* Reason Code */}
          <div>
            <Label htmlFor="discount-reason" className="text-xs font-semibold">
              Concession Audit Reason (Required for Financial Audit)
            </Label>
            <Input
              id="discount-reason"
              type="text"
              placeholder="e.g. In-house hotel guest dining, customer apology"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 h-9 rounded-xl border-orange-200 dark:border-orange-800 text-xs"
            />
          </div>

          {/* Financial Math Preview Card */}
          <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-950/40 dark:via-amber-950/40 dark:to-yellow-950/40 p-3 rounded-2xl border border-orange-200 dark:border-orange-800 text-xs space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Original Gross Price:</span>
              <span className="font-mono">₵{originalPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-orange-700 dark:text-orange-300">
              <span>Concession ({discountType === "percent" ? `${numericValue}%` : "Flat"}):</span>
              <span className="font-mono">-₵{discountAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-sm text-gray-900 dark:text-gray-100 pt-1 border-t border-orange-200/60 dark:border-orange-700/60">
              <span>Net Chargeable:</span>
              <span className="font-mono">₵{finalPrice.toFixed(2)}</span>
            </div>
          </div>

          {/* Manager Authorization Card */}
          {requiresManagerApproval ? (
            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/40 rounded-2xl border border-amber-300 dark:border-amber-800 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300 mb-1">
                <ShieldAlert className="h-4 w-4" />
                <span>Manager Authorization Required (&gt;10% concession)</span>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-2">
                Standard cashiers may only apply up to 10% discount. An administrator or manager must sign off.
              </p>

              {supervisorApprovedBy ? (
                <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Authorized by: <strong>{supervisorApprovedBy}</strong></span>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Manager Name or Email"
                      value={managerCredential}
                      onChange={(e) => setManagerCredential(e.target.value)}
                      className="h-8 text-xs rounded-lg border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800"
                    />
                    <Input
                      type="password"
                      placeholder="PIN or Password"
                      value={managerSecret}
                      onChange={(e) => setManagerSecret(e.target.value)}
                      className="h-8 text-xs rounded-lg border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAuthorizeSupervisor}
                    disabled={isAuthorizing}
                    className="w-full h-8 text-xs rounded-lg border-amber-400 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  >
                    <Lock className="h-3 w-3 mr-1" />
                    {isAuthorizing ? "Verifying..." : "Authorize Concession"}
                  </Button>
                </div>
              )}
            </div>
          ) : isManagerOrAdmin ? (
            <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-emerald-800 dark:text-emerald-300 text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Signed-off by logged-in manager: <strong>{currentUserName}</strong></span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl text-blue-800 dark:text-blue-300 text-[11px]">
              <Tag className="h-3.5 w-3.5 text-blue-600" />
              <span>Standard concession (&le; 10%) automatically approved for cashier.</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-xl border-orange-200 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!isApproved}
            className="rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 text-white shadow-md text-xs font-medium"
          >
            Apply Concession
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
