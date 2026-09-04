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
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";

type StaffRole = "admin" | "manager" | "operationsManager" | "finance" | "staff" | "kitchen" | "frontDesk" | "housekeeping";

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
  manager_scope: "hotel" | "restaurant" | "general";
  created_at: string;
  updated_at: string;
}

const ROLE_OPTIONS: { value: StaffRole; label: string; description: string }[] = [
  { value: "staff", label: "Restaurant Server", description: "Create POS orders and serve guests; cannot edit menu prices or approve refunds." },
  { value: "kitchen", label: "Chef", description: "Prepare and complete kitchen orders with limited operational stock visibility." },
  { value: "frontDesk", label: "Reception", description: "Manage reservations, check-in/out, guest folios, and front-desk service." },
  { value: "housekeeping", label: "Housekeeping", description: "Manage room-cleaning tasks and housekeeping status." },
  { value: "finance", label: "Finance", description: "Review payments, expenses, payroll, refunds, and financial reports." },
  { value: "operationsManager", label: "Operations Manager", description: "Coordinate maintenance and operational tasks across departments." },
  { value: "manager", label: "General Manager", description: "Supervise hotel and restaurant operations with cross-department oversight." },
  { value: "admin", label: "Admin", description: "Manage system settings, staff access, and administrative controls." },
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
  operationsManager:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700",
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
  managerScope: "general" as "hotel" | "restaurant" | "general",
};

export function StaffManagementPanel({ currentRole }: { currentRole: string }) {
  const { toast } = useToast();
  const canResetTarget = (target: StaffMember) => currentRole === "admin" || (currentRole === "manager" && !["admin", "manager"].includes(target.role));
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [resetReason, setResetReason] = useState("");
  const [terminationStaffIds, setTerminationStaffIds] = useState<string[]>([]);
  const [terminationReason, setTerminationReason] = useState("");
  const [terminationRequests, setTerminationRequests] = useState<Array<{ id: string; status: string; reason: string; target_staff_ids: string[]; created_at: string }>>([]);
  const [deleteReason, setDeleteReason] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    department: "",
    position: "",
    employmentStatus: "active",
    role: "staff" as StaffRole,
    managerScope: "general" as "hotel" | "restaurant" | "general",
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
    if (["admin", "manager"].includes(currentRole)) {
      fetch("/api/admin/termination-requests").then((res) => res.ok ? res.json() : { requests: [] }).then((data) => setTerminationRequests(data.requests || [])).catch(() => undefined);
    }
  }, [loadStaff, currentRole]);

  const submitTerminationRequest = async () => {
    if (!terminationStaffIds.length || terminationReason.trim().length < 20) {
      toast({ title: "Selection and reason required", description: "Select staff accounts and provide at least 20 characters.", variant: "destructive" });
      return;
    }
    const response = await fetch("/api/admin/termination-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffIds: terminationStaffIds, reason: terminationReason.trim() }) });
    const data = await response.json();
    if (!response.ok) return toast({ title: "Request failed", description: data.error, variant: "destructive" });
    toast({ title: "Confidential request submitted", description: "The General Manager and Admin have been notified." });
    setTerminationStaffIds([]); setTerminationReason("");
  };

  const reviewTerminationRequest = async (id: string, action: "investigate" | "approve" | "deny" | "archive" | "purge") => {
    const response = await fetch(`/api/admin/termination-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!response.ok) { const data = await response.json(); toast({ title: "Review failed", description: data.error, variant: "destructive" }); return; }
    setTerminationRequests((items) => items.map((item) => item.id === id ? { ...item, status: action } : item));
    toast({ title: `Request ${action}`, description: "The confidential case was updated." });
    if (action === "purge" || action === "archive") setTerminationRequests((items) => items.filter((item) => item.id !== id));
    if (action === "approve") loadStaff();
  };

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

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: "Passwords do not match", description: "Enter the same new password twice.", variant: "destructive" });
      return;
    }
    setIsChangingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update password");
      toast({ title: "Password updated", description: "Your staff login password has been changed." });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      toast({ title: "Password update failed", description: error instanceof Error ? error.message : "Unable to update password", variant: "destructive" });
    } finally { setIsChangingPassword(false); }
  };

  const handleForcePasswordReset = async () => {
    if (!resetTarget || resetReason.trim().length < 10) {
      toast({ title: "Reason required", description: "Explain the breach response in at least 10 characters.", variant: "destructive" });
      return;
    }
    setIsResettingPassword(true);
    try {
      const response = await fetch(`/api/admin/staff/${resetTarget.id}/password-reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: resetReason.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to initiate password reset");
      toast({ title: "Password reset initiated", description: `A reset was initiated for ${resetTarget.business_email}.` });
      setResetTarget(null);
      setResetReason("");
    } catch (error) {
      toast({ title: "Reset failed", description: error instanceof Error ? error.message : "Unable to initiate password reset", variant: "destructive" });
    } finally { setIsResettingPassword(false); }
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
      managerScope: member.manager_scope || "general",
    });
  };

  const handleUpdateStaff = async () => {
    if (!editingStaff) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/staff/${editingStaff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, managerScope: editForm.role === "manager" ? editForm.managerScope : "general" }),
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
    if (deleteReason.trim().length < 10) {
      toast({ title: "Reason required", description: "Provide at least 10 characters explaining this deactivation.", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(`/api/admin/staff/${member.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deleteReason.trim() }),
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

  const passwordInputType = showPasswords ? "text" : "password";
  return (
    <div className="space-y-6">
      <Card className="w-full border-amber-200">
        <CardHeader><CardTitle>Confidential staff termination</CardTitle><CardDescription>Managers submit requests for GM review. General Manager and Admin can review cases; Admin can archive or permanently purge the message.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((member) => <label key={member.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={terminationStaffIds.includes(member.id)} onChange={(event) => setTerminationStaffIds((ids) => event.target.checked ? [...ids, member.id] : ids.filter((id) => id !== member.id))} />{member.first_name} {member.last_name} <span className="text-muted-foreground">({roleLabel(member.role)})</span></label>)}
          </div>
          <textarea value={terminationReason} onChange={(event) => setTerminationReason(event.target.value)} placeholder="Write the confidential reason for this request (minimum 20 characters)" className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm" />
          <div className="flex justify-end"><Button onClick={submitTerminationRequest}>Submit confidential request</Button></div>
          {terminationRequests.length > 0 && <div className="grid gap-3 border-t pt-4"><h3 className="font-semibold">Review queue</h3>{terminationRequests.map((item) => <div key={item.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Case {item.id.slice(0, 8)} · {item.status}</span><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => reviewTerminationRequest(item.id, "investigate")}>Investigate</Button><Button size="sm" onClick={() => reviewTerminationRequest(item.id, "approve")}>Approve</Button><Button size="sm" variant="destructive" onClick={() => reviewTerminationRequest(item.id, "deny")}>Deny</Button>{currentRole === "admin" && <><Button size="sm" variant="outline" onClick={() => reviewTerminationRequest(item.id, "archive")}>Archive</Button><Button size="sm" variant="outline" onClick={() => reviewTerminationRequest(item.id, "purge")}>Purge</Button></>}</div></div><p className="mt-2 text-sm text-muted-foreground">{item.reason}</p></div>)}</div>}
        </CardContent>
      </Card>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-orange-600" /><div><CardTitle>My password</CardTitle><CardDescription>Change the password for your staff login.</CardDescription></div></div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {([["currentPassword", "Current password"], ["newPassword", "New password"], ["confirmPassword", "Confirm new password"]] as const).map(([key, label]) => (
            <div className="space-y-2" key={key}><Label htmlFor={`staff-${key}`}>{label}</Label><div className="relative"><Input id={`staff-${key}`} type={passwordInputType} value={passwordForm[key]} onChange={(e) => setPasswordForm((form) => ({ ...form, [key]: e.target.value }))} autoComplete={key === "currentPassword" ? "current-password" : "new-password"} className="pr-10" />{key === "confirmPassword" && <button type="button" className="absolute right-2 top-2 text-muted-foreground" onClick={() => setShowPasswords((value) => !value)} aria-label={showPasswords ? "Hide passwords" : "Show passwords"}>{showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}</div></div>
          ))}
          <div className="sm:col-span-3 flex items-center justify-between gap-4"><p className="text-xs text-muted-foreground">At least 8 characters with uppercase, lowercase, and a number.</p><Button type="button" onClick={handleChangePassword} disabled={isChangingPassword || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}>{isChangingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update password</Button></div>
        </CardContent>
      </Card>
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
              Manage staff access and password security. Admins can reset any role; managers can reset only non-admin and non-manager roles.
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
  <div className="flex flex-col gap-0.5">
  <span>{option.label}</span>
  <span className="text-xs text-muted-foreground">{option.description}</span>
  </div>
  </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {createForm.role === "manager" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-manager-scope">Manager scope</Label>
                    <Select value={createForm.managerScope} onValueChange={(value) => setCreateForm((f) => ({ ...f, managerScope: value as "hotel" | "restaurant" | "general" }))}>
                      <SelectTrigger id="staff-manager-scope"><SelectValue placeholder="Select manager scope" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General Manager</SelectItem>
                        <SelectItem value="hotel">Hotel Manager</SelectItem>
                        <SelectItem value="restaurant">Restaurant Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

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
  <div className="flex flex-col gap-0.5">
  <span>{option.label}</span>
  <span className="text-xs text-muted-foreground">{option.description}</span>
  </div>
  </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                {editForm.role === "manager" && (
                                  <div className="space-y-1.5">
                                    <Label>Manager scope</Label>
                                    <Select value={editForm.managerScope} onValueChange={(value) => setEditForm((f) => ({ ...f, managerScope: value as "hotel" | "restaurant" | "general" }))}>
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="hotel">Hotel Manager</SelectItem>
                                        <SelectItem value="restaurant">Restaurant Manager</SelectItem>
                                        <SelectItem value="general">General Manager</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
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

                        {canResetTarget(member) && (
                          <Dialog
                            open={resetTarget?.id === member.id}
                            onOpenChange={(open) => {
                              if (!open) {
                                setResetTarget(null);
                                setResetReason("");
                              } else {
                                setResetTarget(member);
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 text-amber-700 hover:bg-amber-50"
                                aria-label={`Reset password for ${member.first_name} ${member.last_name}`}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Reset staff password</DialogTitle>
                                <DialogDescription>
                                  Use this only for a security incident. Admins can reset any role; managers can reset staff, finance, kitchen, front desk, and housekeeping accounts, but not admins or managers.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-2 py-2">
                                <Label htmlFor={`reset-reason-${member.id}`}>Reason for reset</Label>
                                <textarea
                                  id={`reset-reason-${member.id}`}
                                  value={resetReason}
                                  onChange={(event) => setResetReason(event.target.value)}
                                  placeholder="Describe the suspected breach or security incident"
                                  className="min-h-24 w-full rounded-xl border border-orange-200 bg-background px-3 py-2 text-sm"
                                />
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setResetTarget(null)} disabled={isResettingPassword}>Cancel</Button>
                                <Button onClick={handleForcePasswordReset} disabled={isResettingPassword || resetReason.trim().length < 10} className="bg-amber-600 hover:bg-amber-700 text-white">
                                  {isResettingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Initiate reset
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}

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
                                as terminated. A reason is required and will be
                                retained in the confidential audit record.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-2 py-2">
                              <Label htmlFor={`delete-reason-${member.id}`}>Reason for deactivation</Label>
                              <textarea id={`delete-reason-${member.id}`} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Explain the judgement or decision" className="min-h-24 w-full rounded-xl border border-orange-200 bg-background px-3 py-2 text-sm" />
                            </div>
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
    </div>
  );
}
