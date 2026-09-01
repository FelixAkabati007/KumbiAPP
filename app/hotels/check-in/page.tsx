"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DoorOpen, DoorClosed, Search, ArrowLeft, Receipt } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";

interface CheckInData {
  id: string;
  reservation_number: string;
  first_name: string;
  last_name: string;
  check_in_date: string;
  check_out_date: string;
  room_type_id: string;
  room_type_name: string;
  number_of_guests: number;
  special_requests?: string;
}

interface AvailableRoom {
  id: string;
  room_number: string;
  floor?: number;
  room_type_id: string;
}

interface CheckedInGuest {
  id: string;
  reservation_number: string;
  room_id: string | null;
  room_number: string | null;
  room_type_name: string;
  first_name: string;
  last_name: string;
  check_in_date: string;
  check_out_date: string;
  total_charges: string | null;
  paid_amount: string | null;
  balance: string | null;
}

interface GuestFolio {
  id: string;
  reservation_id: string;
  room_charge: string;
  service_charges: string;
  food_charges: string;
  other_charges: string;
  total_charges: string;
  paid_amount: string;
  balance: string;
  reservation_number: string;
  first_name: string;
  last_name: string;
  room_number: string | null;
}

function CheckInPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<CheckInData[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<CheckInData[]>([]);
  const [checkedInGuests, setCheckedInGuests] = useState<CheckedInGuest[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingCheckedIn, setLoadingCheckedIn] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  // Room selection dialog state for check-in
  const [selectedReservation, setSelectedReservation] = useState<CheckInData | null>(null);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Checkout dialog state
  const [checkoutGuest, setCheckoutGuest] = useState<CheckedInGuest | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  // Guest folio panel state
  const [folioGuest, setFolioGuest] = useState<CheckedInGuest | null>(null);
  const [folio, setFolio] = useState<GuestFolio | null>(null);
  const [loadingFolio, setLoadingFolio] = useState(false);
  const [chargeType, setChargeType] = useState<"service" | "food" | "other">("service");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [addingCharge, setAddingCharge] = useState(false);

  const fetchReservations = async () => {
    try {
      const response = await fetch("/api/hotels/reservations?status=confirmed", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch reservations");
      const data = await response.json();
      setReservations(data);
      setFilteredReservations(data);
    } catch (error) {
      console.error("Error fetching reservations:", error);
      toast({
        title: "Error",
        description: "Failed to load reservations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCheckedInGuests = async (): Promise<CheckedInGuest[]> => {
    try {
      const response = await fetch(`/api/hotels/checked-in?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch checked-in guests");
      const data = await response.json();
      setCheckedInGuests(data);
      return data;
    } catch (error) {
      console.error("Error fetching checked-in guests:", error);
      toast({
        title: "Error",
        description: "Failed to load checked-in guests",
        variant: "destructive",
      });
      throw error;
    } finally {
      setLoadingCheckedIn(false);
    }
  };

  useEffect(() => {
    fetchReservations();
    fetchCheckedInGuests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    const filtered = reservations.filter(
      (res) =>
        res.reservation_number.toLowerCase().includes(value.toLowerCase()) ||
        res.first_name.toLowerCase().includes(value.toLowerCase()) ||
        res.last_name.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredReservations(filtered);
  };

  const openRoomSelection = async (reservation: CheckInData) => {
    setSelectedReservation(reservation);
    setSelectedRoomId("");
    setLoadingRooms(true);
    try {
      const response = await fetch(
        `/api/hotels/rooms?status=available&roomTypeId=${reservation.room_type_id}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Failed to fetch available rooms");
      const data = await response.json();
      setAvailableRooms(data);
    } catch (error) {
      console.error("Error fetching available rooms:", error);
      toast({
        title: "Error",
        description: "Failed to load available rooms",
        variant: "destructive",
      });
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleCheckIn = async () => {
    if (processing) return;
    if (!selectedReservation || !selectedRoomId) {
      toast({
        title: "Select a room",
        description: "Please choose an available room before checking in.",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/hotels/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: selectedReservation.id,
          roomId: selectedRoomId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to check in guest");
      }

      toast({
        title: "Success",
        description: "Guest checked in successfully",
      });

      window.dispatchEvent(new Event("roomStatusUpdated"));
      window.dispatchEvent(new Event("reservationUpdated"));
      setSelectedReservation(null);
      setSelectedRoomId("");
      await Promise.all([fetchReservations(), fetchCheckedInGuests()]);
    } catch (error) {
      console.error("Error checking in guest:", error);
      toast({
        title: "Error",
        description: "Failed to check in guest",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const openCheckout = (guest: CheckedInGuest) => {
    setCheckoutGuest(guest);
    setPaymentAmount(guest.balance && Number(guest.balance) > 0 ? guest.balance : "");
  };

  const handleCheckOut = async () => {
    if (processing) return;
    if (!checkoutGuest || !checkoutGuest.room_id) {
      toast({
        title: "Error",
        description: "This reservation has no assigned room to check out from.",
        variant: "destructive",
      });
      return;
    }

    const paid = paymentAmount.trim() === "" ? 0 : Number(paymentAmount);
    const balance = Number(checkoutGuest.balance || 0);
    if (!Number.isFinite(paid) || paid < 0 || paid > balance) {
      toast({ title: "Invalid payment", description: `Enter an amount from GHS 0.00 to GHS ${balance.toFixed(2)}.`, variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      const response = await fetch("/api/hotels/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: checkoutGuest.id,
          roomId: checkoutGuest.room_id,
          balancePaid: paid,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to check out guest");
      }

      const refreshedGuests = await fetchCheckedInGuests();
      if (refreshedGuests.some((guest) => String(guest.id) === String(checkoutGuest.id))) {
        throw new Error("Checkout did not persist; the guest is still checked in.");
      }

      window.dispatchEvent(new Event("roomStatusUpdated"));
      window.dispatchEvent(new Event("housekeepingUpdated"));
      window.dispatchEvent(new Event("reservationUpdated"));
      setCheckoutGuest(null);
      setPaymentAmount("");
      toast({
        title: "Success",
        description: "Guest checked out successfully",
      });
    } catch (error) {
      console.error("Error checking out guest:", error);
      toast({
        title: "Check-out failed",
        description: error instanceof Error ? error.message : "Failed to check out guest",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const openFolio = async (guest: CheckedInGuest) => {
    setFolioGuest(guest);
    setFolio(null);
    setChargeType("service");
    setChargeAmount("");
    setChargeDescription("");
    setLoadingFolio(true);
    try {
      const response = await fetch(`/api/hotels/folios/${guest.id}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch folio");
      const data = await response.json();
      setFolio(data);
    } catch (error) {
      console.error("Error fetching folio:", error);
      toast({
        title: "Error",
        description: "Failed to load guest folio",
        variant: "destructive",
      });
    } finally {
      setLoadingFolio(false);
    }
  };

  const handleAddCharge = async () => {
    if (!folioGuest) return;
    const amount = Number(chargeAmount);
    if (!chargeAmount || isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a charge amount greater than zero.",
        variant: "destructive",
      });
      return;
    }

    setAddingCharge(true);
    try {
      const response = await fetch(`/api/hotels/folios/${folioGuest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeType,
          amount,
          description: chargeDescription || undefined,
        }),
      });
      if (!response.ok) throw new Error("Failed to add charge");
      const data = await response.json();
      setFolio(data);
      setChargeAmount("");
      setChargeDescription("");
      toast({ title: "Charge added", description: "Folio balance updated" });
      await fetchCheckedInGuests();
    } catch (error) {
      console.error("Error adding charge:", error);
      toast({
        title: "Error",
        description: "Failed to add charge",
        variant: "destructive",
      });
    } finally {
      setAddingCharge(false);
    }
  };

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center gap-4">
        <Button
          onClick={() => router.back()}
          variant="outline"
          size="icon"
          className="rounded-full border-orange-200 dark:border-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/30"
        >
          <ArrowLeft className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        </Button>
        <h2 className="text-3xl font-bold tracking-tight">Check-In / Check-Out</h2>
      </div>

      <Tabs defaultValue="check-in" className="space-y-4">
        <TabsList>
          <TabsTrigger value="check-in">
            <DoorOpen className="h-4 w-4 mr-2" />
            Check-In
          </TabsTrigger>
          <TabsTrigger value="check-out">
            <DoorClosed className="h-4 w-4 mr-2" />
            Check-Out
          </TabsTrigger>
        </TabsList>

        <TabsContent value="check-in">
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-orange-200 dark:border-orange-700 rounded-3xl">
            <CardHeader>
              <CardTitle>Check-In Management</CardTitle>
              <CardDescription>Process guest check-ins for reservations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by reservation number, guest name..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-10 rounded-2xl border-orange-200 dark:border-orange-700"
                  />
                </div>
              </div>

              {loading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : filteredReservations.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DoorOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {searchTerm ? "No reservations match your search" : "No pending reservations"}
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredReservations.map((res) => (
                    <Card
                      key={res.id}
                      className="bg-gradient-to-r from-orange-50/50 via-amber-50/50 to-yellow-50/50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 border-orange-200 dark:border-orange-700 rounded-2xl"
                    >
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                          <div>
                            <p className="text-xs text-muted-foreground">Reservation</p>
                            <p className="font-semibold">{res.reservation_number}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Guest</p>
                            <p className="font-semibold">
                              {res.first_name} {res.last_name}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Check-In</p>
                            <p className="font-semibold">
                              {new Date(res.check_in_date).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Room Type</p>
                            <p className="font-semibold">{res.room_type_name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Guests</p>
                            <p className="font-semibold">{res.number_of_guests}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => openRoomSelection(res)}
                              disabled={processing}
                              className="flex-1 rounded-lg bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
                            >
                              <DoorOpen className="h-4 w-4 mr-2" />
                              Check In
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="check-out">
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-orange-200 dark:border-orange-700 rounded-3xl">
            <CardHeader>
              <CardTitle>Check-Out Management</CardTitle>
              <CardDescription>
                Guests currently in-house, with outstanding folio balances
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingCheckedIn ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : checkedInGuests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DoorClosed className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  No guests currently checked in
                </div>
              ) : (
                <div className="grid gap-4">
                  {checkedInGuests.map((guest) => {
                    const balance = Number(guest.balance || 0);
                    return (
                      <Card
                        key={guest.id}
                        className="bg-gradient-to-r from-orange-50/50 via-amber-50/50 to-yellow-50/50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 border-orange-200 dark:border-orange-700 rounded-2xl"
                      >
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                            <div>
                              <p className="text-xs text-muted-foreground">Room</p>
                              <p className="font-semibold">{guest.room_number || "Unassigned"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Guest</p>
                              <p className="font-semibold">
                                {guest.first_name} {guest.last_name}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Check-Out Due</p>
                              <p className="font-semibold">
                                {new Date(guest.check_out_date).toLocaleDateString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Room Type</p>
                              <p className="font-semibold">{guest.room_type_name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Balance</p>
                              <Badge
                                className={
                                  balance > 0
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                    : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                }
                              >
                                GHS {balance.toFixed(2)}
                              </Badge>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => openFolio(guest)}
                                disabled={processing}
                                variant="outline"
                                className="flex-1 rounded-lg border-orange-200 dark:border-orange-700"
                              >
                                <Receipt className="h-4 w-4 mr-2" />
                                Folio
                              </Button>
                              <Button
                                onClick={() => openCheckout(guest)}
                                disabled={processing}
                                className="flex-1 rounded-lg bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
                              >
                                <DoorClosed className="h-4 w-4 mr-2" />
                                Check Out
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Room selection dialog for check-in */}
      <Dialog
        open={!!selectedReservation}
        onOpenChange={(open) => !open && setSelectedReservation(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select a Room</DialogTitle>
            <DialogDescription>
              {selectedReservation &&
                `Assign an available ${selectedReservation.room_type_name} room to ${selectedReservation.first_name} ${selectedReservation.last_name}`}
            </DialogDescription>
          </DialogHeader>

          {loadingRooms ? (
            <Skeleton className="h-10 w-full" />
          ) : availableRooms.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No available rooms of this type right now.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="room-select">Available Rooms</Label>
              <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                <SelectTrigger id="room-select" className="rounded-lg">
                  <SelectValue placeholder="Choose a room" />
                </SelectTrigger>
                <SelectContent>
                  {availableRooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      Room {room.room_number}
                      {room.floor ? ` (Floor ${room.floor})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedReservation(null)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCheckIn}
              disabled={processing || !selectedRoomId}
              className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              {processing ? "Processing…" : "Confirm Check-In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout payment dialog */}
      <Dialog open={!!checkoutGuest} onOpenChange={(open) => { if (!open && !processing) { setCheckoutGuest(null); setPaymentAmount(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Check-Out</DialogTitle>
            <DialogDescription>
              {checkoutGuest &&
                `${checkoutGuest.first_name} ${checkoutGuest.last_name} — Room ${checkoutGuest.room_number || "N/A"}`}
            </DialogDescription>
          </DialogHeader>

          {checkoutGuest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Charges</p>
                  <p className="font-semibold">
                    GHS {Number(checkoutGuest.total_charges || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Outstanding Balance</p>
                  <p className="font-semibold">
                    GHS {Number(checkoutGuest.balance || 0).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment to Collect Now</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="rounded-lg"
                  placeholder="0.00"
                  aria-describedby="payment-amount-help"
                  inputMode="decimal"
                  max={checkoutGuest?.balance ? Number(checkoutGuest.balance) : undefined}
                />
                <p id="payment-amount-help" className="text-xs text-muted-foreground">
                  Enter 0 to check out without collecting payment.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setCheckoutGuest(null); setPaymentAmount(""); }}
              disabled={processing}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCheckOut}
              disabled={processing || !checkoutGuest || !Number.isFinite(Number(paymentAmount || 0)) || Number(paymentAmount || 0) < 0 || Number(paymentAmount || 0) > Number(checkoutGuest?.balance || 0)}
              className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              {processing ? "Processing…" : "Confirm Check-Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guest folio dialog */}
      <Dialog open={!!folioGuest} onOpenChange={(open) => !open && setFolioGuest(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Guest Folio</DialogTitle>
            <DialogDescription>
              {folioGuest &&
                `${folioGuest.first_name} ${folioGuest.last_name} — Room ${folioGuest.room_number || "N/A"} — ${folioGuest.reservation_number}`}
            </DialogDescription>
          </DialogHeader>

          {loadingFolio ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : folio ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm rounded-lg border border-orange-100 dark:border-orange-900/40 p-3">
                <div>
                  <p className="text-muted-foreground">Room Charges</p>
                  <p className="font-semibold">GHS {Number(folio.room_charge).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Service Charges</p>
                  <p className="font-semibold">GHS {Number(folio.service_charges).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Food & Beverage</p>
                  <p className="font-semibold">GHS {Number(folio.food_charges).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Other Charges</p>
                  <p className="font-semibold">GHS {Number(folio.other_charges).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Charges</p>
                  <p className="font-semibold">GHS {Number(folio.total_charges).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Paid</p>
                  <p className="font-semibold">GHS {Number(folio.paid_amount).toFixed(2)}</p>
                </div>
                <div className="col-span-2 border-t border-orange-100 dark:border-orange-900/40 pt-2">
                  <p className="text-muted-foreground">Outstanding Balance</p>
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                    GHS {Number(folio.balance).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium">Add a Charge</p>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={chargeType} onValueChange={(v) => setChargeType(v as typeof chargeType)}>
                    <SelectTrigger className="rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="service">Service</SelectItem>
                      <SelectItem value="food">Food & Beverage</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Amount (GHS)"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                    className="rounded-lg"
                  />
                </div>
                <Input
                  placeholder="Description (optional)"
                  value={chargeDescription}
                  onChange={(e) => setChargeDescription(e.target.value)}
                  className="rounded-lg"
                />
                <Button
                  onClick={handleAddCharge}
                  disabled={addingCharge || !chargeAmount}
                  className="w-full rounded-lg bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
                >
                  Add Charge
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No folio data available.</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFolioGuest(null)} className="rounded-lg">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CheckInPageGuarded() {
  return (
    <RoleGuard section="checkIn">
      <CheckInPage />
    </RoleGuard>
  );
}
