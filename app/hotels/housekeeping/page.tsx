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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, CheckCircle2, ArrowLeft, Wrench, SprayCan } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/components/auth-provider";
import { LiveSyncToolbar, useHotelLiveSync } from "@/components/hotels/live-sync";

interface HousekeepingTask {
  id: string;
  room_number: string;
  task_type: string;
  status: string;
  priority: string;
  assigned_to_name?: string;
  notes?: string;
  created_at: string;
}

interface MaintenanceTicket {
  id: string;
  ticket_number: string;
  room_number: string | null;
  issue_description: string;
  severity: string;
  status: string;
  assigned_to_name?: string;
  notes?: string;
  created_at: string;
}

interface RoomOption {
  id: string;
  room_number: string;
  status: string;
}

interface HousekeepingStaff {
  id: string;
  name: string;
  email: string;
}

function readTaskNotes(notes?: string) {
  if (!notes) return { details: "", shiftLabel: "", shiftStart: "", shiftEnd: "" };
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Preserve legacy plain-text notes.
  }
  return { details: notes, shiftLabel: "", shiftStart: "", shiftEnd: "" };
}

function HousekeepingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isHousekeeping = user?.role === "housekeeping";
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [staff, setStaff] = useState<HousekeepingStaff[]>([]);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [formData, setFormData] = useState({
    roomNumber: "",
    taskType: "cleaning",
    priority: "normal",
    assignedTo: "",
    shiftStart: new Date().toISOString().slice(0, 10),
    shiftEnd: new Date().toISOString().slice(0, 10),
    shiftLabel: "Day shift",
    notes: "",
  });

  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [showNewTicketDialog, setShowNewTicketDialog] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    roomNumber: "",
    issueDescription: "",
    severity: "normal",
    notes: "",
  });

  const { toast } = useToast();

  const fetchTasks = async () => {
    try {
      const response = await fetch("/api/hotels/housekeeping", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch housekeeping tasks");
      const data = await response.json();
      setTasks(data);
    } catch (error) {
      console.error("Error fetching housekeeping tasks:", error);
      toast({
        title: "Error",
        description: "Failed to load housekeeping tasks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTickets = async () => {
    try {
      const response = await fetch("/api/hotels/maintenance", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch maintenance tickets");
      const data = await response.json();
      setTickets(data);
    } catch (error) {
      console.error("Error fetching maintenance tickets:", error);
      toast({
        title: "Error",
        description: "Failed to load maintenance tickets",
        variant: "destructive",
      });
    } finally {
      setLoadingTickets(false);
    }
  };

  const fetchRooms = async () => {
    try {
      const response = await fetch("/api/hotels/rooms", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch rooms");
      setRooms(await response.json());
    } catch (error) {
      console.error("Error fetching rooms:", error);
    }
  };

  const fetchStaff = async () => {
    try {
      const response = await fetch("/api/hotels/housekeeping/staff", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to fetch housekeeping staff");
      setStaff(await response.json());
    } catch (error) {
      console.error("Error fetching housekeeping staff:", error);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchTickets();
    fetchRooms();
    fetchStaff();
    const refreshHousekeeping = () => {
      fetchTasks();
      fetchTickets();
      fetchRooms();
      fetchStaff();
    };
    window.addEventListener("housekeepingUpdated", refreshHousekeeping);
    window.addEventListener("roomStatusUpdated", refreshHousekeeping);
    window.addEventListener("reservationUpdated", refreshHousekeeping);
    return () => {
      window.removeEventListener("housekeepingUpdated", refreshHousekeeping);
      window.removeEventListener("roomStatusUpdated", refreshHousekeeping);
      window.removeEventListener("reservationUpdated", refreshHousekeeping);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findRoomId = (roomNumber: string) =>
    rooms.find((r) => r.room_number === roomNumber)?.id;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "normal":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
      case "open":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
      case "in_progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "completed":
      case "resolved":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "on_hold":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  const taskStats = {
    pending: tasks.filter((t) => t.status === "pending").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  const ticketStats = {
    open: tickets.filter((t) => t.status === "open").length,
    inProgress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved").length,
  };

  const handleCreateTask = async () => {
    if (!formData.roomNumber || !formData.taskType) {
      toast({
        title: "Error",
        description: "Please fill in room number and task type",
        variant: "destructive",
      });
      return;
    }

    const roomId = findRoomId(formData.roomNumber);
    if (!roomId) {
      toast({
        title: "Room not found",
        description: `No room with number "${formData.roomNumber}" exists.`,
        variant: "destructive",
      });
      return;
    }

    setSavingTask(true);
    try {
      const response = await fetch("/api/hotels/housekeeping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          taskType: formData.taskType,
          priority: formData.priority,
          assignedTo: formData.assignedTo || null,
          notes: JSON.stringify({
            details: formData.notes || "",
            shiftStart: formData.shiftStart,
            shiftEnd: formData.shiftEnd,
            shiftLabel: formData.shiftLabel,
          }),
        }),
      });

      if (!response.ok) throw new Error("Failed to create task");

      toast({
        title: "Success",
        description: `Task created for Room ${formData.roomNumber}`,
      });
      window.dispatchEvent(new Event("housekeepingUpdated"));
      window.dispatchEvent(new Event("roomStatusUpdated"));
      setShowNewTaskDialog(false);
      setFormData({ roomNumber: "", taskType: "cleaning", priority: "normal", assignedTo: "", shiftStart: new Date().toISOString().slice(0, 10), shiftEnd: new Date().toISOString().slice(0, 10), shiftLabel: "Day shift", notes: "" });
      await fetchTasks();
    } catch (error) {
      console.error("Error creating housekeeping task:", error);
      toast({
        title: "Error",
        description: "Failed to create housekeeping task",
        variant: "destructive",
      });
    } finally {
      setSavingTask(false);
    }
  };

  const handleMarkTaskDone = async (taskId: string) => {
    try {
      const response = await fetch(`/api/hotels/housekeeping/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!response.ok) throw new Error("Failed to update task");
      toast({ title: "Task marked as completed" });
      window.dispatchEvent(new Event("housekeepingUpdated"));
      window.dispatchEvent(new Event("roomStatusUpdated"));
      await fetchTasks();
    } catch (error) {
      console.error("Error updating task:", error);
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    }
  };

  const handleCreateTicket = async () => {
    if (!ticketForm.roomNumber || !ticketForm.issueDescription) {
      toast({
        title: "Error",
        description: "Please fill in room number and issue description",
        variant: "destructive",
      });
      return;
    }

    const roomId = findRoomId(ticketForm.roomNumber);
    if (!roomId) {
      toast({
        title: "Room not found",
        description: `No room with number "${ticketForm.roomNumber}" exists.`,
        variant: "destructive",
      });
      return;
    }

    setSavingTicket(true);
    try {
      const response = await fetch("/api/hotels/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          issueDescription: ticketForm.issueDescription,
          severity: ticketForm.severity,
          notes: ticketForm.notes || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to create ticket");

      toast({
        title: "Success",
        description: `Maintenance ticket created for Room ${ticketForm.roomNumber}`,
      });
      setShowNewTicketDialog(false);
      setTicketForm({ roomNumber: "", issueDescription: "", severity: "normal", notes: "" });
      await fetchTickets();
    } catch (error) {
      console.error("Error creating maintenance ticket:", error);
      toast({
        title: "Error",
        description: "Failed to create maintenance ticket",
        variant: "destructive",
      });
    } finally {
      setSavingTicket(false);
    }
  };

  const handleResolveTicket = async (ticketId: string) => {
    try {
      const response = await fetch(`/api/hotels/maintenance/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      if (!response.ok) throw new Error("Failed to update ticket");
      toast({ title: "Ticket marked as resolved" });
      await fetchTickets();
    } catch (error) {
      console.error("Error updating ticket:", error);
      toast({
        title: "Error",
        description: "Failed to update ticket",
        variant: "destructive",
      });
    }
  };

  const liveSync = useHotelLiveSync(async () => {
    await Promise.all([fetchTasks(), fetchTickets(), fetchRooms()]);
  });

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
          <h2 className="text-3xl font-bold tracking-tight">Housekeeping</h2>
        </div>
        <LiveSyncToolbar connected={liveSync.connected} refreshing={liveSync.refreshing} onRefresh={() => void liveSync.refresh()} />
      </div>

      <Tabs defaultValue="cleaning" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cleaning">
            <SprayCan className="h-4 w-4 mr-2" />
            Cleaning Tasks
          </TabsTrigger>
          <TabsTrigger value="maintenance">
            <Wrench className="h-4 w-4 mr-2" />
            Maintenance Tickets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cleaning" className="space-y-4">
          {!isHousekeeping && (
            <div className="flex justify-end">
              <Button
                onClick={() => setShowNewTaskDialog(true)}
                className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-white/70 dark:bg-gray-800/70 border-orange-200 dark:border-orange-700 rounded-2xl">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  {taskStats.pending}
                </div>
                <p className="text-xs text-muted-foreground">Pending Tasks</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70 dark:bg-gray-800/70 border-orange-200 dark:border-orange-700 rounded-2xl">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {taskStats.inProgress}
                </div>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70 dark:bg-gray-800/70 border-orange-200 dark:border-orange-700 rounded-2xl">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {taskStats.completed}
                </div>
                <p className="text-xs text-muted-foreground">Completed</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-orange-200 dark:border-orange-700 rounded-3xl">
            <CardHeader>
              <CardTitle>Housekeeping Tasks</CardTitle>
              <CardDescription>Room cleaning tasks</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No housekeeping tasks
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left py-2 px-4">Room</th>
                        <th className="text-left py-2 px-4">Task Type</th>
                        <th className="text-left py-2 px-4">Priority</th>
                        <th className="text-left py-2 px-4">Status</th>
                        <th className="text-left py-2 px-4">Assigned To</th>
                        <th className="text-left py-2 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {tasks.map((task) => (
                        <tr key={task.id} className="hover:bg-orange-50/50 dark:hover:bg-orange-900/20">
                          <td className="py-2 px-4 font-medium">{task.room_number}</td>
                          <td className="py-2 px-4 capitalize">{task.task_type.replace(/_/g, " ")}</td>
                          <td className="py-2 px-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}
                            >
                              {task.priority}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}
                            >
                              {task.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            <div>{task.assigned_to_name || "Unassigned"}</div>
                            {(() => { const shift = readTaskNotes(task.notes); return shift.shiftLabel || shift.shiftStart ? <div className="text-xs text-muted-foreground">{shift.shiftLabel || "Shift"}{shift.shiftStart ? ` · ${shift.shiftStart}–${shift.shiftEnd || shift.shiftStart}` : ""}</div> : null; })()}
                          </td>
                          <td className="py-2 px-4">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg"
                              disabled={task.status === "completed"}
                              onClick={() => handleMarkTaskDone(task.id)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Mark Done
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
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => setShowNewTicketDialog(true)}
              className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Ticket
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-white/70 dark:bg-gray-800/70 border-orange-200 dark:border-orange-700 rounded-2xl">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  {ticketStats.open}
                </div>
                <p className="text-xs text-muted-foreground">Open Tickets</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70 dark:bg-gray-800/70 border-orange-200 dark:border-orange-700 rounded-2xl">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {ticketStats.inProgress}
                </div>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </CardContent>
            </Card>
            <Card className="bg-white/70 dark:bg-gray-800/70 border-orange-200 dark:border-orange-700 rounded-2xl">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {ticketStats.resolved}
                </div>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-orange-200 dark:border-orange-700 rounded-3xl">
            <CardHeader>
              <CardTitle>Maintenance Tickets</CardTitle>
              <CardDescription>Room repair and maintenance issues</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingTickets ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No maintenance tickets
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left py-2 px-4">Ticket</th>
                        <th className="text-left py-2 px-4">Room</th>
                        <th className="text-left py-2 px-4">Issue</th>
                        <th className="text-left py-2 px-4">Severity</th>
                        <th className="text-left py-2 px-4">Status</th>
                        <th className="text-left py-2 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {tickets.map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-orange-50/50 dark:hover:bg-orange-900/20">
                          <td className="py-2 px-4 font-medium">{ticket.ticket_number}</td>
                          <td className="py-2 px-4">{ticket.room_number || "N/A"}</td>
                          <td className="py-2 px-4 max-w-xs truncate">{ticket.issue_description}</td>
                          <td className="py-2 px-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.severity)}`}
                            >
                              {ticket.severity}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}
                            >
                              {ticket.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg"
                              disabled={ticket.status === "resolved"}
                              onClick={() => handleResolveTicket(ticket.id)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Resolve
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
        </TabsContent>
      </Tabs>

      {/* New Housekeeping Task Dialog */}
      {!isHousekeeping && <Dialog open={showNewTaskDialog} onOpenChange={setShowNewTaskDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Housekeeping Task</DialogTitle>
            <DialogDescription>Assign a new cleaning task</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <Label htmlFor="roomNumber">Room needing cleaning</Label>
              <select
                id="roomNumber"
                value={formData.roomNumber}
                onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              >
                <option value="">Select a dirty room</option>
                {rooms.filter((room) => room.status === "dirty").map((room) => (
                  <option key={room.id} value={room.room_number}>Room {room.room_number} · {room.status}</option>
                ))}
              </select>
              {rooms.filter((room) => room.status === "dirty").length === 0 && <p className="mt-1 text-sm text-muted-foreground">No rooms currently need cleaning.</p>}
            </div>

            <div>
              <Label htmlFor="taskType">Task Type</Label>
              <select
                id="taskType"
                value={formData.taskType}
                onChange={(e) => setFormData({ ...formData, taskType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="">Select Task Type</option>
                <option value="room_cleaning">Room Cleaning</option>
                <option value="linen_change">Linen Change</option>
                <option value="bathroom_cleaning">Bathroom Cleaning</option>
                <option value="carpet_vacuum">Carpet Vacuum</option>
                <option value="window_cleaning">Window Cleaning</option>
              </select>
            </div>

            <div>
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <Label htmlFor="assignedTo">Assign housekeeping staff</Label>
              <select id="assignedTo" value={formData.assignedTo} onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                <option value="">Unassigned — any housekeeping staff</option>
                {staff.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>)}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div><Label htmlFor="shiftStart">Shift starts</Label><Input id="shiftStart" type="date" value={formData.shiftStart} onChange={(e) => setFormData({ ...formData, shiftStart: e.target.value })} /></div>
              <div><Label htmlFor="shiftEnd">Shift ends</Label><Input id="shiftEnd" type="date" value={formData.shiftEnd} onChange={(e) => setFormData({ ...formData, shiftEnd: e.target.value })} /></div>
              <div><Label htmlFor="shiftLabel">Shift</Label><Input id="shiftLabel" value={formData.shiftLabel} onChange={(e) => setFormData({ ...formData, shiftLabel: e.target.value })} placeholder="Day shift" /></div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                placeholder="Additional details..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 min-h-24"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => setShowNewTaskDialog(false)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={savingTask}
              className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              Create Task
            </Button>
          </div>
  </DialogContent>
</Dialog>}

  {/* New Maintenance Ticket Dialog */}
      <Dialog open={showNewTicketDialog} onOpenChange={setShowNewTicketDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Maintenance Ticket</DialogTitle>
            <DialogDescription>Report a room repair or maintenance issue</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <Label htmlFor="ticketRoomNumber">Room Number</Label>
              <Input
                id="ticketRoomNumber"
                placeholder="e.g., 101, 205, 310"
                value={ticketForm.roomNumber}
                onChange={(e) => setTicketForm({ ...ticketForm, roomNumber: e.target.value })}
                className="rounded-lg"
              />
            </div>

            <div>
              <Label htmlFor="issueDescription">Issue Description</Label>
              <textarea
                id="issueDescription"
                placeholder="Describe the issue..."
                value={ticketForm.issueDescription}
                onChange={(e) =>
                  setTicketForm({ ...ticketForm, issueDescription: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 min-h-24"
              />
            </div>

            <div>
              <Label htmlFor="severity">Severity</Label>
              <select
                id="severity"
                value={ticketForm.severity}
                onChange={(e) => setTicketForm({ ...ticketForm, severity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <Label htmlFor="ticketNotes">Notes</Label>
              <textarea
                id="ticketNotes"
                placeholder="Additional details..."
                value={ticketForm.notes}
                onChange={(e) => setTicketForm({ ...ticketForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 min-h-24"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => setShowNewTicketDialog(false)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTicket}
              disabled={savingTicket}
              className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              Create Ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function HousekeepingPageGuarded() {
  return (
    <RoleGuard section="housekeeping">
      <HousekeepingPage />
    </RoleGuard>
  );
}
