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
  CheckCircle2,
  Clock,
  Banknote,
  TrendingUp,
  Users,
  Pencil,
  Trash2,
  Search,
  Filter,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface PayrollRecord {
  id: string;
  user_id: string;
  staff_name: string;
  staff_email: string;
  staff_role: string;
  pay_period_start: string;
  pay_period_end: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_pay: number;
  status: "pending" | "approved" | "paid";
  notes: string | null;
  paid_at: string | null;
  created_at: string;
}

const STATUS_MAP = {
  pending:  { label: "Pending",  cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  approved: { label: "Approved", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  paid:     { label: "Paid",     cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
};

const emptyForm = {
  user_id: "",
  pay_period_start: "",
  pay_period_end: "",
  basic_salary: "",
  allowances: "",
  deductions: "",
  notes: "",
};

function fmt(n: number | string) {
  return `GHS ${parseFloat(String(n)).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayrollPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PayrollRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const canManage = user?.role === "admin" || user?.role === "manager";

  useEffect(() => {
    if (!canManage) { router.push("/"); return; }
    Promise.all([fetchPayroll(), fetchStaff()]).finally(() => setLoading(false));
  }, [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchPayroll() {
    const res = await fetch("/api/payroll");
    if (res.ok) setPayroll(await res.json());
  }

  async function fetchStaff() {
    const res = await fetch("/api/staff");
    if (res.ok) setStaff(await res.json());
  }

  async function handleCreate() {
    if (!form.user_id || !form.pay_period_start || !form.pay_period_end || !form.basic_salary) {
      toast({ title: "Error", description: "Staff, pay period and basic salary are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: form.user_id,
          pay_period_start: form.pay_period_start,
          pay_period_end: form.pay_period_end,
          basic_salary: parseFloat(form.basic_salary),
          allowances: parseFloat(form.allowances || "0"),
          deductions: parseFloat(form.deductions || "0"),
          notes: form.notes || null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast({ title: "Success", description: "Payroll record created" });
      setShowAddDialog(false);
      setForm(emptyForm);
      fetchPayroll();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!editingRecord) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/payroll/${editingRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          basic_salary: parseFloat(form.basic_salary),
          allowances: parseFloat(form.allowances || "0"),
          deductions: parseFloat(form.deductions || "0"),
          notes: form.notes || null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast({ title: "Success", description: "Payroll record updated" });
      setShowEditDialog(false);
      setEditingRecord(null);
      fetchPayroll();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(record: PayrollRecord, newStatus: string) {
    try {
      const res = await fetch(`/api/payroll/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Updated", description: `Status changed to ${newStatus}` });
      fetchPayroll();
    } catch {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this payroll record?")) return;
    try {
      const res = await fetch(`/api/payroll/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Deleted", description: "Payroll record removed" });
      fetchPayroll();
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  }

  const filtered = payroll.filter((p) => {
    const matchesSearch =
      p.staff_name.toLowerCase().includes(search.toLowerCase()) ||
      p.staff_email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPayroll = payroll.reduce((acc, p) => acc + parseFloat(String(p.net_pay)), 0);
  const paidOut = payroll.filter((p) => p.status === "paid").reduce((acc, p) => acc + parseFloat(String(p.net_pay)), 0);
  const pending = payroll.filter((p) => p.status === "pending").length;
  const approved = payroll.filter((p) => p.status === "approved").length;

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
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Staff Payroll</h1>
          <p className="text-sm text-orange-600 dark:text-orange-400">Manage salaries, allowances and deductions</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Payroll", value: fmt(totalPayroll), icon: Banknote, color: "text-orange-600 dark:text-orange-400" },
          { label: "Paid Out", value: fmt(paidOut), icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
          { label: "Pending Records", value: pending, icon: Clock, color: "text-yellow-600 dark:text-yellow-400" },
          { label: "Approved", value: approved, icon: TrendingUp, color: "text-blue-600 dark:text-blue-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 rounded-2xl">
            <CardContent className="flex items-center gap-3 pt-4 pb-4">
              <Icon className={`h-7 w-7 shrink-0 ${color}`} />
              <div className="min-w-0">
                <p className="text-lg font-bold text-gray-800 dark:text-gray-200 truncate">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payroll Records */}
      <Card className="bg-white/80 dark:bg-gray-800/80 border border-orange-200 dark:border-orange-700 rounded-3xl shadow-lg">
        <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-gray-800 dark:text-gray-200">Payroll Records</CardTitle>
              <CardDescription>{filtered.length} record{filtered.length !== 1 ? "s" : ""}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-orange-400" />
                <Input
                  placeholder="Search staff..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 border-orange-200 dark:border-orange-700 rounded-xl w-40"
                />
              </div>
              {/* Status filter */}
              <div className="relative flex items-center">
                <Filter className="absolute left-2.5 h-4 w-4 text-orange-400 pointer-events-none" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-8 pr-3 py-2 text-sm border-2 border-orange-200 dark:border-orange-700 rounded-xl bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:border-orange-500 focus:outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <Button
                onClick={() => { setForm(emptyForm); setShowAddDialog(true); }}
                className="rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Payroll
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
              <Banknote className="h-12 w-12 mx-auto mb-3 text-orange-300" />
              <p className="font-medium">No payroll records found</p>
              <p className="text-sm">Click &quot;Add Payroll&quot; to create the first record</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-orange-100 dark:border-orange-800">
                  <tr className="text-left text-muted-foreground">
                    <th className="py-3 px-4 font-medium">Staff</th>
                    <th className="py-3 px-4 font-medium">Pay Period</th>
                    <th className="py-3 px-4 font-medium">Basic</th>
                    <th className="py-3 px-4 font-medium">Allowances</th>
                    <th className="py-3 px-4 font-medium">Deductions</th>
                    <th className="py-3 px-4 font-medium">Net Pay</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-orange-50 dark:border-orange-900/20 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-800 dark:text-gray-200">{record.staff_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{record.staff_role}</p>
                      </td>
                      <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-xs">
                        <p>{new Date(record.pay_period_start).toLocaleDateString()}</p>
                        <p>to {new Date(record.pay_period_end).toLocaleDateString()}</p>
                      </td>
                      <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{fmt(record.basic_salary)}</td>
                      <td className="py-3 px-4 text-green-600 dark:text-green-400">+{fmt(record.allowances)}</td>
                      <td className="py-3 px-4 text-red-600 dark:text-red-400">-{fmt(record.deductions)}</td>
                      <td className="py-3 px-4 font-semibold text-gray-800 dark:text-gray-200">{fmt(record.net_pay)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_MAP[record.status]?.cls}`}>
                          {STATUS_MAP[record.status]?.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {/* Status progression */}
                          {record.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg text-xs border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              onClick={() => handleStatusChange(record, "approved")}
                            >
                              Approve
                            </Button>
                          )}
                          {record.status === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg text-xs border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                              onClick={() => handleStatusChange(record, "paid")}
                            >
                              Mark Paid
                            </Button>
                          )}
                          {/* Edit */}
                          {record.status !== "paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg text-xs border-orange-200 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                              onClick={() => {
                                setEditingRecord(record);
                                setForm({
                                  user_id: record.user_id,
                                  pay_period_start: record.pay_period_start.split("T")[0],
                                  pay_period_end: record.pay_period_end.split("T")[0],
                                  basic_salary: String(record.basic_salary),
                                  allowances: String(record.allowances),
                                  deductions: String(record.deductions),
                                  notes: record.notes ?? "",
                                });
                                setShowEditDialog(true);
                              }}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          )}
                          {/* Delete */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg text-xs border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleDelete(record.id)}
                          >
                            <Trash2 className="h-3 w-3" />
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

      {/* Add Payroll Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Payroll Record</DialogTitle>
            <DialogDescription>Add a salary record for a staff member</DialogDescription>
          </DialogHeader>
          <PayrollForm form={form} setForm={setForm} staff={staff} isEdit={false} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-xl">Cancel</Button>
            <Button
              disabled={saving}
              onClick={handleCreate}
              className="rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white"
            >
              {saving ? "Creating..." : "Create Record"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Payroll Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Payroll Record</DialogTitle>
            <DialogDescription>Update figures for {editingRecord?.staff_name}</DialogDescription>
          </DialogHeader>
          <PayrollForm form={form} setForm={setForm} staff={staff} isEdit={true} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="rounded-xl">Cancel</Button>
            <Button
              disabled={saving}
              onClick={handleUpdate}
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
function PayrollForm({
  form,
  setForm,
  staff,
  isEdit,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  staff: StaffMember[];
  isEdit: boolean;
}) {
  const inputClass =
    "w-full border-2 border-orange-200 dark:border-orange-700 rounded-xl focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 dark:hover:border-orange-600 transition";

  // Live net pay preview
  const netPreview =
    (parseFloat(form.basic_salary || "0") +
      parseFloat(form.allowances || "0") -
      parseFloat(form.deductions || "0")).toFixed(2);

  return (
    <div className="grid gap-4">
      {!isEdit && (
        <div>
          <Label htmlFor="pr-staff">Staff Member *</Label>
          <select
            id="pr-staff"
            value={form.user_id}
            onChange={(e) => setForm({ ...form, user_id: e.target.value })}
            className="w-full px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-xl focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 transition"
          >
            <option value="">Select staff member</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
            ))}
          </select>
        </div>
      )}

      {!isEdit && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="pr-start">Period Start *</Label>
            <Input
              id="pr-start"
              type="date"
              value={form.pay_period_start}
              onChange={(e) => setForm({ ...form, pay_period_start: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <Label htmlFor="pr-end">Period End *</Label>
            <Input
              id="pr-end"
              type="date"
              value={form.pay_period_end}
              onChange={(e) => setForm({ ...form, pay_period_end: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="pr-basic">Basic Salary (GHS) *</Label>
        <Input
          id="pr-basic"
          type="number"
          min="0"
          step="0.01"
          placeholder="e.g. 2500.00"
          value={form.basic_salary}
          onChange={(e) => setForm({ ...form, basic_salary: e.target.value })}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pr-allow">Allowances (GHS)</Label>
          <Input
            id="pr-allow"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.allowances}
            onChange={(e) => setForm({ ...form, allowances: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <Label htmlFor="pr-ded">Deductions (GHS)</Label>
          <Input
            id="pr-ded"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.deductions}
            onChange={(e) => setForm({ ...form, deductions: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      {/* Net pay preview */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-200 dark:border-orange-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Net Pay Preview</span>
        <span className="text-lg font-bold text-orange-700 dark:text-orange-300">
          GHS {parseFloat(netPreview).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div>
        <Label htmlFor="pr-notes">Notes</Label>
        <textarea
          id="pr-notes"
          placeholder="e.g. Includes overtime bonus"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border-2 border-orange-200 dark:border-orange-700 rounded-xl focus:border-orange-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:border-orange-300 dark:hover:border-orange-600 transition resize-none"
        />
      </div>
    </div>
  );
}
