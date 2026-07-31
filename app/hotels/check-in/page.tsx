"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DoorOpen, Search, ArrowLeft } from "lucide-react";

interface CheckInData {
  id: string;
  reservation_number: string;
  first_name: string;
  last_name: string;
  check_in_date: string;
  check_out_date: string;
  room_type_name: string;
  number_of_guests: number;
  special_requests?: string;
}

export default function CheckInPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<CheckInData[]>([]);
  const [filteredReservations, setFilteredReservations] = useState<CheckInData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchReservations = async () => {
      try {
        const response = await fetch("/api/hotels/reservations?status=confirmed");
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

    fetchReservations();
  }, [toast]);

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

  const handleCheckIn = async (reservationId: string) => {
    setProcessing(true);
    try {
      // Note: In a real implementation, you would need to select a room first
      const response = await fetch("/api/hotels/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId,
          roomId: "", // This should be selected from available rooms
        }),
      });

      if (!response.ok) throw new Error("Failed to check in guest");

      toast({
        title: "Success",
        description: "Guest checked in successfully",
      });

      // Refresh reservations
      const res = await fetch("/api/hotels/reservations?status=confirmed");
      const data = await res.json();
      setReservations(data);
      setFilteredReservations(data);
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
        <h2 className="text-3xl font-bold tracking-tight">Guest Check-In</h2>
      </div>

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
                <Card key={res.id} className="bg-gradient-to-r from-orange-50/50 via-amber-50/50 to-yellow-50/50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 border-orange-200 dark:border-orange-700 rounded-2xl">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Reservation</p>
                        <p className="font-semibold">{res.reservation_number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Guest</p>
                        <p className="font-semibold">{res.first_name} {res.last_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Check-In</p>
                        <p className="font-semibold">{new Date(res.check_in_date).toLocaleDateString()}</p>
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
                          onClick={() => handleCheckIn(res.id)}
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
    </div>
  );
}
