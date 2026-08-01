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
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Edit2,
  UserCheck,
  UserX,
  Users,
  Shield,
  Search,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  username: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
  { value: "kitchen", label: "Kitchen" },
  { value: "frontDesk", label: "Front Desk" },
  { value: "housekeeping", label: "Housekeeping" },
];

const getRoleBadgeClass = (role: string) => {
  const map: Record<string, string> = {
    admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    manager: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    staff: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    kitchen: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    frontDesk: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
    housekeeping: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  };
  return map[role] ?? "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
};

const emptyForm = {
  name: "",
  email: "",
  role: "staff",
  username: "",
  password: "",
  confirmPassword: "",
  is_active: true,
};

export default function StaffPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const canManage =
    user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    if (!canManage) {
      router.push("/");
      return;
    }
    fetchStaff();
  }, [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchStaff() {
    try {
      const res = await fetch("/api/staff");
      if (!res.ok) throw new Error("Failed to fetch");
      setStaff(await res.json());
    } catch {
      toast({ title: "Error", description: "Failed to load staff", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!form.name || !form.email || !form.role || !form.password) {
      toast({ title: "Error", description: "Name, email, role and password are required", variant: "destructive" });
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, role: form.role, username: form.username, password: form.password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create");
      }
      toast({ title: "Success", description: `${form.name} added to staff` });
      setShowAddDialog(false);
      setForm(emptyForm);
      fetchStaff();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to add staff", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editingMember || !form.name || !form.email || !form.role) {
      toast({ title: "Error", description: "Name, email and role are required", variant: "destructive" });
      return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string | boolean | null> = {
        name: form.name, email: form.email, role: form.role,
        username: form.username || null, is_active: form.is_active,
      };
      if (form.password) body.password = form.password;

      const res = await fetch(`/api/staff/${editingMember.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      toast({ title: "Success", description: `${form.name} updated` });
      setShowEditDialog(false);
      setEditingMember(null);
      setForm(emptyForm);
      fetchStaff();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to update", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(member: StaffMember) {
    try {
      const res = await fetch(`/api/staff/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !member.is_active }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({
        title: "Updated",
        description: `${member.name} is now ${!member.is_active ? "active" : "inactive"}`,
      });
      fetchStaff();
    } catch {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  }

  const filtered = staff.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.role.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = staff.filter((s) => s.is_active).length;
  const inactiveCount = staff.length - activeCount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/")}
          className="border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300 rounded-xl"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Dashboard
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Staff Management</h1>
          <p className="text-sm text-orange-600 dark:text-orange-400">Add, edit and manage your team</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Staff", value: staff.length, icon: Users, color: "text-orange-600 dark:text-orange-400" },
          { label: "Active", value: activeCount, icon: UserCheck, color: "text-green-600 dark:text-green-400" },
          { label: "Inactive", value: inactiveCount, icon: UserX, color: "text-red-600 dark:text-red-400" },
          { label: "Roles", value: Array.from(new Set(staff.map((s) => s.role))).length, icon: Shield, color: "text-amber-600 dark:text-amber-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 rounded-2xl">
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <Icon className={`h-7 w-7 ${color}`} />
              <div>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Staff List Card */}
      <Card className="bg-white/80 dark:bg-gray-800/80 border border-orange-200 dark:border-orange-700 rounded-3xl shadow-lg">
        <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-gray-800 dark:text-gray-200">Staff Directory</CardTitle>
              <CardDescription>{staff.length} team members</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-orange-400" />
                <Input
                  placeholder="Search staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 border-orange-200 dark:border-orange-700 rounded-xl w-48"
                />
              </div>
              <Button
                onClick={() => { setForm(emptyForm); setShowAddDialog(true); }}
                className="rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Staff
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 text-orange-300" />
              <p className="font-medium">{search ? "No staff match your search" : "No staff members yet"}</p>
              <p className="text-sm">Click &quot;Add Staff&quot; to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-orange-100 dark:border-orange-800">
                  <tr className="text-left text-muted-foreground">
                    <th className="py-3 px-4 font-medium">Name</th>
                    <th className="py-3 px-4 font-medium">Email</th>
                    <th className="py-3 px-4 font-medium">Role</th>
                    <th className="py-3 px-4 font-medium">Username</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Joined</th>
                    <th className="py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b border-orange-50 dark:border-orange-900/20 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors"
                    >
                      <td className="py-3 px-4 font-medium text-gray-800 dark:text-gray-200">
                        {member.name}
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{member.email}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeClass(member.role)}`}>
                          {ROLES.find((r) => r.value === member.role)?.label ?? member.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400">
                        {member.username ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          className={
                            member.is_active
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-0"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0"
                          }
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-gray-500 dark:text-gray-400 text-xs">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                            onClick={() => {
                              setEditingMember(member);
                              setForm({
                                name: member.name,
                                email: member.email,
                                role: member.role,
                                username: member.username ?? "",
                                password: "",
                                confirmPassword: "",
                                is_active: member.is_active,
                              });
                              setShowEditDialog(true);
                            }}
                          >
                            <Edit2 className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={`rounded-lg ${member.is_active ? "border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" : "border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"}`}
                            onClick={() => handleToggleActive(member)}
                          >
                            {member.is_active ? (
                              <><UserX className="h-3 w-3 mr-1" />Deactivate</>
                            ) : (
                              <><UserCheck className="h-3 w-3 mr-1" />Activate</>
                            )}
                          </Button>
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

      {/* Add Staff Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Staff Member</DialogTitle>
            <DialogDescription>Create a new account for a team member</DialogDescription>
          </DialogHeader>
          <StaffForm form={form} setForm={setForm} isEdit={false} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-xl">Cancel</Button>
            <Button
              disabled={saving}
              onClick={handleAdd}
              className="rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              {saving ? "Adding..." : "Add Staff Member"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Staff Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>Update details for {editingMember?.name}</DialogDescription>
          </DialogHeader>
          <StaffForm form={form} setForm={setForm} isEdit={true} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="rounded-xl">Cancel</Button>
            <Button
              disabled={saving}
              onClick={handleEdit}
              className="rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Shared form component
function StaffForm({
  form,
  setForm,
  isEdit,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  isEdit: boolean;
}) {
  const inputClass =
    "w-full border-2 border-orange-200 dark:border-orange-700 rounded-xl focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 dark:hover:border-orange-600 transition";

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sf-name">Full Name *</Label>
          <Input id="sf-name" placeholder="e.g. John Mensah" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
        </div>
        <div>
          <Label htmlFor="sf-username">Username</Label>
          <Input id="sf-username" placeholder="e.g. jmensah" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inputClass} />
        </div>
      </div>

      <div>
        <Label htmlFor="sf-email">Email Address *</Label>
        <Input id="sf-email" type="email" placeholder="staff@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
      </div>

      <div>
        <Label htmlFor="sf-role">Role *</Label>
        <select
          id="sf-role"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="w-full px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-xl focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 transition"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {isEdit && (
        <div>
          <Label htmlFor="sf-active">Account Status</Label>
          <select
            id="sf-active"
            value={form.is_active ? "active" : "inactive"}
            onChange={(e) => setForm({ ...form, is_active: e.target.value === "active" })}
            className="w-full px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-xl focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 transition"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      )}

      <div className="border-t border-orange-100 dark:border-orange-800 pt-3">
        <p className="text-xs text-muted-foreground mb-3">
          {isEdit ? "Leave password blank to keep the current password." : "Set an initial password for this account."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="sf-pw">{isEdit ? "New Password" : "Password *"}</Label>
            <Input id="sf-pw" type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
          </div>
          <div>
            <Label htmlFor="sf-pw2">Confirm Password</Label>
            <Input id="sf-pw2" type="password" placeholder="••••••••" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} className={inputClass} />
          </div>
        </div>
      </div>
    </div>
  );
}
