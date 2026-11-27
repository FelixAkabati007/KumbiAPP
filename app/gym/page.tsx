"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Dumbbell,
  ExternalLink,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { LogoDisplay } from "@/components/logo-display";
import { PropertyClock } from "@/components/property-clock";
import { useOptionalRealtime } from "@/components/realtime-provider";
import { RoleGuard } from "@/components/role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { hasPermission, type UserRole } from "@/lib/roles";
import type { TaxConfiguration } from "@/lib/settings";
import { calculateTaxes, defaultTaxConfiguration } from "@/lib/tax";

interface GymPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  plan_type: string;
  duration_days: number;
  max_sessions: number | null;
  base_price: number | string;
  includes_trainer: boolean;
  max_capacity_per_slot: number;
  is_active: boolean;
}

interface GymMember {
  id: string;
  member_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  status: string;
  active_membership_id?: string | null;
  active_membership_number?: string | null;
  active_plan_name?: string | null;
  active_membership_end_date?: string | null;
}

interface CheckedInHotelGuest {
  reservation_id: string;
  reservation_number: string;
  room_number: string | null;
  guest_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
}

interface GymBooking {
  id: string;
  booking_number: string;
  member_id: string;
  membership_id: string | null;
  plan_id: string | null;
  reservation_id: string | null;
  trainer_name: string | null;
  session_date: string;
  starts_at: string;
  ends_at: string;
  attendee_count: number;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  subtotal: number | string;
  tax_amount: number | string;
  total_invoiced: number | string;
  total_paid: number | string;
  balance_due: number | string;
  payment_status: string;
  finance_status: string;
  member_number: string;
  first_name: string;
  last_name: string;
  phone: string;
  plan_name: string | null;
  membership_number: string | null;
}

interface GymMembership {
  id: string;
  membership_number: string;
  member_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  sessions_total: number | null;
  sessions_used: number;
  subtotal: number | string;
  tax_amount: number | string;
  total_invoiced: number | string;
  total_paid: number | string;
  balance_due: number | string;
  status: string;
  finance_status: string;
  first_name: string;
  last_name: string;
  member_number: string;
  plan_name: string;
}

interface GymPayment {
  id: string;
  payment_reference: string;
  booking_id: string | null;
  membership_id: string | null;
  member_id: string;
  amount: number | string;
  method: string;
  provider_reference: string | null;
  status: string;
  verification_status: string;
  recorded_by_name: string | null;
  recorded_at: string;
  verified_by_name: string | null;
  verified_at: string | null;
  finance_note: string | null;
  first_name: string;
  last_name: string;
  booking_number: string | null;
  membership_number: string | null;
}

interface GymRefund {
  id: string;
  refund_number: string;
  payment_id: string;
  amount: number | string;
  reason: string;
  status: string;
  requested_by_name: string | null;
  approved_by_name: string | null;
  created_at: string;
  payment_reference: string;
  first_name: string;
  last_name: string;
  booking_number: string | null;
  membership_number: string | null;
}

export default function GymPage() {
  return (
    <RoleGuard section="gym">
      <GymWorkspace />
    </RoleGuard>
  );
}

function GymWorkspace() {
  const { user } = useAuth();
  const { toast } = useToast();
  const realtime = useOptionalRealtime();

  const userRole = (user?.role as UserRole) || "staff";
  const canManagePlans = hasPermission(userRole, "gymPricing");
  const canApproveFinance = ["admin", "finance", "manager"].includes(userRole);

  const [activeTab, setActiveTab] = useState("bookings");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [plans, setPlans] = useState<GymPlan[]>([]);
  const [members, setMembers] = useState<GymMember[]>([]);
  const [checkedInGuests, setCheckedInGuests] = useState<CheckedInHotelGuest[]>([]);
  const [bookings, setBookings] = useState<GymBooking[]>([]);
  const [memberships, setMemberships] = useState<GymMembership[]>([]);
  const [payments, setPayments] = useState<GymPayment[]>([]);
  const [refunds, setRefunds] = useState<GymRefund[]>([]);
  const [taxConfig, setTaxConfig] = useState<TaxConfiguration>(defaultTaxConfiguration);

  const [summary, setSummary] = useState({
    todayDate: new Date().toISOString().slice(0, 10),
    todaysSessions: 0,
    checkedInNow: 0,
    activeMemberships: 0,
    todaysRevenue: 0,
    pendingFinanceCount: 0,
    pendingRefundsCount: 0,
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Quick Walk-in / Booking Form State
  const [quickWalkIn, setQuickWalkIn] = useState(false);
  const [walkInFirstName, setWalkInFirstName] = useState("");
  const [walkInLastName, setWalkInLastName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedReservationId, setSelectedReservationId] = useState("none");
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("08:00");
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [attendeeCount, setAttendeeCount] = useState("1");
  const [trainerName, setTrainerName] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");

  // Member Registration & Subscription Form State
  const [newMemberFirst, setNewMemberFirst] = useState("");
  const [newMemberLast, setNewMemberLast] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [subMemberId, setSubMemberId] = useState("");
  const [subPlanId, setSubPlanId] = useState("");
  const [subStartDate, setSubStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  // New Plan Form State
  const [planName, setPlanName] = useState("");
  const [planType, setPlanType] = useState("membership");
  const [planDuration, setPlanDuration] = useState("30");
  const [planPrice, setPlanPrice] = useState("");
  const [planCapacity, setPlanCapacity] = useState("30");

  // Payment Settlement Modal State
  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    targetType: "booking" | "membership";
    targetId: string;
    referenceNumber: string;
    customerName: string;
    balanceDue: number;
    reservationId?: string | null;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRefInput, setPaymentRefInput] = useState("");
  const [paymentReservationId, setPaymentReservationId] = useState("");

  // Refund Request Modal State
  const [refundModal, setRefundModal] = useState<{
    open: boolean;
    paymentId: string;
    paymentReference: string;
    maxAmount: number;
  } | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const loadWorkspaceData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [plansRes, membersRes, bookingsRes, membershipsRes, paymentsRes, refundsRes] =
        await Promise.all([
          fetch("/api/gym/plans?includeInactive=true", { cache: "no-store" }),
          fetch("/api/gym/members", { cache: "no-store" }),
          fetch("/api/gym/bookings", { cache: "no-store" }),
          fetch("/api/gym/memberships", { cache: "no-store" }),
          fetch("/api/gym/payments", { cache: "no-store" }),
          fetch("/api/gym/refunds", { cache: "no-store" }),
        ]);

      if (plansRes.ok) {
        const d = await plansRes.json();
        const loadedPlans: GymPlan[] = d.plans ?? [];
        setPlans(loadedPlans);
        setSelectedPlanId((prev) => prev || loadedPlans.find((p) => p.is_active)?.id || "");
        setSubPlanId(
          (prev) =>
            prev ||
            loadedPlans.find((p) => p.is_active && p.plan_type === "membership")?.id ||
            "",
        );
      }
      if (membersRes.ok) {
        const d = await membersRes.json();
        setMembers(d.members ?? []);
        setCheckedInGuests(d.checkedInHotelGuests ?? []);
      }
      if (bookingsRes.ok) {
        const d = await bookingsRes.json();
        setBookings(d.bookings ?? []);
        if (d.summary) setSummary(d.summary);
        if (d.taxConfiguration) setTaxConfig(d.taxConfiguration);
      }
      if (membershipsRes.ok) {
        const d = await membershipsRes.json();
        setMemberships(d.memberships ?? []);
      }
      if (paymentsRes.ok) {
        const d = await paymentsRes.json();
        setPayments(d.payments ?? []);
      }
      if (refundsRes.ok) {
        const d = await refundsRes.json();
        setRefunds(d.refunds ?? []);
      }
    } catch (err) {
      console.error("Failed to load Gym workspace:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspaceData(false);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadWorkspaceData(true);
      }
    }, 20000);
    return () => window.clearInterval(interval);
  }, [loadWorkspaceData]);

  useEffect(() => {
    const evt = realtime?.lastEvent;
    if (!evt) return;
    if (evt.topic === "gym.updated" || evt.topic === "finance.updated") {
      void loadWorkspaceData(true);
    }
  }, [realtime?.lastEvent, loadWorkspaceData]);

  // Live GRA Tax Preview for Booking Form
  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );
  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const bookingPricePreview = useMemo(() => {
    if (selectedMember?.active_membership_id && !quickWalkIn) {
      return { covered: true, subtotal: 0, tax: 0, total: 0 };
    }
    if (!selectedPlan || selectedPlan.code === "GYM-HOTEL-COMP") {
      return { covered: false, subtotal: 0, tax: 0, total: 0 };
    }
    const base = (Number(selectedPlan.base_price) || 0) * Math.max(1, Number(attendeeCount) || 1);
    const calc = calculateTaxes(base, taxConfig, "gym");
    return { covered: false, subtotal: calc.subtotal, tax: calc.tax, total: calc.total };
  }, [selectedMember, selectedPlan, attendeeCount, taxConfig, quickWalkIn]);

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (!q) return true;
      return (
        b.booking_number.toLowerCase().includes(q) ||
        `${b.first_name} ${b.last_name}`.toLowerCase().includes(q) ||
        b.phone.toLowerCase().includes(q) ||
        (b.plan_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [bookings, searchQuery, statusFilter]);

  async function handleCreateBooking(e: FormEvent) {
    e.preventDefault();
    if (busyAction) return;
    setBusyAction("create-booking");

    try {
      let memberIdToBook = selectedMemberId;
      if (quickWalkIn) {
        if (!walkInFirstName.trim() || !walkInLastName.trim() || !walkInPhone.trim()) {
          toast({
            title: "Walk-In Details Required",
            description: "Enter first name, last name, and phone number for the walk-in guest.",
            variant: "destructive",
          });
          return;
        }
        const memRes = await fetch("/api/gym/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: walkInFirstName.trim(),
            lastName: walkInLastName.trim(),
            phone: walkInPhone.trim(),
          }),
        });
        const memData = await memRes.json().catch(() => ({}));
        if (!memRes.ok || !memData.member?.id) {
          throw new Error(memData.error || "Failed to register walk-in member");
        }
        memberIdToBook = memData.member.id;
      }

      if (!memberIdToBook) {
        toast({
          title: "Select a Member",
          description: "Choose an existing member or switch to Quick Walk-In.",
          variant: "destructive",
        });
        return;
      }

      const startsIso = new Date(`${sessionDate}T${startTime || "08:00"}:00Z`).toISOString();
      const endsIso = new Date(
        new Date(startsIso).getTime() + Math.max(30, Number(durationMinutes) || 90) * 60 * 1000,
      ).toISOString();

      const res = await fetch("/api/gym/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: memberIdToBook,
          planId: selectedMember?.active_membership_id && !quickWalkIn ? null : selectedPlanId || null,
          membershipId:
            selectedMember?.active_membership_id && !quickWalkIn
              ? selectedMember.active_membership_id
              : null,
          reservationId: selectedReservationId !== "none" ? selectedReservationId : null,
          trainerName: trainerName.trim() || null,
          sessionDate,
          startsAt: startsIso,
          endsAt: endsIso,
          attendeeCount: Math.max(1, Number(attendeeCount) || 1),
          notes: bookingNotes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to create gym booking");

      const bk = data.booking as GymBooking;
      toast({
        title: "Gym Session Booked",
        description: `${bk.booking_number} created${data.coveredByMembership ? " (covered by active membership)" : ""}.`,
      });

      setWalkInFirstName("");
      setWalkInLastName("");
      setWalkInPhone("");
      setBookingNotes("");
      await loadWorkspaceData(true);

      // Automatically open payment modal if balance is due!
      if (Number(bk.balance_due) > 0.01) {
        setPaymentModal({
          open: true,
          targetType: "booking",
          targetId: bk.id,
          referenceNumber: bk.booking_number,
          customerName: quickWalkIn
            ? `${walkInFirstName} ${walkInLastName}`.trim()
            : `${selectedMember?.first_name ?? ""} ${selectedMember?.last_name ?? ""}`.trim() ||
              "Gym Client",
          balanceDue: Number(bk.balance_due),
          reservationId: selectedReservationId !== "none" ? selectedReservationId : null,
        });
        setPaymentAmount(Number(bk.balance_due).toFixed(2));
        setPaymentMethod(selectedReservationId !== "none" ? "room_charge" : "cash");
        setPaymentReservationId(selectedReservationId !== "none" ? selectedReservationId : "");
      }
    } catch (err) {
      toast({
        title: "Booking Failed",
        description: err instanceof Error ? err.message : "Could not create booking",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleBookingStatusAction(
    booking: GymBooking,
    action: "check_in" | "check_out" | "cancel",
  ) {
    if (busyAction) return;
    setBusyAction(`${action}-${booking.id}`);
    try {
      const res = await fetch("/api/gym/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to ${action.replace("_", " ")}`);
      toast({
        title:
          action === "check_in"
            ? "Member Checked In"
            : action === "check_out"
              ? "Workout Completed"
              : "Booking Cancelled",
        description: `${booking.booking_number} updated.`,
      });
      await loadWorkspaceData(true);
    } catch (err) {
      toast({
        title: "Action Blocked",
        description: err instanceof Error ? err.message : "Unable to update session",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRegisterMember(e: FormEvent) {
    e.preventDefault();
    if (busyAction) return;
    setBusyAction("register-member");
    try {
      const res = await fetch("/api/gym/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: newMemberFirst,
          lastName: newMemberLast,
          phone: newMemberPhone,
          email: newMemberEmail || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to register member");
      toast({
        title: "Gym Member Registered",
        description: `${data.member.member_number} (${data.member.first_name} ${data.member.last_name}) added.`,
      });
      setNewMemberFirst("");
      setNewMemberLast("");
      setNewMemberPhone("");
      setNewMemberEmail("");
      setSubMemberId(data.member.id);
      setSelectedMemberId(data.member.id);
      await loadWorkspaceData(true);
    } catch (err) {
      toast({
        title: "Registration Error",
        description: err instanceof Error ? err.message : "Failed to register member",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateMembership(e: FormEvent) {
    e.preventDefault();
    if (!subMemberId || !subPlanId || busyAction) return;
    setBusyAction("create-membership");
    try {
      const res = await fetch("/api/gym/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: subMemberId,
          planId: subPlanId,
          startDate: subStartDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to enroll membership");
      const ms = data.membership as GymMembership;
      const memberObj = members.find((m) => m.id === subMemberId);
      toast({
        title: "Membership Subscription Created",
        description: `${ms.membership_number} ready for payment settlement.`,
      });
      await loadWorkspaceData(true);

      if (Number(ms.balance_due) > 0.01) {
        setPaymentModal({
          open: true,
          targetType: "membership",
          targetId: ms.id,
          referenceNumber: ms.membership_number,
          customerName: memberObj
            ? `${memberObj.first_name} ${memberObj.last_name}`
            : "Gym Member",
          balanceDue: Number(ms.balance_due),
        });
        setPaymentAmount(Number(ms.balance_due).toFixed(2));
        setPaymentMethod("cash");
      }
    } catch (err) {
      toast({
        title: "Enrollment Failed",
        description: err instanceof Error ? err.message : "Failed to create membership",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitPayment(e: FormEvent) {
    e.preventDefault();
    if (!paymentModal || busyAction) return;
    setBusyAction("submit-payment");
    try {
      const idemKey = `gym-ui-pay:${paymentModal.targetId}:${paymentMethod}:${paymentAmount}`;
      const res = await fetch("/api/gym/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          bookingId: paymentModal.targetType === "booking" ? paymentModal.targetId : null,
          membershipId: paymentModal.targetType === "membership" ? paymentModal.targetId : null,
          amount: Number(paymentAmount),
          method: paymentMethod,
          providerReference: paymentRefInput.trim() || null,
          reservationId: paymentMethod === "room_charge" ? paymentReservationId : null,
          idempotencyKey: idemKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Payment failed");

      toast({
        title: data.requiresFinanceApproval
          ? "Submitted to Finance Department"
          : data.chargedToRoomFolio
            ? "Posted to Hotel Guest Folio"
            : "Payment Settled & Posted to Ledger",
        description: data.requiresFinanceApproval
          ? `${data.payment.payment_reference} awaits Finance verification before activation.`
          : `Receipt ${paymentModal.referenceNumber} is ready and synced to Finance.`,
      });
      setPaymentModal(null);
      setPaymentRefInput("");
      await loadWorkspaceData(true);
    } catch (err) {
      toast({
        title: "Payment Error",
        description: err instanceof Error ? err.message : "Unable to process payment",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleFinancePaymentAction(
    paymentId: string,
    action: "approve_and_post" | "reconcile" | "reject",
  ) {
    if (busyAction) return;
    setBusyAction(`fin-${paymentId}-${action}`);
    try {
      const res = await fetch("/api/gym/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Finance review failed");
      toast({
        title:
          action === "approve_and_post"
            ? "Verified & Posted to Canonical Ledger"
            : action === "reconcile"
              ? "Reconciled by Finance"
              : "Payment Rejected",
        description: `${data.payment.payment_reference} updated.`,
      });
      await loadWorkspaceData(true);
    } catch (err) {
      toast({
        title: "Finance Review Failed",
        description: err instanceof Error ? err.message : "Action restricted to Finance Authority",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitRefundRequest(e: FormEvent) {
    e.preventDefault();
    if (!refundModal || busyAction) return;
    setBusyAction("submit-refund");
    try {
      const res = await fetch("/api/gym/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: refundModal.paymentId,
          amount: Number(refundAmount),
          reason: refundReason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to request refund");
      toast({
        title: "Refund Sent to Finance",
        description: `${data.refund.refund_number} awaits Finance Department approval.`,
      });
      setRefundModal(null);
      setRefundReason("");
      await loadWorkspaceData(true);
    } catch (err) {
      toast({
        title: "Refund Request Failed",
        description: err instanceof Error ? err.message : "Could not submit refund",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleFinanceRefundDecision(refundId: string, action: "approve" | "reject") {
    if (busyAction) return;
    setBusyAction(`ref-${refundId}-${action}`);
    try {
      const res = await fetch("/api/gym/refunds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Refund review failed");
      toast({
        title: action === "approve" ? "Refund Approved & Reversed in Ledger" : "Refund Rejected",
        description: `${data.refund.refund_number} updated.`,
      });
      await loadWorkspaceData(true);
    } catch (err) {
      toast({
        title: "Finance Refund Action Failed",
        description: err instanceof Error ? err.message : "Action restricted to Finance Authority",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreatePlan(e: FormEvent) {
    e.preventDefault();
    if (!canManagePlans || busyAction) return;
    setBusyAction("create-plan");
    try {
      const res = await fetch("/api/gym/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: planName.trim(),
          planType,
          durationDays: Number(planDuration) || 30,
          basePrice: Number(planPrice) || 0,
          maxCapacityPerSlot: Number(planCapacity) || 30,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to create plan");
      toast({
        title: "Gym Plan Added",
        description: `${data.plan.name} (GHS ${Number(data.plan.base_price).toFixed(2)}) created.`,
      });
      setPlanName("");
      setPlanPrice("");
      await loadWorkspaceData(true);
    } catch (err) {
      toast({
        title: "Plan Creation Error",
        description: err instanceof Error ? err.message : "Could not save plan",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      {/* Top Header */}
      <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-orange-800 dark:bg-gray-900/85 md:px-6">
        <div className="flex items-center gap-2.5">
          <Button
            asChild
            variant="outline"
            size="icon"
            className="rounded-xl border-orange-200 bg-white/80 dark:border-orange-700 dark:bg-gray-800/80"
            aria-label="Back to dashboard"
          >
            <Link href="/">
              <ArrowLeft className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </Link>
          </Button>
          <LogoDisplay size="sm" />
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                Fitness &amp; Wellness Operations
              </p>
              <h1 className="text-base font-bold sm:text-xl">
                Gym Booking &amp; Finance Desk
              </h1>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PropertyClock />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadWorkspaceData(false)}
            disabled={loading}
            className="rounded-xl border-orange-200 dark:border-orange-700"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {hasPermission(userRole, "finance") && (
            <Button asChild size="sm" variant="outline" className="rounded-xl border-orange-300">
              <Link href="/finance">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-orange-600" />
                Finance Ledger
              </Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
        {/* Live KPI Strip */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="rounded-2xl border-orange-200/80 bg-white/80 dark:border-orange-800 dark:bg-gray-900/70">
            <CardHeader className="pb-1 pt-4">
              <CardDescription className="flex items-center justify-between text-xs font-medium">
                <span>Today&apos;s Sessions</span>
                <CalendarDays className="h-4 w-4 text-orange-600" />
              </CardDescription>
              <CardTitle className="text-2xl font-bold">{summary.todaysSessions}</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-xs text-muted-foreground">
              Scheduled for {summary.todayDate}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-orange-200/80 bg-white/80 dark:border-orange-800 dark:bg-gray-900/70">
            <CardHeader className="pb-1 pt-4">
              <CardDescription className="flex items-center justify-between text-xs font-medium">
                <span>Checked-In Floor</span>
                <UserCheck className="h-4 w-4 text-emerald-600" />
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                {summary.checkedInNow}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-xs text-muted-foreground">
              Currently training in gym
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-orange-200/80 bg-white/80 dark:border-orange-800 dark:bg-gray-900/70">
            <CardHeader className="pb-1 pt-4">
              <CardDescription className="flex items-center justify-between text-xs font-medium">
                <span>Active Memberships</span>
                <Users className="h-4 w-4 text-blue-600" />
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                {summary.activeMemberships}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-xs text-muted-foreground">
              Valid recurring passes
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-orange-200/80 bg-white/80 dark:border-orange-800 dark:bg-gray-900/70">
            <CardHeader className="pb-1 pt-4">
              <CardDescription className="flex items-center justify-between text-xs font-medium">
                <span>Today&apos;s Gym Revenue</span>
                <Banknote className="h-4 w-4 text-orange-600" />
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                GHS {summary.todaysRevenue.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-xs text-muted-foreground">
              Posted to canonical ledger
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => setActiveTab("finance")}
            className="cursor-pointer rounded-2xl border-orange-300/90 bg-orange-50/80 transition hover:shadow-md dark:border-orange-700 dark:bg-orange-950/40"
          >
            <CardHeader className="pb-1 pt-4">
              <CardDescription className="flex items-center justify-between text-xs font-semibold text-orange-800 dark:text-orange-200">
                <span>Finance Queue</span>
                <ShieldCheck className="h-4 w-4 text-orange-600" />
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                {summary.pendingFinanceCount + summary.pendingRefundsCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 text-xs text-orange-800/80 dark:text-orange-200/80">
              {summary.pendingFinanceCount} settlements · {summary.pendingRefundsCount} refunds
            </CardContent>
          </Card>
        </section>

        {/* Main Operational Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 rounded-2xl border border-orange-200 bg-white/80 p-1.5 dark:border-orange-800 dark:bg-gray-900/80">
            <TabsTrigger value="bookings" className="rounded-xl px-4 py-2 text-xs sm:text-sm">
              <CalendarDays className="mr-1.5 h-4 w-4" />
              Session Bookings &amp; Check-In
            </TabsTrigger>
            <TabsTrigger value="members" className="rounded-xl px-4 py-2 text-xs sm:text-sm">
              <Users className="mr-1.5 h-4 w-4" />
              Members &amp; Subscriptions ({members.length})
            </TabsTrigger>
            <TabsTrigger value="finance" className="rounded-xl px-4 py-2 text-xs sm:text-sm">
              <CreditCard className="mr-1.5 h-4 w-4" />
              Finance Department Settlement &amp; Refunds
              {summary.pendingFinanceCount + summary.pendingRefundsCount > 0 && (
                <Badge className="ml-2 bg-orange-600 text-white">
                  {summary.pendingFinanceCount + summary.pendingRefundsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="plans" className="rounded-xl px-4 py-2 text-xs sm:text-sm">
              <Dumbbell className="mr-1.5 h-4 w-4" />
              Gym Plans &amp; Rates
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: SESSION BOOKINGS & CHECK-IN */}
          <TabsContent value="bookings" className="space-y-4">
            <div className="grid gap-5 lg:grid-cols-12">
              {/* Book Session Card */}
              <Card className="rounded-3xl border-orange-200 bg-white/85 shadow-sm dark:border-orange-800 dark:bg-gray-900/80 lg:col-span-4">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold">Book Gym Session</CardTitle>
                    <Button
                      type="button"
                      size="sm"
                      variant={quickWalkIn ? "default" : "outline"}
                      onClick={() => setQuickWalkIn((v) => !v)}
                      className="h-7 rounded-xl text-xs"
                    >
                      <UserPlus className="mr-1 h-3.5 w-3.5" />
                      {quickWalkIn ? "Existing Member" : "Quick Walk-In"}
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Schedule a workout slot, personal training session, or hotel guest pass.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateBooking} className="space-y-3">
                    {quickWalkIn ? (
                      <div className="space-y-2 rounded-2xl border border-orange-200/80 bg-orange-50/50 p-3 dark:border-orange-800 dark:bg-orange-950/30">
                        <p className="text-xs font-semibold text-orange-800 dark:text-orange-200">
                          New Walk-In Client Details
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="First name *"
                            value={walkInFirstName}
                            onChange={(e) => setWalkInFirstName(e.target.value)}
                            required
                          />
                          <Input
                            placeholder="Last name *"
                            value={walkInLastName}
                            onChange={(e) => setWalkInLastName(e.target.value)}
                            required
                          />
                        </div>
                        <Input
                          placeholder="Phone number (e.g. 024...)*"
                          value={walkInPhone}
                          onChange={(e) => setWalkInPhone(e.target.value)}
                          required
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Gym Member</Label>
                        <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose registered member..." />
                          </SelectTrigger>
                          <SelectContent>
                            {members.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.first_name} {m.last_name} ({m.member_number})
                                {m.active_membership_id ? " · Active Pass" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedMember?.active_membership_id && (
                          <p className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                            Covered by {selectedMember.active_plan_name} (valid until{" "}
                            {selectedMember.active_membership_end_date})
                          </p>
                        )}
                      </div>
                    )}

                    {(!selectedMember?.active_membership_id || quickWalkIn) && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Session Package</Label>
                        <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select session package" />
                          </SelectTrigger>
                          <SelectContent>
                            {plans
                              .filter((p) => p.is_active)
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} — GHS {Number(p.base_price).toFixed(2)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {checkedInGuests.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Link Checked-In Hotel Room (Optional)</Label>
                        <Select
                          value={selectedReservationId}
                          onValueChange={setSelectedReservationId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Not linked to hotel room" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No hotel room link</SelectItem>
                            {checkedInGuests.map((g) => (
                              <SelectItem key={g.reservation_id} value={g.reservation_id}>
                                Room {g.room_number || "—"} · {g.first_name} {g.last_name} (
                                {g.reservation_number})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Date</Label>
                        <Input
                          type="date"
                          value={sessionDate}
                          onChange={(e) => setSessionDate(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Start Time</Label>
                        <Input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Duration (mins)</Label>
                        <Input
                          type="number"
                          min="30"
                          max="480"
                          value={durationMinutes}
                          onChange={(e) => setDurationMinutes(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Attendees</Label>
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          value={attendeeCount}
                          onChange={(e) => setAttendeeCount(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Assigned Coach / Trainer (Optional)</Label>
                      <Input
                        placeholder="e.g. Coach Kwame"
                        value={trainerName}
                        onChange={(e) => setTrainerName(e.target.value)}
                      />
                    </div>

                    <div className="rounded-2xl border border-orange-200/80 bg-orange-50/70 p-3 text-xs dark:border-orange-800/70 dark:bg-orange-950/30">
                      {bookingPricePreview.covered ? (
                        <div className="flex items-center justify-between font-semibold text-emerald-700 dark:text-emerald-300">
                          <span>Active Membership Coverage</span>
                          <span>GHS 0.00 Due</span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Subtotal</span>
                            <span>GHS {bookingPricePreview.subtotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>GRA Statutory Taxes &amp; Levies</span>
                            <span>GHS {bookingPricePreview.tax.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between border-t border-orange-200 pt-1 text-sm font-bold text-orange-900 dark:border-orange-800 dark:text-orange-100">
                            <span>Total Payable</span>
                            <span>GHS {bookingPricePreview.total.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      type="submit"
                      disabled={busyAction === "create-booking"}
                      className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 font-semibold text-white shadow-md"
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      {busyAction === "create-booking"
                        ? "Booking Session..."
                        : "Confirm Gym Booking"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Live Bookings Register */}
              <Card className="rounded-3xl border-orange-200 bg-white/85 shadow-sm dark:border-orange-800 dark:bg-gray-900/80 lg:col-span-8">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base font-bold">
                        Gym Sessions &amp; Floor Check-In Register
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Check members in/out, collect fees, charge checked-in hotel rooms, or print
                        persisted receipts.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search booking or member..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-9 w-48 pl-8 text-xs"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 w-36 text-xs">
                          <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="booked">Booked</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="checked_in">Checked In</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredBookings.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-orange-200 py-12 text-center text-sm text-muted-foreground dark:border-orange-800">
                      No gym bookings match your current filter. Use the form on the left to book a
                      session.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredBookings.map((bk) => {
                        const balance = Number(bk.balance_due) || 0;
                        const invoiced = Number(bk.total_invoiced) || 0;
                        return (
                          <div
                            key={bk.id}
                            className="flex flex-col justify-between gap-3 rounded-2xl border border-orange-200/70 bg-white/90 p-3.5 shadow-sm dark:border-orange-800/60 dark:bg-gray-800/80 sm:flex-row sm:items-center"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-bold text-orange-700 dark:text-orange-300">
                                  {bk.booking_number}
                                </span>
                                <Badge variant="outline" className="capitalize text-[11px]">
                                  {bk.status.replace("_", " ")}
                                </Badge>
                                <Badge
                                  variant="secondary"
                                  className={`text-[11px] capitalize ${
                                    balance <= 0.01
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                      : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                  }`}
                                >
                                  {bk.payment_status.replaceAll("_", " ")}
                                </Badge>
                              </div>
                              <p className="text-sm font-semibold">
                                {bk.first_name} {bk.last_name}{" "}
                                <span className="text-xs font-normal text-muted-foreground">
                                  · {bk.phone}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {bk.plan_name || "Gym Session"} · {bk.session_date} ·{" "}
                                {new Date(bk.starts_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {bk.trainer_name ? ` · Coach: ${bk.trainer_name}` : ""}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                              <div className="mr-2 text-right text-xs">
                                <div className="font-bold">GHS {invoiced.toFixed(2)}</div>
                                {balance > 0.01 ? (
                                  <div className="text-amber-700 dark:text-amber-300">
                                    Due: GHS {balance.toFixed(2)}
                                  </div>
                                ) : (
                                  <div className="text-emerald-600 dark:text-emerald-400">
                                    Settled
                                  </div>
                                )}
                              </div>

                              {balance > 0.01 &&
                                bk.status !== "cancelled" &&
                                bk.payment_status !== "pending_finance_verification" && (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setPaymentModal({
                                        open: true,
                                        targetType: "booking",
                                        targetId: bk.id,
                                        referenceNumber: bk.booking_number,
                                        customerName: `${bk.first_name} ${bk.last_name}`,
                                        balanceDue: balance,
                                        reservationId: bk.reservation_id,
                                      });
                                      setPaymentAmount(balance.toFixed(2));
                                      setPaymentMethod(bk.reservation_id ? "room_charge" : "cash");
                                      setPaymentReservationId(bk.reservation_id || "");
                                    }}
                                    className="h-8 rounded-xl bg-orange-600 text-xs text-white hover:bg-orange-700"
                                  >
                                    <CreditCard className="mr-1 h-3.5 w-3.5" />
                                    Settle
                                  </Button>
                                )}

                              {bk.status !== "checked_in" &&
                                bk.status !== "completed" &&
                                bk.status !== "cancelled" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyAction === `check_in-${bk.id}`}
                                    onClick={() => void handleBookingStatusAction(bk, "check_in")}
                                    className="h-8 rounded-xl border-emerald-300 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
                                  >
                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                    Check In
                                  </Button>
                                )}

                              {bk.status === "checked_in" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busyAction === `check_out-${bk.id}`}
                                  onClick={() => void handleBookingStatusAction(bk, "check_out")}
                                  className="h-8 rounded-xl border-blue-300 text-xs text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300"
                                >
                                  <Clock3 className="mr-1 h-3.5 w-3.5" />
                                  Check Out
                                </Button>
                              )}

                              {Number(bk.total_paid) > 0 && (
                                <Button
                                  asChild
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 rounded-xl text-xs"
                                >
                                  <Link
                                    href={`/receipt?orderNumber=${encodeURIComponent(bk.booking_number)}&source=gym`}
                                  >
                                    <Receipt className="mr-1 h-3.5 w-3.5" />
                                    Receipt
                                  </Link>
                                </Button>
                              )}

                              {bk.status !== "completed" && bk.status !== "cancelled" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyAction === `cancel-${bk.id}`}
                                  onClick={() => void handleBookingStatusAction(bk, "cancel")}
                                  className="h-8 rounded-xl text-xs text-destructive hover:bg-destructive/10"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 2: MEMBERS & SUBSCRIPTIONS */}
          <TabsContent value="members" className="space-y-4">
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="rounded-3xl border-orange-200 bg-white/85 dark:border-orange-800 dark:bg-gray-900/80">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">Register Gym Member</CardTitle>
                  <CardDescription className="text-xs">
                    Create a permanent member profile for recurring gym passes or PT packages.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegisterMember} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="First name *"
                        value={newMemberFirst}
                        onChange={(e) => setNewMemberFirst(e.target.value)}
                        required
                      />
                      <Input
                        placeholder="Last name *"
                        value={newMemberLast}
                        onChange={(e) => setNewMemberLast(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Phone number *"
                        value={newMemberPhone}
                        onChange={(e) => setNewMemberPhone(e.target.value)}
                        required
                      />
                      <Input
                        type="email"
                        placeholder="Email (optional)"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={busyAction === "register-member"}
                      className="rounded-2xl bg-orange-600 text-white hover:bg-orange-700"
                    >
                      <UserPlus className="mr-1.5 h-4 w-4" />
                      Register Member
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-orange-200 bg-white/85 dark:border-orange-800 dark:bg-gray-900/80">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">
                    Enroll in Membership Subscription
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Assign a Weekly, Monthly, Quarterly, or Annual pass and settle through Finance.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateMembership} className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select value={subMemberId} onValueChange={setSubMemberId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select member..." />
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.first_name} {m.last_name} ({m.member_number})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={subPlanId} onValueChange={setSubPlanId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select membership plan..." />
                        </SelectTrigger>
                        <SelectContent>
                          {plans
                            .filter((p) => p.is_active && p.plan_type === "membership")
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — GHS {Number(p.base_price).toFixed(2)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={subStartDate}
                        onChange={(e) => setSubStartDate(e.target.value)}
                        className="max-w-[200px]"
                      />
                      <Button
                        type="submit"
                        disabled={!subMemberId || !subPlanId || busyAction === "create-membership"}
                        className="rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                      >
                        Enroll &amp; Invoice
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-3xl border-orange-200 bg-white/85 dark:border-orange-800 dark:bg-gray-900/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">
                  Membership Subscriptions ({memberships.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {memberships.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No recurring memberships enrolled yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="p-2.5">Subscription #</th>
                          <th className="p-2.5">Member</th>
                          <th className="p-2.5">Plan</th>
                          <th className="p-2.5">Validity</th>
                          <th className="p-2.5">Total / Balance</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memberships.map((ms) => {
                          const bal = Number(ms.balance_due) || 0;
                          return (
                            <tr key={ms.id} className="border-b last:border-0">
                              <td className="p-2.5 font-mono text-xs font-semibold">
                                {ms.membership_number}
                              </td>
                              <td className="p-2.5">
                                {ms.first_name} {ms.last_name}
                              </td>
                              <td className="p-2.5">{ms.plan_name}</td>
                              <td className="p-2.5 text-xs">
                                {ms.start_date} → {ms.end_date}
                              </td>
                              <td className="p-2.5 text-xs">
                                <span className="font-semibold">
                                  GHS {Number(ms.total_invoiced).toFixed(2)}
                                </span>
                                {bal > 0.01 && (
                                  <span className="ml-1.5 text-amber-700 dark:text-amber-300">
                                    (Due: GHS {bal.toFixed(2)})
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5">
                                <Badge variant="outline" className="capitalize text-xs">
                                  {ms.status.replace("_", " ")}
                                </Badge>
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="flex justify-end gap-1.5">
                                  {bal > 0.01 && ms.finance_status !== "pending_verification" && (
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setPaymentModal({
                                          open: true,
                                          targetType: "membership",
                                          targetId: ms.id,
                                          referenceNumber: ms.membership_number,
                                          customerName: `${ms.first_name} ${ms.last_name}`,
                                          balanceDue: bal,
                                        });
                                        setPaymentAmount(bal.toFixed(2));
                                        setPaymentMethod("cash");
                                      }}
                                      className="h-7 rounded-xl bg-orange-600 text-xs text-white"
                                    >
                                      Pay
                                    </Button>
                                  )}
                                  {Number(ms.total_paid) > 0 && (
                                    <Button
                                      asChild
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 rounded-xl text-xs"
                                    >
                                      <Link
                                        href={`/receipt?orderNumber=${encodeURIComponent(ms.membership_number)}&source=gym`}
                                      >
                                        <ExternalLink className="mr-1 h-3 w-3" />
                                        Receipt
                                      </Link>
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: FINANCE DEPARTMENT SETTLEMENT & REFUNDS */}
          <TabsContent value="finance" className="space-y-5">
            <Card className="rounded-3xl border-orange-200 bg-white/85 dark:border-orange-800 dark:bg-gray-900/80">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <ShieldCheck className="h-5 w-5 text-orange-600" />
                  Gym Payment Verification &amp; Finance Ledger Queue
                </CardTitle>
                <CardDescription className="text-xs">
                  Desk payments (`cash`, `card`, `mobile_money`) post immediately to the canonical
                  financial ledger (`Gym &amp; Fitness` department) and await Finance reconciliation.
                  Bank transfers require Finance verification before activation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No Gym payment transactions recorded yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="p-2.5">Payment Ref</th>
                          <th className="p-2.5">Order / Member</th>
                          <th className="p-2.5">Amount</th>
                          <th className="p-2.5">Method</th>
                          <th className="p-2.5">Ledger Status</th>
                          <th className="p-2.5">Finance Verification</th>
                          <th className="p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p) => (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="p-2.5 font-mono text-xs font-semibold">
                              {p.payment_reference}
                            </td>
                            <td className="p-2.5 text-xs">
                              <div className="font-medium">
                                {p.first_name} {p.last_name}
                              </div>
                              <div className="text-muted-foreground">
                                {p.booking_number || p.membership_number || "Gym"}
                              </div>
                            </td>
                            <td className="p-2.5 font-semibold">
                              GHS {Number(p.amount).toFixed(2)}
                            </td>
                            <td className="p-2.5 capitalize text-xs">
                              {p.method.replaceAll("_", " ")}
                            </td>
                            <td className="p-2.5 capitalize text-xs">{p.status}</td>
                            <td className="p-2.5">
                              <Badge
                                variant="outline"
                                className={`text-[11px] capitalize ${
                                  p.verification_status === "verified_by_finance"
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                    : p.verification_status === "pending_verification"
                                      ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                                      : ""
                                }`}
                              >
                                {p.verification_status.replaceAll("_", " ")}
                              </Badge>
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="flex justify-end gap-1.5">
                                {canApproveFinance &&
                                  p.verification_status === "pending_verification" && (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() =>
                                          void handleFinancePaymentAction(p.id, "approve_and_post")
                                        }
                                        className="h-7 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                                      >
                                        Approve &amp; Post
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          void handleFinancePaymentAction(p.id, "reject")
                                        }
                                        className="h-7 rounded-xl text-xs text-destructive"
                                      >
                                        Reject
                                      </Button>
                                    </>
                                  )}

                                {canApproveFinance &&
                                  p.verification_status === "pending_reconciliation" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        void handleFinancePaymentAction(p.id, "reconcile")
                                      }
                                      className="h-7 rounded-xl border-emerald-300 text-xs text-emerald-700"
                                    >
                                      Mark Reconciled
                                    </Button>
                                  )}

                                {p.status === "completed" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setRefundModal({
                                        open: true,
                                        paymentId: p.id,
                                        paymentReference: p.payment_reference,
                                        maxAmount: Number(p.amount),
                                      });
                                      setRefundAmount(Number(p.amount).toFixed(2));
                                    }}
                                    className="h-7 rounded-xl text-xs"
                                  >
                                    <RotateCcw className="mr-1 h-3 w-3" />
                                    Refund
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-orange-200 bg-white/85 dark:border-orange-800 dark:bg-gray-900/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">
                  Gym Refund Requests ({refunds.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Approved refunds create an audited debit reversal in `canonical_financial_ledger`.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {refunds.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No Gym refund requests submitted.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {refunds.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 text-sm"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold">{r.refund_number}</span>
                            <Badge variant="outline" className="capitalize text-xs">
                              {r.status.replaceAll("_", " ")}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {r.first_name} {r.last_name} · Payment {r.payment_reference} · Reason:{" "}
                            {r.reason}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-destructive">
                            GHS {Number(r.amount).toFixed(2)}
                          </span>
                          {canApproveFinance && r.status === "pending_finance_approval" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => void handleFinanceRefundDecision(r.id, "approve")}
                                className="h-7 rounded-xl bg-emerald-600 text-xs text-white"
                              >
                                Approve Refund
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleFinanceRefundDecision(r.id, "reject")}
                                className="h-7 rounded-xl text-xs text-destructive"
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: GYM PLANS & RATES */}
          <TabsContent value="plans" className="space-y-4">
            {canManagePlans && (
              <Card className="rounded-3xl border-orange-200 bg-white/85 dark:border-orange-800 dark:bg-gray-900/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">Add Custom Gym Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreatePlan} className="grid gap-3 sm:grid-cols-5">
                    <Input
                      placeholder="Plan name *"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      required
                    />
                    <Select value={planType} onValueChange={setPlanType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="walk_in_session">Walk-In Session</SelectItem>
                        <SelectItem value="day_pass">Day Pass</SelectItem>
                        <SelectItem value="personal_training">Personal Training</SelectItem>
                        <SelectItem value="membership">Recurring Membership</SelectItem>
                        <SelectItem value="corporate">Corporate Wellness</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      placeholder="Duration (days)"
                      value={planDuration}
                      onChange={(e) => setPlanDuration(e.target.value)}
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Base Price (GHS) *"
                      value={planPrice}
                      onChange={(e) => setPlanPrice(e.target.value)}
                      required
                    />
                    <Button type="submit" className="rounded-2xl bg-orange-600 text-white">
                      Save Plan
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => (
                <Card
                  key={p.id}
                  className="rounded-3xl border-orange-200 bg-white/85 dark:border-orange-800 dark:bg-gray-900/80"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="capitalize text-[11px]">
                        {p.plan_type.replaceAll("_", " ")}
                      </Badge>
                      <span className="font-mono text-[11px] text-muted-foreground">{p.code}</span>
                    </div>
                    <CardTitle className="pt-1 text-base font-bold">{p.name}</CardTitle>
                    <CardDescription className="text-xs">{p.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                        GHS {Number(p.base_price).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.duration_days} day(s) · Max {p.max_capacity_per_slot}/slot
                      </p>
                    </div>
                    {p.includes_trainer && (
                      <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        Includes Coach
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Payment Settlement Modal */}
      <Dialog
        open={Boolean(paymentModal?.open)}
        onOpenChange={(open) => !open && setPaymentModal(null)}
      >
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Settle Gym Payment ({paymentModal?.referenceNumber})</DialogTitle>
            <DialogDescription>
              Customer: {paymentModal?.customerName} · Balance Due: GHS{" "}
              {paymentModal?.balanceDue.toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitPayment} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Settlement Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash (Immediate Ledger Post)</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money (MoMo)</SelectItem>
                  <SelectItem value="card">POS Card Terminal</SelectItem>
                  <SelectItem value="bank_transfer">
                    Bank Transfer (Requires Finance Verification)
                  </SelectItem>
                  {checkedInGuests.length > 0 && (
                    <SelectItem value="room_charge">
                      Charge to Checked-In Hotel Guest Folio
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "room_charge" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Checked-In Hotel Room *</Label>
                <Select value={paymentReservationId} onValueChange={setPaymentReservationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose checked-in guest room..." />
                  </SelectTrigger>
                  <SelectContent>
                    {checkedInGuests.map((g) => (
                      <SelectItem key={g.reservation_id} value={g.reservation_id}>
                        Room {g.room_number || "—"} · {g.first_name} {g.last_name} (
                        {g.reservation_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Amount (GHS)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={paymentModal?.balanceDue}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                required
              />
            </div>

            {paymentMethod !== "cash" && paymentMethod !== "room_charge" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Transaction / MoMo / Bank Reference</Label>
                <Input
                  placeholder="Enter slip or MoMo reference..."
                  value={paymentRefInput}
                  onChange={(e) => setPaymentRefInput(e.target.value)}
                />
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setPaymentModal(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busyAction === "submit-payment"}
                className="bg-orange-600 text-white hover:bg-orange-700"
              >
                {busyAction === "submit-payment" ? "Processing..." : "Confirm Settlement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Refund Request Modal */}
      <Dialog
        open={Boolean(refundModal?.open)}
        onOpenChange={(open) => !open && setRefundModal(null)}
      >
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Finance Refund ({refundModal?.paymentReference})</DialogTitle>
            <DialogDescription>
              Submits a formal refund request to the Finance Department for approval and ledger
              reversal.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitRefundRequest} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Refund Amount (GHS)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={refundModal?.maxAmount}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason for Refund *</Label>
              <Input
                placeholder="Explain why this payment should be refunded..."
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                minLength={5}
                required
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setRefundModal(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busyAction === "submit-refund"}
                className="bg-orange-600 text-white"
              >
                Submit to Finance
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
