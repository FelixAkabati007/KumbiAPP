"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NextImage from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Home, ArrowLeft, Edit2, Trash2, Image as ImageIcon, X, Upload } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { LiveSyncToolbar, useHotelLiveSync } from "@/components/hotels/live-sync";

interface RoomImage {
  id: string;
  url: string;
  type: "blob" | "url";
  uploaded_at: string;
  is_primary?: boolean;
}

interface RoomType {
  id: string;
  name: string;
  base_price: number | string;
  max_occupants: number;
  is_active: boolean;
}

interface Room {
  id: string;
  room_number: string;
  room_type_id: string;
  room_type_name: string;
  floor: number;
  building: string;
  status: string;
  notes?: string;
  base_price: number;
  price?: number;
  images?: RoomImage[];
  guest_first_name?: string;
  guest_last_name?: string;
  check_in_date?: string;
  check_out_date?: string;
  assigned_housekeeper_name?: string;
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
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomTypesLoading, setRoomTypesLoading] = useState(true);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState({
    roomNumber: "",
    roomTypeId: "",
    floor: 1,
    building: "Main",
    notes: "",
    price: "",
    images: [] as RoomImage[],
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageInput, setImageInput] = useState("");
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const { toast } = useToast();

  // Handle file upload from computer
  const handleFileUpload = async (files: FileList | null) => {
  if (!files || files.length === 0) return;
  const selectedFiles = Array.from(files);
  const invalidFile = selectedFiles.find((file) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024);
  if (invalidFile) {
    toast({ title: "Invalid image", description: `${invalidFile.name} must be an image smaller than 5MB.`, variant: "destructive" });
    return;
  }
  if (formData.images.length + selectedFiles.length > 10) {
    toast({ title: "Too many images", description: "A room can have up to 10 images.", variant: "destructive" });
    return;
  }

  setUploadingImages(true);
    try {
      for (const file of Array.from(files)) {
        const formDataForUpload = new FormData();
        formDataForUpload.append("file", file);
        
        const response = await fetch("/api/hotels/rooms/upload", {
          method: "POST",
          body: formDataForUpload,
        });
        
        if (!response.ok) throw new Error("Upload failed");
        const { url } = await response.json();
        
        const newImage: RoomImage = {
          id: Math.random().toString(36).substr(2, 9),
          url,
          type: "blob",
          uploaded_at: new Date().toISOString(),
          is_primary: formData.images.length === 0,
        };
        
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, newImage],
        }));
        
        setPreviewImages(prev => [...prev, url]);
      }
      toast({
        title: "Success",
        description: "Images uploaded successfully",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Error",
        description: "Failed to upload images",
        variant: "destructive",
      });
    } finally {
      setUploadingImages(false);
    }
  };

  // Handle image URL input
  const handleAddImageUrl = () => {
    if (!imageInput.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid image URL",
        variant: "destructive",
      });
      return;
    }
    
    const newImage: RoomImage = {
      id: Math.random().toString(36).substr(2, 9),
      url: imageInput,
      type: "url",
      uploaded_at: new Date().toISOString(),
      is_primary: formData.images.length === 0,
    };
    
    setFormData(prev => ({
      ...prev,
      images: [...prev.images, newImage],
    }));
    
    setPreviewImages(prev => [...prev, imageInput]);
    setImageInput("");
  };

  // Remove image
  const handleRemoveImage = (id: string) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter(img => img.id !== id),
    }));
    setPreviewImages(prev => {
      const index = formData.images.findIndex(img => img.id === id);
      return prev.filter((_, i) => i !== index);
    });
  };

  const fetchRooms = async () => {
    try {
      const [response, roomTypesResponse] = await Promise.all([
        fetch(`/api/hotels/rooms?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/hotels/room-types?t=${Date.now()}`, { cache: "no-store" }),
      ]);
      if (!roomTypesResponse.ok) throw new Error("Failed to fetch room types");
      const liveRoomTypes = (await roomTypesResponse.json()) as RoomType[];
      setRoomTypes(liveRoomTypes);
      setFormData((current) => ({
        ...current,
        roomTypeId: current.roomTypeId && liveRoomTypes.some((type) => type.id === current.roomTypeId)
          ? current.roomTypeId
          : liveRoomTypes[0]?.id || "",
      }));
      if (!response.ok) throw new Error("Failed to fetch rooms");
      const data = await response.json();
      setRooms(data);
    } catch (error) {
      console.error("Error fetching rooms and room types:", error);
      toast({ title: "Error", description: "Failed to load rooms", variant: "destructive" });
    } finally {
      setLoading(false);
      setRoomTypesLoading(false);
    }
  };

  useEffect(() => {
    void fetchRooms();
    const refreshRooms = () => void fetchRooms();
    window.addEventListener("reservationUpdated", refreshRooms);
    window.addEventListener("roomStatusUpdated", refreshRooms);
    window.addEventListener("housekeepingUpdated", refreshRooms);
    return () => {
      window.removeEventListener("reservationUpdated", refreshRooms);
      window.removeEventListener("roomStatusUpdated", refreshRooms);
      window.removeEventListener("housekeepingUpdated", refreshRooms);
    };
  }, [toast]);

  const handleDeleteRoom = async (room: Room) => {
    if (!window.confirm(`Delete room ${room.room_number}? This will remove it from the active room list.`)) return;
    setDeletingRoomId(room.id);
    try {
      const response = await fetch(`/api/hotels/rooms/${room.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete room");
      }
      toast({ title: "Room deleted", description: `Room ${room.room_number} was removed from the active inventory.` });
      window.dispatchEvent(new Event("roomStatusUpdated"));
      await fetchRooms();
    } catch (error) {
      toast({ title: "Unable to delete room", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setDeletingRoomId(null);
    }
  };

  const liveSync = useHotelLiveSync(fetchRooms);

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
        <div className="flex items-center gap-2">
          <LiveSyncToolbar connected={liveSync.connected} refreshing={liveSync.refreshing} onRefresh={() => void liveSync.refresh()} />
          <Button
          onClick={() => {
            setEditingRoom(null);
            setFormData({
              roomNumber: "",
              roomTypeId: "",
              floor: 1,
              building: "Main",
              notes: "",
              price: "",
              images: [],
            });
            setPreviewImages([]);
            setImageInput("");
            setShowAddDialog(true);
          }}
          className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg">
          <Plus className="h-4 w-4 mr-2" />
          Add Room
        </Button>
        </div>
      </div>

      {/* Room Status Summary */}
      <div className="grid min-w-0 gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
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
            <div className="w-full min-w-0 overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-4">Room #</th>
                    <th className="text-left py-2 px-4">Image</th>
                    <th className="text-left py-2 px-4">Type</th>
                    <th className="text-left py-2 px-4">Building</th>
                    <th className="text-left py-2 px-4">Floor</th>
                    <th className="text-left py-2 px-4">Price</th>
                    <th className="text-left py-2 px-4">Status</th>
                    <th className="text-left py-2 px-4">Guest / Stay</th>
                    <th className="text-left py-2 px-4">Housekeeper</th>
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
                      <td className="py-2 px-4">
                        {room.images && room.images.length > 0 ? (
                          <NextImage
                            src={room.images[0].url}
                            alt={`Room ${room.room_number}`}
                            width={48}
                            height={48}
                            className="h-12 w-12 object-cover rounded"
                            unoptimized
                          />
                        ) : (
                          <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-4">{room.room_type_name}</td>
                      <td className="py-2 px-4">{room.building}</td>
                      <td className="py-2 px-4">{room.floor}</td>
                      <td className="py-2 px-4 font-medium">GHS {parseFloat(String(room.price || room.base_price || 0)).toFixed(2)}</td>
                      <td className="py-2 px-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(room.status)}`}>
                          {room.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2 px-4 min-w-48">
                        <div className="font-medium">
                          {room.guest_first_name
                            ? `${room.guest_first_name} ${room.guest_last_name ?? ""}`
                            : "—"}
                        </div>
                        {room.check_in_date && room.check_out_date && (
                          <div className="text-xs text-muted-foreground">
                            {room.check_in_date} → {room.check_out_date}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-4">
                        {room.assigned_housekeeper_name || "—"}
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
                              roomTypeId: room.room_type_id,
                              floor: room.floor,
                              building: room.building,
                              notes: room.notes || "",
                              price: room.price?.toString() || room.base_price?.toString() || "",
                              images: room.images || [],
                            });
                            setPreviewImages((room.images || []).map(img => img.url));
                            setImageInput("");
                            setShowEditDialog(true);
                          }}
                        >
                          <Edit2 className="mr-1 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void handleDeleteRoom(room)}
                          disabled={deletingRoomId === room.id}
                          aria-label={`Delete room ${room.room_number}`}
                          title={`Delete room ${room.room_number}`}
                        >
                          <Trash2 className="h-4 w-4" />
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                className="w-full px-3 py-2 border-2 border-orange-200 rounded-lg dark:bg-gray-700 dark:border-orange-700 focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 dark:hover:border-orange-600 transition"
              >
                <option value="">{roomTypesLoading ? "Loading room types..." : roomTypes.length === 0 ? "No active room types" : "Select Room Type"}</option>
                {roomTypes.map((roomType) => (
                  <option key={roomType.id} value={roomType.id}>
                    {roomType.name} · GHS {Number(roomType.base_price).toFixed(2)} · max {roomType.max_occupants}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                placeholder="Additional notes about the room..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border-2 border-orange-200 rounded-lg dark:bg-gray-700 dark:border-orange-700 focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 dark:hover:border-orange-600 transition min-h-20"
              />
            </div>

            <div>
              <Label htmlFor="price">Price (GHS) *</Label>
              <Input
                id="price"
                type="number"
                placeholder="e.g., 250, 450, 750"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">Set the per-room price in Ghana Cedis</p>
            </div>

            <div className="border-t pt-4">
              <Label className="text-base font-semibold mb-3 block">Room Images</Label>
              
              {/* Image Preview Gallery */}
              {previewImages.length > 0 && (
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {previewImages.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <NextImage
                        src={img}
                        alt={`Preview ${idx + 1}`}
                        width={200}
                        height={96}
                        className="w-full h-24 object-cover rounded-lg border border-gray-300"
                        unoptimized
                      />
                      <button
                        onClick={() => handleRemoveImage(formData.images[idx]?.id || "")}
                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {/* File Upload */}
                <div>
                  <Label htmlFor="fileUpload" className="block text-sm font-medium mb-2">
                    Upload from Computer
                  </Label>
                  <label htmlFor="fileUpload" className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-orange-300 rounded-lg cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition">
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-5 w-5 text-orange-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Click or drag images here
                      </span>
                    </div>
                    <input
                      id="fileUpload"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e.target.files)}
                      disabled={uploadingImages}
                      className="hidden"
                    />
                  </label>
                  {uploadingImages && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
                </div>

                {/* URL Input */}
                <div>
                  <Label htmlFor="imageUrl" className="block text-sm font-medium mb-2">
                    Or paste Image URL
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="imageUrl"
                      placeholder="https://example.com/image.jpg"
                      value={imageInput}
                      onChange={(e) => setImageInput(e.target.value)}
                      className="rounded-lg"
                    />
                    <Button
                      onClick={handleAddImageUrl}
                      variant="outline"
                      className="px-4"
                    >
                      Add URL
                    </Button>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Add 1-10 images. Recommended size: 800x600px or larger
              </p>
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
              onClick={async () => {
                if (!formData.roomNumber || !formData.roomTypeId || !formData.price) {
                  toast({
                    title: "Error",
                    description: "Please fill in all required fields (Room Number, Type, and Price)",
                    variant: "destructive",
                  });
                  return;
                }
                try {
                  const response = await fetch("/api/hotels/rooms", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      roomNumber: formData.roomNumber,
                      roomTypeId: formData.roomTypeId,
                      floor: formData.floor,
                      building: formData.building,
                      notes: formData.notes,
                      price: parseFloat(formData.price),
                      images: formData.images,
                    }),
                  });

                  if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "Failed to add room");
                  }

                  toast({
                    title: "Success",
                    description: `Room ${formData.roomNumber} added successfully`,
                  });

                  // Fetch updated rooms list
                  const roomsResponse = await fetch("/api/hotels/rooms");
                  if (roomsResponse.ok) {
                    const updatedRooms = await roomsResponse.json();
                    setRooms(updatedRooms);
                  }

                  setShowAddDialog(false);
                  setFormData({
                    roomNumber: "",
                    roomTypeId: "standard",
                    floor: 1,
                    building: "Main",
                    notes: "",
                    price: "",
                    images: [],
                  });
                  setPreviewImages([]);
                  setImageInput("");
                } catch (error) {
                  console.error("Error adding room:", error);
                  toast({
                    title: "Error",
                    description: error instanceof Error ? error.message : "Failed to add room",
                    variant: "destructive",
                  });
                }
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                className="w-full px-3 py-2 border-2 border-orange-200 rounded-lg dark:bg-gray-700 dark:border-orange-700 focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 dark:hover:border-orange-600 transition"
              >
                <option value="">{roomTypesLoading ? "Loading room types..." : roomTypes.length === 0 ? "No active room types" : "Select Room Type"}</option>
                {roomTypes.map((roomType) => (
                  <option key={roomType.id} value={roomType.id}>
                    {roomType.name} · GHS {Number(roomType.base_price).toFixed(2)} · max {roomType.max_occupants}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="editNotes">Notes</Label>
              <textarea
                id="editNotes"
                placeholder="Additional notes about the room..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border-2 border-orange-200 rounded-lg dark:bg-gray-700 dark:border-orange-700 focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 dark:hover:border-orange-600 transition min-h-20"
              />
            </div>

            <div>
              <Label htmlFor="editPrice">Price (GHS) *</Label>
              <Input
                id="editPrice"
                type="number"
                placeholder="e.g., 250, 450, 750"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">Update the per-room price in Ghana Cedis</p>
            </div>

            <div className="border-t pt-4">
              <Label className="text-base font-semibold mb-3 block">Room Images</Label>
              
              {/* Image Preview Gallery */}
              {previewImages.length > 0 && (
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {previewImages.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <NextImage
                        src={img}
                        alt={`Preview ${idx + 1}`}
                        width={200}
                        height={96}
                        className="w-full h-24 object-cover rounded-lg border border-gray-300"
                        unoptimized
                      />
                      <button
                        onClick={() => handleRemoveImage(formData.images[idx]?.id || "")}
                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {/* File Upload */}
                <div>
                  <Label htmlFor="editFileUpload" className="block text-sm font-medium mb-2">
                    Upload from Computer
                  </Label>
                  <label htmlFor="editFileUpload" className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-orange-300 rounded-lg cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition">
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-5 w-5 text-orange-500" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Click or drag images here
                      </span>
                    </div>
                    <input
                      id="editFileUpload"
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e.target.files)}
                      disabled={uploadingImages}
                      className="hidden"
                    />
                  </label>
                  {uploadingImages && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
                </div>

                {/* URL Input */}
                <div>
                  <Label htmlFor="editImageUrl" className="block text-sm font-medium mb-2">
                    Or paste Image URL
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="editImageUrl"
                      placeholder="https://example.com/image.jpg"
                      value={imageInput}
                      onChange={(e) => setImageInput(e.target.value)}
                      className="rounded-lg"
                    />
                    <Button
                      onClick={handleAddImageUrl}
                      variant="outline"
                      className="px-4"
                    >
                      Add URL
                    </Button>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Add 1-10 images. Recommended size: 800x600px or larger
              </p>
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
              onClick={async () => {
                if (!formData.roomNumber || !formData.roomTypeId || !formData.price) {
                  toast({
                    title: "Error",
                    description: "Please fill in all required fields (Room Number, Type, and Price)",
                    variant: "destructive",
                  });
                  return;
                }
                try {
                  if (!editingRoom) {
                    throw new Error("No room selected for editing");
                  }

                  const response = await fetch(`/api/hotels/rooms/${editingRoom.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      roomNumber: formData.roomNumber,
                      roomTypeId: formData.roomTypeId,
                      floor: formData.floor,
                      building: formData.building,
                      notes: formData.notes,
                      price: parseFloat(formData.price),
                      images: formData.images,
                    }),
                  });

                  if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "Failed to update room");
                  }

                  toast({
                    title: "Success",
                    description: `Room ${formData.roomNumber} updated successfully`,
                  });

                  // Fetch updated rooms list
                  const roomsResponse = await fetch("/api/hotels/rooms");
                  if (roomsResponse.ok) {
                    const updatedRooms = await roomsResponse.json();
                    setRooms(updatedRooms);
                  }

                  setShowEditDialog(false);
                  setEditingRoom(null);
                } catch (error) {
                  console.error("Error updating room:", error);
                  toast({
                    title: "Error",
                    description: error instanceof Error ? error.message : "Failed to update room",
                    variant: "destructive",
                  });
                }
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

export default function RoomsPageGuarded() {
  return (
    <RoleGuard section="rooms">
      <RoomsPage />
    </RoleGuard>
  );
}
