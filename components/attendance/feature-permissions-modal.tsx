"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FeaturePermissions {
  id: string;
  staff_id: string;
  leave_requests_enabled: boolean;
  planned_absence_enabled: boolean;
  attendance_exceptions_enabled: boolean;
}

interface FeaturePermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  staffName?: string;
  onSave?: (permissions: FeaturePermissions) => void;
}

export function FeaturePermissionsModal({
  isOpen,
  onClose,
  staffId,
  staffName,
  onSave,
}: FeaturePermissionsModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState<FeaturePermissions | null>(null);

  useEffect(() => {
    if (!isOpen || !staffId) return;

    const loadPermissions = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/attendance/feature-permissions?staffId=${staffId}`);
        if (!res.ok) throw new Error("Failed to load permissions");
        const data = await res.json();
        setPermissions(data.permissions);
      } catch (error) {
        console.error("[v0] Failed to load permissions:", error);
        toast({
          title: "Failed to load",
          description: "Could not retrieve permission settings.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, [isOpen, staffId, toast]);

  const handleToggle = (field: keyof FeaturePermissions) => {
    if (!permissions) return;
    setPermissions((prev) =>
      prev ? { ...prev, [field]: !prev[field] } : prev
    );
  };

  const handleSave = async () => {
    if (!permissions) return;

    setSaving(true);
    try {
      const res = await fetch("/api/attendance/feature-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          leaveRequestsEnabled: permissions.leave_requests_enabled,
          plannedAbsenceEnabled: permissions.planned_absence_enabled,
          attendanceExceptionsEnabled: permissions.attendance_exceptions_enabled,
        }),
      });

      if (!res.ok) throw new Error("Failed to save permissions");
      const data = await res.json();
      setPermissions(data.permissions);
      toast({
        title: "Permissions updated",
        description: `Feature access for ${staffName || "this staff member"} has been configured.`,
      });
      if (onSave) onSave(data.permissions);
    } catch (error) {
      console.error("[v0] Failed to save permissions:", error);
      toast({
        title: "Save failed",
        description: "Could not update permission settings.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage attendance features</DialogTitle>
          <DialogDescription>
            {staffName ? `Configure what ${staffName} can access` : "Enable or disable features for this staff member"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : permissions ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Disabled features will not appear on the staff&apos;s attendance register. This only affects the UI—approval workflows remain independent.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 transition">
                <div className="flex-1">
                  <Label className="text-base font-semibold cursor-pointer">
                    Leave requests
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Annual, sick, maternity, and emergency leave
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle("leave_requests_enabled")}
                  className={`ml-4 relative inline-flex h-8 w-14 flex-shrink-0 rounded-full transition-colors ${
                    permissions.leave_requests_enabled
                      ? "bg-emerald-600"
                      : "bg-muted-foreground/20"
                  }`}
                >
                  <span
                    className={`inline-block h-7 w-7 transform rounded-full bg-white shadow transition-transform ${
                      permissions.leave_requests_enabled
                        ? "translate-x-6"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 transition">
                <div className="flex-1">
                  <Label className="text-base font-semibold cursor-pointer">
                    Planned absences
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pre-approved absences with handover notes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle("planned_absence_enabled")}
                  className={`ml-4 relative inline-flex h-8 w-14 flex-shrink-0 rounded-full transition-colors ${
                    permissions.planned_absence_enabled
                      ? "bg-emerald-600"
                      : "bg-muted-foreground/20"
                  }`}
                >
                  <span
                    className={`inline-block h-7 w-7 transform rounded-full bg-white shadow transition-transform ${
                      permissions.planned_absence_enabled
                        ? "translate-x-6"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 transition">
                <div className="flex-1">
                  <Label className="text-base font-semibold cursor-pointer">
                    Attendance exceptions
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Explain missed or unusual attendance records
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle("attendance_exceptions_enabled")}
                  className={`ml-4 relative inline-flex h-8 w-14 flex-shrink-0 rounded-full transition-colors ${
                    permissions.attendance_exceptions_enabled
                      ? "bg-emerald-600"
                      : "bg-muted-foreground/20"
                  }`}
                >
                  <span
                    className={`inline-block h-7 w-7 transform rounded-full bg-white shadow transition-transform ${
                      permissions.attendance_exceptions_enabled
                        ? "translate-x-6"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
