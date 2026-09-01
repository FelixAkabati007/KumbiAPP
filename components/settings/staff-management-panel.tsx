"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";

type StaffRole = "admin" | "manager" | "finance" | "staff" | "kitchen" | "frontDesk" | "housekeeping";

interface StaffMember {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  business_email: string;
  phone: string | null;
  department: string;
  position: string;
  employment_status: string;
  hire_date: string | null;
  role: StaffRole;
  created_at: string;
  updated_at: string;
}

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "kitchen", label: "Kitchen Staff" },
  { value: "frontDesk", label: "Front Desk" },
  { value: "housekeeping", label: "Housekeeping" },
  { value: "finance", label: "Finance" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

const ROLE_BADGE_CLASSES: Record<StaffRole, string> = {
  admin:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  manager:
    "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  staff:
    "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
  kitchen:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
  finance:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700",
  frontDesk:
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  housekeeping:
    "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700",
};

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role;
}

const emptyCreateForm = {
  firstName: "",
  lastName: "",
  businessEmail: "",
  phone: "",
  department: "",
  position: "",
  hireDate: "",
  password: "",
  role: "staff" as StaffRole,
};

export function StaffManagementPanel() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    department: "",
    position: "",
    employmentStatus: "active",
    role: "staff" as StaffRole,
  });

  const loadStaff = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/staff");
      if (!res.ok) throw new Error("Failed to load staff accounts");
      const data = await res.json();
      setStaff(data.data || []);
    } catch (error) {
      console.error("[v0] Failed to load staff:", error);
      toast({
        title: "Failed to load staff",
        description: "Could not retrieve staff accounts. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleCreateStaff = async () => {
    const email = createForm.businessEmail.trim().toLowerCase();
    const requiredFields = [
      createForm.firstName,
      createForm.lastName,
      email,
      createForm.department,
      createForm.position,
      createForm.password,
    ];
    if (requiredFields.some((value) => !value.trim())) {
      toast({
        title: "Missing required fields",
        description: "Please fill in all required fields before submitting.",
        variant: "destructive",
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "Invalid email",
        description: "Enter a valid business email address.",
        variant: "destructive",
      });
      return;
    }
    if (createForm.password.length < 8) {
      toast({
        title: "Password is too short",
        description: "Staff passwords must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          firstName: createForm.firstName.trim(),
          lastName: createForm.lastName.trim(),
          businessEmail: email,
          department: createForm.department.trim(),
          position: createForm.position.trim(),
          phone: createForm.phone.trim() || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const message = Array.isArray(data.error)
          ? data.error.join(", ")
          : data.error || "Failed to create staff account";
        toast({
          title: "Could not create account",
          description: message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Staff account created",
        description: `${createForm.firstName} ${createForm.lastName} now has an isolated login.`,
      });
      setCreateForm(emptyCreateForm);
      setIsCreateOpen(false);
      loadStaff();
    } catch (error) {
      console.error("[v0] Failed to create staff:", error);
      toast({
        title: "Something went wrong",
        description: "Failed to create the staff account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (member: StaffMember) => {
    setEditingStaff(member);
    setEditForm({
      firstName: member.first_name || "",
      lastName: member.last_name || "",
      phone: member.phone || "",
      department: member.department || "",
      position: member.position || "",
      employmentStatus: member.employment_status || "active",
      role: member.role || "staff",
    });
  };

  const handleUpdateStaff = async () => {
    if (!editingStaff) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/staff/${editingStaff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Could not update account",
          description: data.error || "Failed to update staff account",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Staff account updated",
        description: `${editForm.firstName} ${editForm.lastName}'s profile and access have been updated.`,
      });
      setEditingStaff(null);
      loadStaff();
    } catch (error) {
      console.error("[v0] Failed to update staff:", error);
      toast({
        title: "Something went wrong",
        description: "Failed to update the staff account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteStaff = async (member: StaffMember) => {
    try {
      const res = await fetch(`/api/admin/staff/${member.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Could not remove account",
          description: data.error || "Failed to remove staff account",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Staff account removed",
        description: `${member.first_name} ${member.last_name}'s login has been deactivated.`,
      });
      loadStaff();
    } catch (error) {
      console.error("[v0] Failed to delete staff:", error);
      toast({
        title: "Something went wrong",
        description: "Failed to remove the staff account. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
      <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
              <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                <Users className="h-5 w-5 text-white" />
              </div>
              Staff Accounts
            </CardTitle>
            <CardDescription className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Create and manage isolated staff logins. Only admins can view
              and modify this list.
            </CardDescription>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg rounded-2xl">
                <Plus className="mr-2 h-4 w-4" />
                Add Staff
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg flex-col overflow-hidden p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>Create Staff Account</DialogTitle>
                <DialogDescription>
                  Each staff member gets a unique login that cannot be shared
                  with other accounts.
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-4 py-2">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-first-name">First name</Label>
                    <Input
                      id="staff-first-name"
                      value={createForm.firstName}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          firstName: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-last-name">Last name</Label>
                    <Input
                      id="staff-last-name"
                      value={createForm.lastName}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          lastName: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="staff-email">Business email (login)</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    placeholder="name@kumbisaly.com"
                    value={createForm.businessEmail}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        businessEmail: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-department">Department</Label>
                    <Input
                      id="staff-department"
                      value={createForm.department}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          department: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-position">Position</Label>
                    <Input
                      id="staff-position"
                      value={createForm.position}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          position: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-phone">Phone</Label>
                    <Input
                      id="staff-phone"
                      value={createForm.phone}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          phone: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-hire-date">Hire date</Label>
                    <Input
                      id="staff-hire-date"
                      type="date"
                      value={createForm.hireDate}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          hireDate: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="staff-role">Role &amp; access level</Label>
                  <Select
                    value={createForm.role}
                    onValueChange={(value) =>
                      setCreateForm((f) => ({
                        ...f,
                        role: value as StaffRole,
                      }))
                    }
                  >
                    <SelectTrigger id="staff-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="staff-password">Temporary password</Label>
                  <Input
                    id="staff-password"
                    type="password"
                    placeholder="Min. 12 characters, mixed case, number, symbol"
                    value={createForm.password}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        password: e.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Must be at least 12 characters with uppercase, lowercase,
                    a number, and a special character.
                  </p>
                </div>
                </div>
              </div>

              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateStaff}
                  disabled={isSubmitting}
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  Create Account
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="p-6 relative z-10">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading staff accounts...
          </div>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-gray-500 dark:text-gray-400">
            <UserCog className="h-8 w-8" />
            <p>No staff accounts yet. Add your first staff member above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-orange-200 dark:border-orange-700">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Login Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.first_name} {member.last_name}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                      {member.business_email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={ROLE_BADGE_CLASSES[member.role] || ""}
                      >
                        {roleLabel(member.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {member.department}
                      {member.position ? ` · ${member.position}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          member.employment_status === "active"
                            ? "default"
                            : "secondary"
                        }
                        className="capitalize"
                      >
                        {member.employment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Dialog
                          open={editingStaff?.id === member.id}
                          onOpenChange={(open) => {
                            if (!open) setEditingStaff(null);
                            else openEditDialog(member);
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Edit ${member.first_name} ${member.last_name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg flex-col overflow-hidden p-4 sm:p-6">
                            <DialogHeader>
                              <DialogTitle>
                                Edit {member.first_name} {member.last_name}
                              </DialogTitle>
                              <DialogDescription>
                                Update profile details and access level for
                                this account.
                              </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-2">
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label>First name</Label>
                                  <Input
                                    value={editForm.firstName}
                                    onChange={(e) =>
                                      setEditForm((f) => ({
                                        ...f,
                                        firstName: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Last name</Label>
                                  <Input
                                    value={editForm.lastName}
                                    onChange={(e) =>
                                      setEditForm((f) => ({
                                        ...f,
                                        lastName: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label>Department</Label>
                                  <Input
                                    value={editForm.department}
                                    onChange={(e) =>
                                      setEditForm((f) => ({
                                        ...f,
                                        department: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Position</Label>
                                  <Input
                                    value={editForm.position}
                                    onChange={(e) =>
                                      setEditForm((f) => ({
                                        ...f,
                                        position: e.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <Label>Phone</Label>
                                <Input
                                  value={editForm.phone}
                                  onChange={(e) =>
                                    setEditForm((f) => ({
                                      ...f,
                                      phone: e.target.value,
                                    }))
                                  }
                                />
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label>Role &amp; access level</Label>
                                  <Select
                                    value={editForm.role}
                                    onValueChange={(value) =>
                                      setEditForm((f) => ({
                                        ...f,
                                        role: value as StaffRole,
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {ROLE_OPTIONS.map((option) => (
                                        <SelectItem
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5">
                                  <Label>Employment status</Label>
                                  <Select
                                    value={editForm.employmentStatus}
                                    onValueChange={(value) =>
                                      setEditForm((f) => ({
                                        ...f,
                                        employmentStatus: value,
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="active">
                                        Active
                                      </SelectItem>
                                      <SelectItem value="on_leave">
                                        On Leave
                                      </SelectItem>
                                      <SelectItem value="suspended">
                                        Suspended
                                      </SelectItem>
                                      <SelectItem value="terminated">
                                        Terminated
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>

                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => setEditingStaff(null)}
                                disabled={isSubmitting}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={handleUpdateStaff}
                                disabled={isSubmitting}
                                className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white"
                              >
                                {isSubmitting ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Save Changes
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                              aria-label={`Remove ${member.first_name} ${member.last_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Remove {member.first_name} {member.last_name}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will deactivate their login and mark them
                                as terminated. This action can be reviewed in
                                the audit log.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => handleDeleteStaff(member)}
                              >
                                Remove Account
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
