"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Filter, Loader2, Search, ShieldCheck } from "lucide-react";

export interface StaffPermissionRow {
  staff_id: string;
  staff_name: string;
  department?: string | null;
  job_classification?: string | null;
  position?: string | null;
  role?: string | null;
  leave_requests_enabled: boolean;
  planned_absence_enabled: boolean;
  attendance_exceptions_enabled: boolean;
}

type Feature = "leaveRequestsEnabled" | "plannedAbsenceEnabled" | "attendanceExceptionsEnabled";

export const PRESET_DEPARTMENTS = [
  { value: "all", label: "All departments" },
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurant" },
  { value: "operations", label: "Operations" },
  { value: "hotel_restaurant", label: "Hotel & Restaurant" },
  { value: "hotel_operations", label: "Hotel Operations" },
] as const;

export function BulkFeaturePermissions({
  accounts,
  onChange,
}: {
  accounts: StaffPermissionRow[];
  onChange: (rows: StaffPermissionRow[]) => void;
}) {
  const [department, setDepartment] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Dynamically extract available roles/classifications from loaded accounts
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    accounts.forEach((acc) => {
      const label = acc.job_classification || acc.position || acc.role;
      if (label && label.trim()) roles.add(label.trim());
    });
    return Array.from(roles).sort();
  }, [accounts]);

  // Dynamically extract any custom departments
  const customDepartments = useMemo(() => {
    const presetValues = new Set<string>(["all", "hotel", "restaurant", "operations", "hotel_restaurant", "hotel_operations", "unassigned"]);
    const extra = new Set<string>();
    accounts.forEach((acc) => {
      const dept = acc.department?.trim();
      if (dept && !presetValues.has(dept.toLowerCase())) {
        extra.add(dept);
      }
    });
    return Array.from(extra).sort();
  }, [accounts]);

  const visible = useMemo(() => {
    return accounts.filter((account) => {
      // 1. Department match
      const dept = (account.department || "unassigned").toLowerCase();
      if (department !== "all") {
        if (department === "hotel_restaurant") {
          if (!dept.includes("hotel") && !dept.includes("restaurant")) return false;
        } else if (department === "hotel_operations") {
          if (!dept.includes("hotel") && !dept.includes("operation")) return false;
        } else if (department === "hotel") {
          if (!dept.includes("hotel")) return false;
        } else if (department === "restaurant") {
          if (!dept.includes("restaurant")) return false;
        } else if (department === "operations") {
          if (!dept.includes("operation")) return false;
        } else if (department === "unassigned") {
          if (account.department && account.department !== "unassigned") return false;
        } else {
          if (dept !== department.toLowerCase()) return false;
        }
      }

      // 2. Role match
      if (roleFilter !== "all") {
        const staffRole = (account.job_classification || account.position || account.role || "").toLowerCase();
        if (staffRole !== roleFilter.toLowerCase()) return false;
      }

      // 3. Search match
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const name = (account.staff_name || "").toLowerCase();
        const role = (account.job_classification || account.position || account.role || "").toLowerCase();
        const d = (account.department || "").toLowerCase();
        if (!name.includes(query) && !role.includes(query) && !d.includes(query)) return false;
      }

      return true;
    });
  }, [accounts, department, roleFilter, searchQuery]);

  const allVisibleSelected = visible.length > 0 && visible.every((account) => selected.includes(account.staff_id));
  const enabledCount = accounts.filter(
    (account) => account.leave_requests_enabled || account.planned_absence_enabled || account.attendance_exceptions_enabled,
  ).length;

  function toggleAll() {
    setSelected(
      allVisibleSelected
        ? selected.filter((id) => !visible.some((account) => account.staff_id === id))
        : Array.from(new Set([...selected, ...visible.map((account) => account.staff_id)])),
    );
  }

  function toggleOne(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function apply(feature?: Feature, value = true) {
    const hasSpecificSelection = selected.length > 0;
    const deptLabel = PRESET_DEPARTMENTS.find((d) => d.value === department)?.label || department;
    const targetDescription = hasSpecificSelection
      ? `${selected.length} selected account${selected.length === 1 ? "" : "s"}`
      : department === "all"
      ? "ALL active staff accounts across all departments"
      : `all accounts in ${deptLabel}`;

    const featureLabel = feature
      ? feature.replace(/Enabled$/, "").replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).trim()
      : "all register features (Leave, Planned Absence, and Attendance Exceptions)";

    const confirmed = window.confirm(`Set ${featureLabel} ${value ? "ON" : "OFF"} for ${targetDescription}?`);
    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    const body: Record<string, unknown> = {
      staffIds: selected,
      applyToDepartment: !hasSpecificSelection,
      department: department,
    };

    if (feature) {
      body[feature] = value;
    } else {
      Object.assign(body, {
        leaveRequestsEnabled: value,
        plannedAbsenceEnabled: value,
        attendanceExceptionsEnabled: value,
      });
    }

    try {
      const response = await fetch("/api/attendance/feature-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error || "Unable to update permissions.");
      } else {
        onChange(data.permissions ?? []);
        setSelected([]);
        setMessage(`Successfully updated ${data.updatedCount ?? 0} staff account${data.updatedCount === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      console.error("[bulk-permissions] update error:", err);
      setMessage("An unexpected error occurred while saving permissions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
      {/* Header and Global Actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            <h2 className="text-xl font-semibold">Register feature access &amp; sync</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Enable or disable register features across departments (Hotel, Restaurant, Hotel Operations) or individual staff accounts.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{accounts.length} active workforce accounts</span>
            <span>{enabledCount} with active permissions</span>
            <span>{visible.length} matching current filter</span>
          </div>
        </div>

        {/* Global enable/disable all three */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply(undefined, true)}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
          >
            Enable all three
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply(undefined, false)}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-destructive/40 bg-background px-4 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
          >
            Disable all three
          </button>
        </div>
      </div>

      {/* Filter Toolbar: Department, Role & Search */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Department Filter */}
        <label className="relative flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Department
          <div className="relative">
            <select
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setSelected([]);
              }}
              className="min-h-10 w-full appearance-none rounded-xl border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {PRESET_DEPARTMENTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
              {customDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-muted-foreground" />
          </div>
        </label>

        {/* Role/Classification Filter */}
        <label className="relative flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
          Role / Classification
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setSelected([]);
              }}
              className="min-h-10 w-full appearance-none rounded-xl border border-border bg-background py-2 pl-3 pr-8 text-sm text-foreground focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="all">All roles</option>
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <Filter className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-muted-foreground" />
          </div>
        </label>

        {/* Staff Search Input */}
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
          Search staff
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, role, or department…"
              className="min-h-10 w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          </div>
        </label>
      </div>

      {/* Selection Control Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{selected.length}</span>
          <span>of {visible.length} selected</span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="ml-2 text-xs font-semibold text-orange-600 hover:underline dark:text-orange-400"
            >
              Clear selection
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={toggleAll}
          className="text-sm font-semibold text-orange-600 hover:underline dark:text-orange-400"
        >
          {allVisibleSelected ? "Deselect all visible" : `Select all visible (${visible.length})`}
        </button>
      </div>

      {/* Staff Accounts Grid */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((account) => {
          const isSelected = selected.includes(account.staff_id);
          const dept = account.department || "Restaurant";
          const deptBadgeClass =
            dept.toLowerCase().includes("hotel")
              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
              : dept.toLowerCase().includes("restaurant")
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";

          return (
            <label
              key={account.staff_id}
              className={`relative flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                isSelected
                  ? "border-orange-500 bg-orange-50/50 dark:border-orange-600 dark:bg-orange-950/20"
                  : "border-border bg-card hover:border-orange-200 dark:hover:border-orange-800"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleOne(account.staff_id)}
                className="mt-1 h-4 w-4 rounded accent-orange-600"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-foreground">{account.staff_name}</span>
                  {isSelected && <Check className="h-4 w-4 text-orange-600 dark:text-orange-400 shrink-0" />}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${deptBadgeClass}`}>{dept}</span>
                  {(account.job_classification || account.position || account.role) && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {account.job_classification || account.position || account.role}
                    </span>
                  )}
                </div>

                {/* Feature Chips */}
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      account.leave_requests_enabled
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    Leave {account.leave_requests_enabled ? "on" : "off"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      account.planned_absence_enabled
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    Planned {account.planned_absence_enabled ? "on" : "off"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      account.attendance_exceptions_enabled
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    Exceptions {account.attendance_exceptions_enabled ? "on" : "off"}
                  </span>
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="mt-4 rounded-xl border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
          No workforce accounts match the selected department and role filter.
        </p>
      )}

      {/* Selected Account Granular Actions */}
      {selected.length > 0 && (
        <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50/40 p-4 dark:border-orange-800 dark:bg-orange-950/20">
          <p className="text-sm font-semibold text-foreground">
            Apply to {selected.length} selected account{selected.length === 1 ? "" : "s"}:
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply("leaveRequestsEnabled", true)}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              Enable leave requests
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply("leaveRequestsEnabled", false)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
            >
              Disable leave requests
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply("plannedAbsenceEnabled", true)}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              Enable planned absence
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply("plannedAbsenceEnabled", false)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
            >
              Disable planned absence
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply("attendanceExceptionsEnabled", true)}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              Enable exceptions
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply("attendanceExceptionsEnabled", false)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
            >
              Disable exceptions
            </button>
          </div>
          {busy && (
            <span className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-600" />
              Saving permission changes…
            </span>
          )}
        </div>
      )}

      {message && (
        <p role="status" className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
          {message}
        </p>
      )}
    </div>
  );
}
