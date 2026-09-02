"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ArrowLeft } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { LiveSyncToolbar, useHotelLiveSync } from "@/components/hotels/live-sync";

interface Reservation {
  id: string;
  reservation_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  check_in_date: string;
  check_out_date: string;
  number_of_guests: number;
  status: string;
  total_price: number;
  room_type_name: string;
}

interface RoomType {
  id: string;
  name: string;
  base_price: number;
}

function ReservationsPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showNewReservationDialog, setShowNewReservationDialog] = useState(false);
  const [isReviewingReservation, setIsReviewingReservation] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    emergencyContact: "",
    checkInDate: "",
    checkOutDate: "",
    numberOfGuests: 1,
    roomTypeId: "",
  });
  const { toast } = useToast();

  const fetchReservations = async () => {
    try {
      const response = await fetch("/api/hotels/reservations", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch reservations");
      const data = await response.json();
      setReservations(data);
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

  useEffect(() => {
    fetchReservations();

    const fetchRoomTypes = async () => {
      try {
        const response = await fetch("/api/hotels/room-types", { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to fetch room types");
        const data = await response.json();
        setRoomTypes(data);
      } catch (error) {
        console.error("Error fetching room types:", error);
      }
    };

    fetchRoomTypes();

    const handleReservationUpdate = () => { void fetchReservations(); };
    window.addEventListener("reservationUpdated", handleReservationUpdate);
    window.addEventListener("hotelDataUpdated", handleReservationUpdate);
    return () => {
      window.removeEventListener("reservationUpdated", handleReservationUpdate);
      window.removeEventListener("hotelDataUpdated", handleReservationUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateReservation = async () => {
    if (!formData.firstName || !formData.phone || !formData.checkInDate || !formData.checkOutDate || !formData.roomTypeId || !formData.numberOfGuests || formData.numberOfGuests < 1) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const checkIn = new Date(formData.checkInDate);
    const checkOut = new Date(formData.checkOutDate);
    if (checkOut <= checkIn) {
      toast({
        title: "Error",
        description: "Check-out date must be after check-in date",
        variant: "destructive",
      });
      return;
    }

    if (!isReviewingReservation) {
      setIsReviewingReservation(true);
      return;
    }

    setSubmitting(true);
    try {
      const guestResponse = await fetch("/api/hotels/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          emergencyContact: formData.emergencyContact,
        }),
      });

      if (!guestResponse.ok) {
        const payload = await guestResponse.json().catch(() => null);
        throw new Error(payload?.error || "Failed to create guest");
      }
      const guest = await guestResponse.json();

      const roomType = roomTypes.find((rt) => rt.id === formData.roomTypeId);
      const nights = Math.max(
        1,
        Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
      );
      const totalPrice = roomType ? Number(roomType.base_price) * nights : 0;

      const reservationResponse = await fetch("/api/hotels/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: guest.id,
          roomTypeId: formData.roomTypeId,
          checkInDate: formData.checkInDate,
          checkOutDate: formData.checkOutDate,
          numberOfGuests: formData.numberOfGuests,
          totalPrice,
          source: "walk_in",
        }),
      });

      if (!reservationResponse.ok) {
        const payload = await reservationResponse.json().catch(() => null);
        throw new Error(payload?.error || "Failed to create reservation");
      }
      const reservation = await reservationResponse.json();

      toast({
        title: "Success",
        description: `Reservation ${reservation.reservation_number} created for ${formData.firstName} ${formData.lastName}`,
      });
      window.dispatchEvent(new Event("reservationUpdated"));
      setShowNewReservationDialog(false);
      setIsReviewingReservation(false);
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        emergencyContact: "",
        checkInDate: "",
        checkOutDate: "",
        numberOfGuests: 1,
        roomTypeId: "",
      });
      await fetchReservations();
    } catch (error) {
      console.error("Error creating reservation:", error);
      toast({
        title: "Error",
        description: "Failed to create reservation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const liveSync = useHotelLiveSync(fetchReservations);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => router.back()}
            variant="outline"
            size="icon"
            className="rounded-full border-orange-200 dark:border-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/30"
          >
            <ArrowLeft className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </Button>
          <h2 className="text-3xl font-bold tracking-tight">Reservations</h2>
        </div>
        <div className="flex items-center gap-2">
          <LiveSyncToolbar connected={liveSync.connected} refreshing={liveSync.refreshing} onRefresh={() => void liveSync.refresh()} />
          <Button
          onClick={() => setShowNewReservationDialog(true)}
          className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
          <Plus className="h-4 w-4 mr-2" />
          New Reservation
        </Button>
        </div>
      </div>

      <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-orange-200 dark:border-orange-700 rounded-3xl">
        <CardHeader>
          <CardTitle>Reservation List</CardTitle>
          <CardDescription>Manage all guest reservations</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : reservations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No reservations found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-4">Reservation #</th>
                    <th className="text-left py-2 px-4">Guest Name</th>
                    <th className="text-left py-2 px-4">Check-in</th>
                    <th className="text-left py-2 px-4">Check-out</th>
                    <th className="text-left py-2 px-4">Guests</th>
                    <th className="text-left py-2 px-4">Room Type</th>
                    <th className="text-left py-2 px-4">Status</th>
                    <th className="text-left py-2 px-4">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reservations.map((res) => (
                    <tr key={res.id} className="hover:bg-orange-50/50 dark:hover:bg-orange-900/20">
                      <td className="py-2 px-4 font-medium">{res.reservation_number}</td>
                      <td className="py-2 px-4">{res.first_name} {res.last_name}</td>
                      <td className="py-2 px-4">{new Date(res.check_in_date).toLocaleDateString()}</td>
                      <td className="py-2 px-4">{new Date(res.check_out_date).toLocaleDateString()}</td>
                      <td className="py-2 px-4">{res.number_of_guests}</td>
                      <td className="py-2 px-4">{res.room_type_name}</td>
                      <td className="py-2 px-4">
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                          {res.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 font-medium">GHS {Number(res.total_price || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Reservation Dialog */}
      <Dialog open={showNewReservationDialog} onOpenChange={setShowNewReservationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isReviewingReservation ? "Verify Reservation Details" : "Create New Reservation"}</DialogTitle>
            <DialogDescription>
              {isReviewingReservation
                ? "Review the details below, then select Proceed to Book to finalize."
                : "Enter guest details to create a new reservation"}
            </DialogDescription>
          </DialogHeader>
          {isReviewingReservation && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm dark:border-orange-700 dark:bg-orange-950/30">
              <p className="font-medium">{formData.firstName} {formData.lastName}</p>
              <p>{formData.checkInDate} to {formData.checkOutDate} · {formData.numberOfGuests} guest(s)</p>
              <p>{roomTypes.find((rt) => rt.id === formData.roomTypeId)?.name ?? "Room type not selected"}</p>
            </div>
          )}
          
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="rounded-lg"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Surname <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="rounded-lg"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Input
                  id="phone"
                  placeholder="+233501234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="emergencyContact">Emergency Contact <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="emergencyContact" placeholder="Name and phone number" value={formData.emergencyContact} onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })} className="rounded-lg" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="checkInDate">Check-in Date <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Input
                  id="checkInDate"
                  type="date"
                  value={formData.checkInDate}
                  onChange={(e) => setFormData({ ...formData, checkInDate: e.target.value })}
                  className="rounded-lg"
                />
              </div>
              <div>
                <Label htmlFor="checkOutDate">Check-out Date <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Input
                  id="checkOutDate"
                  type="date"
                  value={formData.checkOutDate}
                  onChange={(e) => setFormData({ ...formData, checkOutDate: e.target.value })}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="guests">Number of Guests <span className="text-destructive" aria-hidden="true">*</span></Label>
                <Input
                  id="guests"
                  type="number"
                  min="1"
                  value={formData.numberOfGuests}
                  onChange={(e) => setFormData({ ...formData, numberOfGuests: parseInt(e.target.value) })}
                  className="rounded-lg"
                />
              </div>
              <div>
                <Label htmlFor="roomType">Room Type <span className="text-destructive" aria-hidden="true">*</span></Label>
                <select
                  id="roomType"
                  value={formData.roomTypeId}
                  onChange={(e) => setFormData({ ...formData, roomTypeId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="">Select Room Type</option>
                  {roomTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name} - GHS {Number(rt.base_price).toFixed(0)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsReviewingReservation(false);
                setShowNewReservationDialog(false);
              }}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateReservation}
              disabled={submitting}
              className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              {submitting
                ? "Creating..."
                : isReviewingReservation
                  ? "Proceed to Book"
                  : "Review Reservation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ReservationsPageGuarded() {
  return (
    <RoleGuard section="reservations">
      <ReservationsPage />
    </RoleGuard>
  );
}
