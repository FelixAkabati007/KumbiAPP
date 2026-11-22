"use client";

import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  ImageIcon,
  Loader2,
  Package,
  PackagePlus,
  RefreshCw,
  X,
} from "lucide-react";
import { playNotificationSound } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TopUpMetadata {
  auditId?: string;
  inventoryItemId?: string;
  itemName?: string;
  quantityAdded?: number;
  unit?: string;
  newBalance?: number | string;
  hasPriceChange?: boolean;
  purchasePackagingPrice?: number | null;
  previousPackagingPrice?: number | null;
  reason?: string | null;
  performedBy?: string;
  performedByName?: string;
  performedByRole?: string;
  evidencePathname?: string | null;
  status?: "pending_review" | "approved" | "disapproved";
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read_at: string | null;
  opened_at: string | null;
  created_at: string;
  metadata?: TopUpMetadata | null;
}

const fetcher = (url: string) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error("Unable to load notifications");
    return response.json();
  });

export function NotificationBell() {
  const { toast } = useToast();
  const { data, error, isLoading, mutate } = useSWR<{ notifications: NotificationItem[] }>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 15000, revalidateOnFocus: true, shouldRetryOnError: true },
  );

  const notifications = useMemo(() => data?.notifications ?? [], [data?.notifications]);
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const previousUnreadCount = useRef(unreadCount);

  const [filter, setFilter] = useState<"all" | "topup">("all");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [evidenceModalUrl, setEvidenceModalUrl] = useState<string | null>(null);
  const [disapproveModalItem, setDisapproveModalItem] = useState<NotificationItem | null>(null);
  const [disapproveReason, setDisapproveReason] = useState("");
  const [isSubmittingDisapproval, setIsSubmittingDisapproval] = useState(false);

  useEffect(() => {
    if (unreadCount > previousUnreadCount.current) {
      const newest = notifications.find((item) => !item.read_at);
      if (newest?.type === "shift_reminder" || newest?.type === "inventory_topup") {
        playNotificationSound();
      }
    }
    previousUnreadCount.current = unreadCount;
  }, [notifications, unreadCount]);

  const topUpCount = useMemo(
    () => notifications.filter((n) => n.type === "inventory_topup").length,
    [notifications]
  );

  const pendingTopUpCount = useMemo(
    () =>
      notifications.filter(
        (n) => n.type === "inventory_topup" && (!n.metadata?.status || n.metadata.status === "pending_review")
      ).length,
    [notifications]
  );

  const displayedNotifications = useMemo(() => {
    if (filter === "topup") {
      return notifications.filter((n) => n.type === "inventory_topup");
    }
    return notifications;
  }, [notifications, filter]);

  async function markRead(id?: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { markAllRead: true }),
    });
    await mutate();
  }

  async function handleTopUpAction(item: NotificationItem, action: "approve" | "disapprove", reason?: string) {
    const auditId = item.metadata?.auditId || item.id;
    setActionLoadingId(item.id);
    try {
      const res = await fetch(`/api/inventory/top-up/${auditId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: reason || "" }),
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || `Failed to ${action} stock top-up`);
      }

      toast({
        title: action === "approve" ? "Top-Up Approved" : "Top-Up Disapproved & Reverted",
        description:
          action === "approve"
            ? `Stock top-up for ${item.metadata?.itemName || "item"} was verified.`
            : `Stock top-up was rejected and quantity was reverted.`,
      });

      setDisapproveModalItem(null);
      setDisapproveReason("");
      await mutate();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to process review action";
      toast({
        title: "Action Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
      setIsSubmittingDisapproval(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 rounded-full"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="w-[min(26rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] p-0 rounded-2xl shadow-xl"
        >
          <div className="flex max-h-[min(34rem,75vh)] flex-col overflow-hidden">
            {/* Header */}
            <DropdownMenuLabel className="flex items-center justify-between pb-2 pt-3 px-4">
              <span className="font-semibold text-base">Notifications</span>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="text-xs text-primary font-medium hover:underline"
                  onClick={() => markRead()}
                >
                  Mark all read
                </button>
              ) : null}
            </DropdownMenuLabel>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/40 text-xs">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-full px-3 py-1 font-medium transition-colors",
                  filter === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("topup")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors",
                  filter === "topup"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <PackagePlus className="h-3.5 w-3.5" />
                Stock Top-Ups ({topUpCount})
                {pendingTopUpCount > 0 && (
                  <span className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                    filter === "topup" ? "bg-white text-emerald-700" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  )}>
                    {pendingTopUpCount}
                  </span>
                )}
              </button>
            </div>

            <DropdownMenuSeparator className="m-0" />

            {/* List */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-border/60">
              {error ? (
                <div
                  className="flex items-center gap-2 p-4 text-sm text-destructive cursor-pointer hover:bg-muted/50"
                  onClick={() => void mutate()}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Unable to load notifications. Retry
                </div>
              ) : displayedNotifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {filter === "topup" ? "No stock top-up notifications found." : "No notifications right now."}
                </div>
              ) : (
                displayedNotifications.map((item, index) => {
                  const date = new Date(item.created_at);
                  const previous = index > 0 ? new Date(displayedNotifications[index - 1].created_at) : null;
                  const group = date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
                  const previousGroup = previous?.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

                  const isTopUp = item.type === "inventory_topup";
                  const status = item.metadata?.status ?? "pending_review";
                  const hasEvidence = Boolean(item.metadata?.evidencePathname);

                  return (
                    <div key={item.id}>
                      {group !== previousGroup && (
                        <div className="sticky top-0 z-10 border-b bg-muted/90 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                          {group}
                        </div>
                      )}

                      <div
                        onClick={() => {
                          if (!item.read_at) markRead(item.id);
                        }}
                        className={cn(
                          "relative p-3.5 transition-colors text-sm hover:bg-muted/40",
                          !item.read_at && "bg-muted/15 font-normal",
                          isTopUp && "border-l-4 border-l-emerald-500"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {isTopUp ? (
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                <Package className="h-3.5 w-3.5" />
                              </div>
                            ) : (
                              <span
                                className={cn(
                                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                                  item.read_at ? "bg-muted" : "bg-primary"
                                )}
                                aria-hidden="true"
                              />
                            )}
                            <span className="font-semibold text-foreground text-sm leading-tight">
                              {item.title}
                            </span>
                          </div>

                          {/* Status Badge for Top-Ups */}
                          {isTopUp && (
                            <div>
                              {status === "approved" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                  <Check className="h-3 w-3" /> Approved
                                </span>
                              ) : status === "disapproved" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                                  <X className="h-3 w-3" /> Reverted
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                  <Clock className="h-3 w-3" /> Pending Review
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Message */}
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed pl-8">
                          {item.message}
                        </p>

                        {/* Evidence preview button */}
                        {isTopUp && hasEvidence && (
                          <div className="mt-2 pl-8">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEvidenceModalUrl(`/api/inventory/evidence?pathname=${encodeURIComponent(item.metadata!.evidencePathname!)}`);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 transition-colors"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              View Delivery / Receipt Evidence
                            </button>
                          </div>
                        )}

                        {/* Action buttons for pending top-ups */}
                        {isTopUp && status === "pending_review" && (
                          <div
                            className="mt-2.5 flex items-center gap-2 border-t pt-2.5 pl-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={Boolean(actionLoadingId)}
                              onClick={() => handleTopUpAction(item, "approve")}
                              className="h-7 rounded-xl border-emerald-300 bg-emerald-50/60 px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                            >
                              {actionLoadingId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              ) : (
                                <Check className="h-3.5 w-3.5 mr-1" />
                              )}
                              Approve
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={Boolean(actionLoadingId)}
                              onClick={() => {
                                setDisapproveModalItem(item);
                                setDisapproveReason("");
                              }}
                              className="h-7 rounded-xl border-rose-300 bg-rose-50/60 px-3 text-xs font-medium text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              Disapprove
                            </Button>
                          </div>
                        )}

                        {/* Timestamp */}
                        <div className="mt-1.5 pl-8 text-[11px] text-muted-foreground/75">
                          <time dateTime={item.created_at}>
                            {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </time>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {unreadCount === 0 && displayedNotifications.length > 0 ? (
              <div className="flex items-center gap-2 px-4 py-2 border-t text-xs text-muted-foreground bg-muted/20">
                <CheckCheck className="h-4 w-4" aria-hidden="true" /> All caught up
              </div>
            ) : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Full Evidence Image Modal */}
      <Dialog
        open={Boolean(evidenceModalUrl)}
        onOpenChange={(open) => !open && setEvidenceModalUrl(null)}
      >
        <DialogContent className="w-[calc(100vw-1.25rem)] sm:w-full sm:max-w-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Stock Replenishment Evidence</DialogTitle>
            <DialogDescription>
              Attached photo of delivery invoice, receipt, or received goods.
            </DialogDescription>
          </DialogHeader>

          {evidenceModalUrl && (
            <div className="mt-2 flex max-h-[65vh] items-center justify-center overflow-auto rounded-2xl border bg-muted/30 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={evidenceModalUrl}
                alt="Delivery / Receipt Evidence"
                className="max-h-[60vh] w-auto rounded-xl object-contain shadow-md"
              />
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setEvidenceModalUrl(null)}
              className="rounded-2xl"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disapproval Reason Modal */}
      <Dialog
        open={Boolean(disapproveModalItem)}
        onOpenChange={(open) => !open && !isSubmittingDisapproval && setDisapproveModalItem(null)}
      >
        <DialogContent className="w-[calc(100vw-1.25rem)] sm:w-full sm:max-w-md rounded-2xl sm:rounded-3xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-rose-600 dark:text-rose-400">
              Disapprove Stock Top-Up
            </DialogTitle>
            <DialogDescription>
              Disapproving this top-up will immediately revert the added stock balance and restore previous packaging prices.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="rounded-2xl bg-rose-50 p-3 text-xs text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              <p className="font-semibold">{disapproveModalItem?.title}</p>
              <p className="mt-0.5">{disapproveModalItem?.message}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="disapprove-reason" className="text-xs font-semibold">
                Reason for Disapproval <span className="text-destructive">*</span>
              </Label>
              <Input
                id="disapprove-reason"
                placeholder="e.g. Quantity overcounted, wrong item delivered, unapproved price"
                value={disapproveReason}
                onChange={(e) => setDisapproveReason(e.target.value)}
                autoFocus
                className="rounded-2xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={isSubmittingDisapproval}
              onClick={() => setDisapproveModalItem(null)}
              className="rounded-2xl"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!disapproveReason.trim() || isSubmittingDisapproval}
              onClick={() => {
                if (disapproveModalItem) {
                  setIsSubmittingDisapproval(true);
                  handleTopUpAction(disapproveModalItem, "disapprove", disapproveReason.trim());
                }
              }}
              className="rounded-2xl bg-rose-600 hover:bg-rose-700"
            >
              {isSubmittingDisapproval ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reverting...
                </>
              ) : (
                "Disapprove & Revert Stock"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
