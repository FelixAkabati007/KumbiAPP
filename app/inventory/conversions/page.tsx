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

  const load = async () => {
    const [inventory, response, migrationResponse, unitsResponse] = await Promise.all([getInventoryItems(), fetch("/api/v1/inventory/conversions"), fetch("/api/v1/inventory/conversions/migrate"), fetch("/api/v1/units")]);
    setItems(inventory);
    if (unitsResponse.ok) setUnitFamilies(await unitsResponse.json());
    if (response.ok) setRules(await response.json());
    if (migrationResponse.ok) setMigration(await migrationResponse.json());
  };
  useEffect(() => { load().catch(() => undefined); }, []);

  const addRule = async (event: FormEvent) => {
    event.preventDefault();
    const parsedFactor = Number(factor);
    const parsedYield = Number(yieldFactor);
    const parsedDensity = density === "" ? null : Number(density);
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

  const archiveRule = async (id: string) => { await fetch(`/api/v1/inventory/conversions?id=${id}`, { method: "DELETE" }); await load(); toast({ title: "Conversion archived" }); };
  const migrateStock = async () => {
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
    {migration && <Card className="border-primary/30"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-medium">Current stock migration</p><p className="text-sm text-muted-foreground">{migration.ready} item(s) are ready to convert physical stock to base units. Yield is not applied during migration; it is reserved for usable-output calculations. {migration.missingRules > 0 && <span className="text-destructive">{migration.missingRules} item(s) need a conversion rule and will remain unchanged.</span>}</p></div><Button onClick={migrateStock} disabled={migrating || migration.ready === 0}>{migrating ? "Migrating…" : "Convert current stock"}</Button></CardContent></Card>}
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
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus /> Add rule</CardTitle></CardHeader><CardContent><form onSubmit={addRule} className="flex flex-col gap-4"><div className="grid gap-2"><Label>Inventory item</Label><Select value={inventoryId} onValueChange={setInventoryId}><SelectTrigger><SelectValue placeholder="Choose an item" /></SelectTrigger><SelectContent>{items.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Purchase unit</Label><Input value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} placeholder="case, bag, bottle" /></div><div className="grid gap-2"><Label>Base unit</Label><Select value={baseUnit} onValueChange={setBaseUnit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INVENTORY_BASE_UNIT_OPTIONS.map((unit) => <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Base units per purchase unit</Label><Input type="number" min="0.000001" step="any" value={factor} onChange={(e) => setFactor(e.target.value)} /><p className="text-xs text-muted-foreground">Example: 1 case = 24 units, so enter 24.</p></div><div className="grid gap-2"><Label>Yield factor</Label><Input type="number" min="0.000001" max="1" step="any" inputMode="decimal" value={yieldFactor} onChange={(e) => setYieldFactor(e.target.value)} aria-describedby="yield-factor-help" /><p id="yield-factor-help" className="text-xs text-muted-foreground">Enter 1 for no loss, or a decimal below 1 for trim, spoilage, or preparation loss.</p></div><div className="grid gap-2"><Label>Density g/ml <span className="text-muted-foreground">(optional)</span></Label><Input type="number" min="0.000001" step="any" value={density} onChange={(e) => setDensity(e.target.value)} placeholder="Only for mass ↔ volume" /></div><Button type="submit" disabled={saving || !inventoryId}><Plus data-icon="inline-start" />{saving ? "Saving…" : "Save conversion"}</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle>Active conversion rules</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-3">{rules.filter((rule) => rule.is_active).map((rule) => <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><p className="font-medium">{rule.inventory_name ?? rule.inventory_id}</p><p className="text-sm text-muted-foreground">1 {rule.purchase_unit} = {rule.conversion_factor_to_base} {rule.base_unit} · yield {rule.yield_factor}</p>{rule.density_g_per_ml && <p className="text-xs text-muted-foreground">Density {rule.density_g_per_ml} g/ml</p>}</div><Button variant="outline" size="sm" onClick={() => archiveRule(rule.id)}><Archive data-icon="inline-start" />Archive</Button></div>)}{rules.filter((rule) => rule.is_active).length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No item-specific rules yet. Add packaging conversions to make receiving and recipe deductions auditable.</p>}</div></CardContent></Card>
    </div>
  </div></main>;
}
