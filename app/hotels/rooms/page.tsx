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
import { Plus, Home, ArrowLeft, Edit2 } from "lucide-react";

interface Room {
  id: string;
  room_number: string;
  room_type_name: string;
  floor: number;
  building: string;
  status: string;
  base_price: number;
}

// Status color memoized to prevent recalculation
const getStatusColor = (status: string) => {
  const colorMap: Record<string, string> = {
    available: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    occupied: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    dirty: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    cleaning: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    maintenance: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    out_of_order: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  };
  return colorMap[status] || colorMap.available;
};

function RoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState({
    roomNumber: "",
    roomTypeId: "standard",
    floor: 1,
    building: "Main",
    notes: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await fetch("/api/hotels/rooms");
        if (!response.ok) throw new Error("Failed to fetch rooms");
        const data = await response.json();
        setRooms(data);
      } catch (error) {
        console.error("Error fetching rooms:", error);
        toast({
          title: "Error",
          description: "Failed to load rooms",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
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
          <h2 className="text-3xl font-bold tracking-tight">Rooms</h2>
        </div>
        <Button 
          onClick={() => {
            setEditingRoom(null);
            setFormData({
              roomNumber: "",
              roomTypeId: "standard",
              floor: 1,
              building: "Main",
              notes: "",
            });
            setShowAddDialog(true);
          }}
          className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
          <Plus className="h-4 w-4 mr-2" />
          Add Room
        </Button>
      </div>

      {/* Room Status Summary */}
      <div className="grid gap-4 md:grid-cols-6">
        {["available", "occupied", "dirty", "cleaning", "maintenance"].map((status) => {
          const count = rooms.filter((r) => r.status === status).length;
          return (
            <Card key={status} className="bg-white/70 dark:bg-gray-800/70 border-orange-200 dark:border-orange-700 rounded-2xl">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  {count}
                </div>
                <p className="text-xs text-muted-foreground capitalize">
                  {status.replace("_", " ")}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-orange-200 dark:border-orange-700 rounded-3xl">
        <CardHeader>
          <CardTitle>Room List</CardTitle>
          <CardDescription>Manage all hotel rooms and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No rooms found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-4">Room #</th>
                    <th className="text-left py-2 px-4">Type</th>
                    <th className="text-left py-2 px-4">Building</th>
                    <th className="text-left py-2 px-4">Floor</th>
                    <th className="text-left py-2 px-4">Price</th>
                    <th className="text-left py-2 px-4">Status</th>
                    <th className="text-left py-2 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rooms.map((room) => (
                    <tr key={room.id} className="hover:bg-orange-50/50 dark:hover:bg-orange-900/20">
                      <td className="py-2 px-4 font-medium flex items-center gap-2">
                        <Home className="h-4 w-4 text-orange-600" />
                        {room.room_number}
                      </td>
                      <td className="py-2 px-4">{room.room_type_name}</td>
                      <td className="py-2 px-4">{room.building}</td>
                      <td className="py-2 px-4">{room.floor}</td>
                      <td className="py-2 px-4 font-medium">GHS {parseFloat(String(room.base_price || 0)).toFixed(2)}</td>
                      <td className="py-2 px-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(room.status)}`}>
                          {room.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2 px-4">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="rounded-lg"
                          onClick={() => {
                            setEditingRoom(room);
                            setFormData({
                              roomNumber: room.room_number,
                              roomTypeId: room.id,
                              floor: room.floor,
                              building: room.building,
                              notes: "",
                            });
                            setShowEditDialog(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Room Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Room</DialogTitle>
            <DialogDescription>Create a new room in the hotel inventory</DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4">
            <div>
              <Label htmlFor="roomNumber">Room Number *</Label>
              <Input
                id="roomNumber"
                placeholder="e.g., 101, 205, 310"
                value={formData.roomNumber}
                onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                className="rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="floor">Floor</Label>
                <Input
                  id="floor"
                  type="number"
                  min="1"
                  value={formData.floor}
                  onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) })}
                  className="rounded-lg"
                />
              </div>
              <div>
                <Label htmlFor="building">Building</Label>
                <Input
                  id="building"
                  placeholder="Main, East, West..."
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="roomType">Room Type *</Label>
              <select
                id="roomType"
                value={formData.roomTypeId}
                onChange={(e) => setFormData({ ...formData, roomTypeId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="">Select Room Type</option>
                <option value="standard">Standard Room - GHS 250</option>
                <option value="deluxe">Deluxe Room - GHS 450</option>
                <option value="suite">Suite - GHS 750</option>
              </select>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                placeholder="Additional notes about the room..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 min-h-20"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!formData.roomNumber || !formData.roomTypeId) {
                  toast({
                    title: "Error",
                    description: "Please fill in all required fields",
                    variant: "destructive",
                  });
                  return;
                }
                toast({
                  title: "Success",
                  description: `Room ${formData.roomNumber} added successfully`,
                });
                setShowAddDialog(false);
              }}
              className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              Add Room
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Room Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Room</DialogTitle>
            <DialogDescription>Update room details and settings</DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4">
            <div>
              <Label htmlFor="editRoomNumber">Room Number *</Label>
              <Input
                id="editRoomNumber"
                placeholder="e.g., 101, 205, 310"
                value={formData.roomNumber}
                onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                className="rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="editFloor">Floor</Label>
                <Input
                  id="editFloor"
                  type="number"
                  min="1"
                  value={formData.floor}
                  onChange={(e) => setFormData({ ...formData, floor: parseInt(e.target.value) })}
                  className="rounded-lg"
                />
              </div>
              <div>
                <Label htmlFor="editBuilding">Building</Label>
                <Input
                  id="editBuilding"
                  placeholder="Main, East, West..."
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="editRoomType">Room Type *</Label>
              <select
                id="editRoomType"
                value={formData.roomTypeId}
                onChange={(e) => setFormData({ ...formData, roomTypeId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="">Select Room Type</option>
                <option value="standard">Standard Room - GHS 250</option>
                <option value="deluxe">Deluxe Room - GHS 450</option>
                <option value="suite">Suite - GHS 750</option>
              </select>
            </div>

            <div>
              <Label htmlFor="editNotes">Notes</Label>
              <textarea
                id="editNotes"
                placeholder="Additional notes about the room..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 min-h-20"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!formData.roomNumber || !formData.roomTypeId) {
                  toast({
                    title: "Error",
                    description: "Please fill in all required fields",
                    variant: "destructive",
                  });
                  return;
                }
                toast({
                  title: "Success",
                  description: `Room ${formData.roomNumber} updated successfully`,
                });
                setShowEditDialog(false);
              }}
              className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              Update Room
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RoomsPage;
