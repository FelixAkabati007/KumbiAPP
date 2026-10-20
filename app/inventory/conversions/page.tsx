"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getInventoryItems } from "@/lib/data";
import type { InventoryItem } from "@/lib/types";
import { getInventoryUnitDimension, getInventoryUnitDimensionName, INVENTORY_BASE_UNIT_OPTIONS } from "@/lib/inventory-units";

interface ConversionRule { id: string; inventory_id: string; inventory_name?: string; purchase_unit: string; base_unit: string; conversion_factor_to_base: string; density_g_per_ml?: string | null; yield_factor: string; is_active: boolean; }
interface LiveUnit { value: string; label: string; description?: string; }
interface LiveUnitFamily { category: string; units: LiveUnit[]; }

export default function InventoryConversionsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [rules, setRules] = useState<ConversionRule[]>([]);
  const [unitFamilies, setUnitFamilies] = useState<LiveUnitFamily[]>([]);
  const [inventoryId, setInventoryId] = useState("");
  const [purchaseUnit, setPurchaseUnit] = useState("case");
  const [baseUnit, setBaseUnit] = useState("unit");
  const [factor, setFactor] = useState("1");
  const [density, setDensity] = useState("");
  const [yieldFactor, setYieldFactor] = useState("1");
  const [saving, setSaving] = useState(false);
  const [migration, setMigration] = useState<{ ready: number; missingRules: number; snapshotToken: string; items: Array<{ id: string; name: string; quantity: number; unit: string; status: string; convertedQuantity: number }> } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const selectedItem = items.find((item) => item.id === inventoryId);
  const previewLabel = inventoryId && purchaseUnit && baseUnit && factor ? `1 ${purchaseUnit} = ${factor} ${baseUnit}` : "Choose an item and units to preview the rule";

  const load = async () => {
    setLoading(true);
    setLoadError("");
    setMigration(null);
    try {
      const [inventory, response, migrationResponse, unitsResponse] = await Promise.all([
        getInventoryItems(),
        fetch("/api/v1/inventory/conversions"),
        fetch("/api/v1/inventory/conversions/migrate"),
        fetch("/api/v1/inventory/units"),
      ]);
      setItems(inventory);
      const failures: string[] = [];
      if (unitsResponse.ok && unitsResponse.headers.get("content-type")?.includes("application/json")) setUnitFamilies(await unitsResponse.json());
      else failures.push("unit catalog");
      if (response.ok) setRules(await response.json());
      else failures.push("conversion rules");
      if (migrationResponse.ok && migrationResponse.headers.get("content-type")?.includes("application/json")) {
        setMigration(await migrationResponse.json());
      } else if (migrationResponse.status !== 404) {
        failures.push("migration preview");
      }
      if (failures.length) setLoadError(`Could not load ${failures.join(" and ")}. Refresh and try again.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Some conversion data could not be loaded. Refresh and try again.");
    } finally { setLoading(false); }
  };
  useEffect(() => { load().catch(() => undefined); }, []);

  const addRule = async (event: FormEvent) => {
    event.preventDefault();
    const parsedFactor = Number(factor);
    const parsedYield = Number(yieldFactor);
    const parsedDensity = density === "" ? null : Number(density);
    const nextErrors: Record<string, string> = {};
    if (!inventoryId) nextErrors.inventoryId = "Choose an inventory item.";
    if (!purchaseUnit.trim()) nextErrors.purchaseUnit = "Enter the unit you purchase.";
    if (!Number.isFinite(parsedFactor) || parsedFactor <= 0) nextErrors.factor = "Enter a number greater than zero.";
    if (!Number.isFinite(parsedYield) || parsedYield <= 0 || parsedYield > 1) nextErrors.yieldFactor = "Enter a value from 0 to 1.";
    if (Object.keys(nextErrors).length) { setFormErrors(nextErrors); toast({ title: "Complete the conversion rule", description: "Fix the highlighted fields before saving.", variant: "destructive" }); return; }
    setFormErrors({});
    if (!Number.isFinite(parsedFactor) || parsedFactor <= 0) {
      toast({ title: "Invalid conversion factor", description: "Enter a number greater than zero.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(parsedYield) || parsedYield <= 0 || parsedYield > 1) {
      toast({ title: "Invalid yield factor", description: "Enter a value greater than 0 and no greater than 1.", variant: "destructive" });
      return;
    }
    if (parsedDensity !== null && (!Number.isFinite(parsedDensity) || parsedDensity <= 0)) {
      toast({ title: "Invalid density", description: "Enter a number greater than zero or leave it blank.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/v1/inventory/conversions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inventoryId, purchaseUnit, baseUnit, conversionFactorToBase: factor, densityGPerMl: density, yieldFactor }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save conversion");
      toast({ title: "Conversion saved", description: "The rule applies to future transactions." });
      setFactor("1"); setDensity(""); setYieldFactor("1"); await load();
    } catch (error) { toast({ title: "Could not save conversion", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const archiveRule = async (id: string) => {
    if (!window.confirm("Archive this conversion rule? Future transactions will no longer use it.")) return;
    try {
      const response = await fetch(`/api/v1/inventory/conversions?id=${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not archive conversion");
      await load();
      toast({ title: "Conversion archived" });
    } catch (error) { toast({ title: "Could not archive conversion", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); }
  };
  const migrateStock = async () => {
    if (!migration || !window.confirm(`Convert ${migration.ready} eligible stock item(s) to base units? Physical stock is preserved; yield is not applied.`)) return;
    setMigrating(true);
    try {
      const response = await fetch("/api/v1/inventory/conversions/migrate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotToken: migration?.snapshotToken }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Migration failed");
      toast({ title: "Stock migration complete", description: `${data.migrated} item(s) converted. ${data.skipped} item(s) remain unchanged until a rule is added.` });
      await load();
    } catch (error) { toast({ title: "Stock migration failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }); }
    finally { setMigrating(false); }
  };

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8"><div className="mx-auto flex max-w-6xl flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><Button asChild variant="ghost" size="sm"><Link href="/inventory"><ArrowLeft data-icon="inline-start" />Inventory</Link></Button><h1 className="mt-3 text-3xl font-semibold tracking-tight">Unit conversions</h1><p className="mt-1 text-muted-foreground">Item-specific purchasing rules for accurate receiving, costing, and recipe usage.</p></div><Badge variant="secondary">Tier 1 controls</Badge></div>
    {loadError && <Card className="border-destructive/40"><CardContent className="p-4 text-sm text-destructive">{loadError} Refresh the page and try again.</CardContent></Card>}
    {migration && <Card className="border-primary/30"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-medium">Data maintenance: review stock migration</p><p className="text-sm text-muted-foreground">{migration.ready} item(s) can be converted from purchase units to base units. Received stock is preserved; yield is not applied. {migration.missingRules > 0 && <span className="text-destructive">{migration.missingRules} item(s) need a rule and will remain unchanged.</span>}</p></div><Button onClick={migrateStock} disabled={loading || migrating || migration.ready === 0}>{migrating ? "Migrating…" : "Review and convert stock"}</Button></CardContent></Card>}
    <Card>
      <CardHeader><CardTitle>Live unit families</CardTitle><p className="text-sm text-muted-foreground">Available units are grouped by measurement family. Choose a recipe unit from the same family as the inventory stock unit.</p></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {unitFamilies.filter((family) => family.category !== "Operational Management Units").map((family) => {
          const units = family.units.filter((unit) => getInventoryUnitDimension(unit.value) !== "unknown");
          if (!units.length) return null;
          return <div key={family.category} className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2"><p className="font-medium">{getInventoryUnitDimensionName(units[0].value)}</p><Badge variant="outline">{units.length} units</Badge></div>
            <div className="mt-3 flex flex-wrap gap-2">{units.map((unit) => <span key={unit.value} className="rounded-md bg-background px-2 py-1 text-xs" title={unit.description}>{unit.label} <span className="text-muted-foreground">({unit.value})</span></span>)}</div>
            <p className="mt-3 text-xs text-muted-foreground">Recipe units: {units.map((unit) => unit.value).join(", ")}</p>
          </div>;
        })}
        {unitFamilies.length === 0 && <p className="text-sm text-muted-foreground">Loading live units…</p>}
      </CardContent>
    </Card>
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus /> Add conversion rule</CardTitle><p className="text-sm text-muted-foreground">Tell the system how one purchased package becomes recipe units.</p></CardHeader><CardContent><form onSubmit={addRule} className="flex flex-col gap-4"><div className="grid gap-2"><Label htmlFor="inventory-item">1. Inventory item</Label><Select value={inventoryId} onValueChange={setInventoryId}><SelectTrigger id="inventory-item" aria-invalid={Boolean(formErrors.inventoryId)}><SelectValue placeholder="Choose an item" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>{formErrors.inventoryId && <p className="text-xs text-destructive">{formErrors.inventoryId}</p>}{selectedItem && <p className="text-xs text-muted-foreground">Current stock: {selectedItem.quantity} {selectedItem.unit}</p>}</div><div className="grid gap-2"><Label htmlFor="purchase-unit">2. Purchased as</Label><Input id="purchase-unit" value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} placeholder="case, bag, bottle" aria-invalid={Boolean(formErrors.purchaseUnit)} />{formErrors.purchaseUnit && <p className="text-xs text-destructive">{formErrors.purchaseUnit}</p>}<p className="text-xs text-muted-foreground">The package or unit shown on the supplier invoice.</p></div><div className="grid gap-2"><Label htmlFor="base-unit">3. Recipe uses</Label><Select value={baseUnit} onValueChange={setBaseUnit}><SelectTrigger id="base-unit"><SelectValue /></SelectTrigger><SelectContent>{INVENTORY_BASE_UNIT_OPTIONS.map((unit) => <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Choose a unit from the same measurement family unless density is provided.</p></div><div className="rounded-lg border border-primary/30 bg-primary/5 p-4"><p className="text-sm font-medium">Rule preview</p><p className="mt-1 text-lg font-semibold">{previewLabel}</p><p className="mt-1 text-xs text-muted-foreground">Enter how many recipe/base units are in one purchased unit.</p></div><div className="grid gap-2"><Label htmlFor="factor">Base units in 1 purchased unit</Label><Input id="factor" type="number" min="0.000001" step="any" value={factor} onChange={(e) => setFactor(e.target.value)} aria-invalid={Boolean(formErrors.factor)} />{formErrors.factor && <p className="text-xs text-destructive">{formErrors.factor}</p>}<p className="text-xs text-muted-foreground">Example: 1 case = 24 units, so enter 24.</p></div><div className="grid gap-2 border-t pt-4"><Label htmlFor="yield-factor">Usable yield after preparation</Label><Input id="yield-factor" type="number" min="0.000001" max="1" step="any" inputMode="decimal" value={yieldFactor} onChange={(e) => setYieldFactor(e.target.value)} aria-describedby="yield-factor-help" aria-invalid={Boolean(formErrors.yieldFactor)} />{formErrors.yieldFactor && <p className="text-xs text-destructive">{formErrors.yieldFactor}</p>}<p id="yield-factor-help" className="text-xs text-muted-foreground">Use 1 for no loss, or a decimal below 1 for trim, spoilage, or preparation loss. Yield never changes received physical stock.</p></div><div className="grid gap-2"><Label htmlFor="density">Density <span className="text-muted-foreground">(only for weight ↔ volume)</span></Label><Input id="density" type="number" min="0.000001" step="any" value={density} onChange={(e) => setDensity(e.target.value)} placeholder="Example: 1.03 g/ml" /><p className="text-xs text-muted-foreground">Leave blank for same-family conversions.</p></div><Button type="submit" disabled={saving || loading || !inventoryId}><Plus data-icon="inline-start" />{saving ? "Saving…" : "Save conversion rule"}</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle>Active conversion rules</CardTitle><p className="text-sm text-muted-foreground">These rules are used for receiving, costing, and recipe deductions. Archive a rule when it should no longer apply to future transactions.</p></CardHeader><CardContent><div className="flex flex-col gap-3">{rules.filter((rule) => rule.is_active).map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><p className="font-medium">{rule.inventory_name ?? rule.inventory_id}</p><p className="text-sm text-muted-foreground">1 {rule.purchase_unit} = {rule.conversion_factor_to_base} {rule.base_unit} · yield {rule.yield_factor}</p>{rule.density_g_per_ml && <p className="text-xs text-muted-foreground">Density {rule.density_g_per_ml} g/ml</p>}</div><Button variant="outline" size="sm" onClick={() => archiveRule(rule.id)}><Archive data-icon="inline-start" />Archive</Button></div>)}{rules.filter((rule) => rule.is_active).length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No item-specific rules yet. Add packaging conversions to make receiving and recipe deductions auditable.</p>}</div></CardContent></Card>
    </div>
  </div></main>;
}
