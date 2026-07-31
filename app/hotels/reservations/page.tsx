"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ArrowLeft } from "lucide-react";

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

export default function ReservationsPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchReservations = async () => {
      try {
        const response = await fetch("/api/hotels/reservations");
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

    fetchReservations();
  }, [toast]);

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
        <Button className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
          <Plus className="h-4 w-4 mr-2" />
          New Reservation
        </Button>
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
                      <td className="py-2 px-4 font-medium">GHS {res.total_price?.toFixed(2) || "0.00"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
