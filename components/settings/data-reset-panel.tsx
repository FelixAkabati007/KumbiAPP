"use client";

import { useState } from "react";
import { AlertTriangle, Database, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ResetRow { table: string; count: number }
interface Preview { resetTables: ResetRow[]; preservedTables: string[]; accountsPreserved: boolean }

export function DataResetPanel() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadPreview = async () => {
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/data-reset", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load reset preview");
      setPreview(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load reset preview"); }
    finally { setLoading(false); }
  };

  const reset = async () => {
    if (confirmation !== "RESET OPERATIONAL DATA") return;
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/data-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reset failed");
      setMessage("Operational data was reset. Preserved configuration and user accounts were not changed.");
      setPreview(null); setConfirmation("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reset failed"); }
    finally { setLoading(false); }
  };

  return <Card className="border-destructive/30">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Database className="size-5 text-destructive" />Operational data reset</CardTitle>
      <CardDescription>Reset transactional and activity data while preserving POS, menu, inventory, rooms, settings, staff profiles, and authentication accounts.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <Alert><AlertTriangle className="size-4" /><AlertTitle>Destructive administrative action</AlertTitle><AlertDescription>This does not remove user accounts or preserved configuration. It permanently removes operational records after confirmation.</AlertDescription></Alert>
      <Button type="button" variant="outline" onClick={() => void loadPreview()} disabled={loading}><ShieldCheck data-icon="inline-start" />{loading ? "Loading preview…" : "Preview affected records"}</Button>
      {preview && <div className="flex flex-col gap-3 rounded-lg border p-4"><p className="text-sm font-semibold">Preview: {preview.resetTables.reduce((sum, row) => sum + row.count, 0).toLocaleString()} records across {preview.resetTables.filter((row) => row.count > 0).length} populated tables</p><div className="grid max-h-56 gap-2 overflow-y-auto text-sm sm:grid-cols-2">{preview.resetTables.filter((row) => row.count > 0).map((row) => <div key={row.table} className="flex justify-between gap-3"><span>{row.table}</span><span className="font-medium">{row.count.toLocaleString()}</span></div>)}</div><p className="text-xs text-muted-foreground">Preserved: {preview.preservedTables.join(", ")}</p><div className="flex flex-col gap-2"><Label htmlFor="reset-confirmation">To execute, type RESET OPERATIONAL DATA</Label><Input id="reset-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="RESET OPERATIONAL DATA" autoComplete="off" /><Button type="button" variant="destructive" disabled={loading || confirmation !== "RESET OPERATIONAL DATA"} onClick={() => void reset()}>{loading ? <Loader2 className="animate-spin" /> : "Reset operational data"}</Button></div></div>}
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    </CardContent>
  </Card>;
}
